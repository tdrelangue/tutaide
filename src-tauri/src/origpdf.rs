//! Working with OrigPDF (OrigAI's PDF workstation) on the same computer.
//!
//! Both apps share one folder, `<local data>/OrigAI/Tutellia/`:
//! - `inbox/<id>.pdf` + `inbox/<id>.json`: documents sent from OrigPDF, waiting
//!   to be filed. They wait there even while Tutellia is closed; they leave the
//!   inbox only once filed in a dossier (or when the person discards them).
//! - `outbox/`: documents Tutellia handed to OrigPDF ("Ouvrir dans OrigPDF").
//! - `info.json`: Tutellia's version and the modules the person uses, so
//!   OrigPDF offers only those. No personal data.
//!
//! Nothing goes over the network and OrigPDF never signs in to Tutellia: the
//! page files inbox documents with the person's own session, after they choose.
//! Every command checks the calling page is Tutellia itself.

use crate::remote::{self, is_trusted_app_page, MAX_DOCUMENT_BYTES};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Webview};

pub const MODULES: [&str; 3] = ["APA", "ASH", "PCH"];
const MAX_ID_LEN: usize = 64;
const MAX_INBOX_ITEMS: usize = 200;

/// The shared folder (created on demand).
fn shared_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().local_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("OrigAI").join("Tutellia"))
}

fn ensure_dir(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())
}

fn require_trusted(app: &AppHandle, webview: &Webview) -> Result<(), String> {
    if is_trusted_app_page(app, webview) {
        Ok(())
    } else {
        Err("Non autorisé".into())
    }
}

// ---------------------------------------------------------------------------
// Is OrigPDF installed?
// ---------------------------------------------------------------------------

/// One value from `reg query` output ("    Name    REG_SZ    value").
fn parse_reg_value(output: &str, name: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let mut parts = line.trim().splitn(3, "    ");
        let (key, kind, value) = (parts.next()?, parts.next()?, parts.next()?);
        (key == name && kind.starts_with("REG_")).then(|| value.trim().trim_matches('"').to_string())
    })
}

#[cfg(target_os = "windows")]
fn origpdf_executable() -> Option<PathBuf> {
    use crate::NoWindow;
    const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\OrigPDF";
    ["HKCU", "HKLM"].iter().find_map(|hive| {
        let output = std::process::Command::new("reg")
            .args(["query", &format!(r"{hive}\{KEY}")])
            .no_window()
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let folder = parse_reg_value(&text, "InstallLocation")?;
        let binary = parse_reg_value(&text, "MainBinaryName").unwrap_or_else(|| "orig-pdf-desktop.exe".into());
        let exe = Path::new(&folder).join(binary);
        exe.is_file().then_some(exe)
    })
}

#[cfg(target_os = "macos")]
fn origpdf_executable() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut candidates = vec![PathBuf::from("/Applications/OrigPDF.app")];
    candidates.extend(home.map(|h| h.join("Applications/OrigPDF.app")));
    candidates.into_iter().find(|p| p.is_dir())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn origpdf_executable() -> Option<PathBuf> {
    None
}

/// Starts OrigPDF on `file`. Already open (even in the tray), OrigPDF brings
/// its window forward and opens the file in a new tab; closed, it starts.
fn launch_origpdf(app_path: &Path, file: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg("-a").arg(app_path);
        c
    };
    #[cfg(not(target_os = "macos"))]
    let mut cmd = std::process::Command::new(app_path);
    cmd.arg(file).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrigPdfStatus {
    installed: bool,
}

#[tauri::command]
pub fn origpdf_status(app: AppHandle, webview: Webview) -> Result<OrigPdfStatus, String> {
    require_trusted(&app, &webview)?;
    Ok(OrigPdfStatus { installed: origpdf_executable().is_some() })
}

/// Saves a PDF the page downloaded (with the person's session) to the outbox
/// and opens it in OrigPDF. PDF only, recognised by its content.
#[tauri::command]
pub fn open_in_origpdf(app: AppHandle, webview: Webview, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    require_trusted(&app, &webview)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Contenu attendu".into());
    };
    if bytes.len() > MAX_DOCUMENT_BYTES {
        return Err("Document trop volumineux".into());
    }
    if remote::document_extension(bytes) != Some("pdf") {
        return Err("Seuls les PDF s'ouvrent dans OrigPDF".into());
    }
    let exe = origpdf_executable().ok_or("OrigPDF n'est pas installé sur cet ordinateur")?;
    let raw_name = request
        .headers()
        .get("x-filename")
        .and_then(|v| v.to_str().ok())
        .map(remote::percent_decode)
        .unwrap_or_default();
    let outbox = shared_dir(&app)?.join("outbox");
    ensure_dir(&outbox)?;
    let path = remote::write_new_file(&outbox, &remote::safe_file_name(&raw_name, "pdf"), bytes)?;
    launch_origpdf(&exe, &path)
}

// ---------------------------------------------------------------------------
// Inbox: documents sent from OrigPDF
// ---------------------------------------------------------------------------

/// What OrigPDF writes next to each PDF (`<id>.json`, written last).
#[derive(Deserialize)]
struct InboxNote {
    module: String,
    name: String,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    id: String,
    module: String,
    name: String,
    sent_at: String,
    size: u64,
}

/// Ids are OrigPDF's own (`<millis>-<hex>`): never a path.
fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// One inbox entry, if complete and well-formed (a half-written one is skipped).
fn read_inbox_item(dir: &Path, id: &str) -> Option<InboxItem> {
    let note: InboxNote = serde_json::from_str(&std::fs::read_to_string(dir.join(format!("{id}.json"))).ok()?).ok()?;
    if !MODULES.contains(&note.module.as_str()) {
        return None;
    }
    let size = std::fs::metadata(dir.join(format!("{id}.pdf"))).ok()?.len();
    if size == 0 || size > MAX_DOCUMENT_BYTES as u64 {
        return None;
    }
    let name: String = note.name.chars().filter(|c| !c.is_control()).take(150).collect();
    Some(InboxItem { id: id.to_string(), module: note.module, name, sent_at: note.sent_at, size })
}

/// Entries of `dir`, oldest first.
fn list_inbox(dir: &Path) -> Vec<InboxItem> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut items: Vec<InboxItem> = entries
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter_map(|file| file.strip_suffix(".json").map(str::to_string))
        .filter(|id| is_valid_id(id))
        .filter_map(|id| read_inbox_item(dir, &id))
        .collect();
    items.sort_by(|a, b| a.sent_at.cmp(&b.sent_at).then_with(|| a.id.cmp(&b.id)));
    items.truncate(MAX_INBOX_ITEMS);
    items
}

#[tauri::command]
pub fn origpdf_inbox_list(app: AppHandle, webview: Webview) -> Result<Vec<InboxItem>, String> {
    require_trusted(&app, &webview)?;
    Ok(list_inbox(&shared_dir(&app)?.join("inbox")))
}

/// The PDF bytes of one entry (raw, no JSON).
#[tauri::command]
pub fn origpdf_inbox_read(app: AppHandle, webview: Webview, id: String) -> Result<tauri::ipc::Response, String> {
    require_trusted(&app, &webview)?;
    if !is_valid_id(&id) {
        return Err("Document inconnu".into());
    }
    let dir = shared_dir(&app)?.join("inbox");
    read_inbox_item(&dir, &id).ok_or("Document inconnu")?;
    let bytes = std::fs::read(dir.join(format!("{id}.pdf"))).map_err(|e| e.to_string())?;
    if remote::document_extension(&bytes) != Some("pdf") {
        return Err("Ce document n'est pas un PDF".into());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

/// Removes one entry: once filed in a dossier, or discarded by the person.
fn remove_inbox_item(dir: &Path, id: &str) -> Result<(), String> {
    if !is_valid_id(id) {
        return Err("Document inconnu".into());
    }
    for ext in ["json", "pdf"] {
        match std::fs::remove_file(dir.join(format!("{id}.{ext}"))) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn origpdf_inbox_remove(app: AppHandle, webview: Webview, id: String) -> Result<(), String> {
    require_trusted(&app, &webview)?;
    remove_inbox_item(&shared_dir(&app)?.join("inbox"), &id)
}

// ---------------------------------------------------------------------------
// info.json: what OrigPDF may offer
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TutelliaInfo<'a> {
    version: u32,
    app_version: &'a str,
    modules: Vec<&'static str>,
}

/// Known modules only, in a fixed order, without duplicates.
fn known_modules(modules: &[String]) -> Vec<&'static str> {
    MODULES.iter().copied().filter(|m| modules.iter().any(|x| x == m)).collect()
}

/// The page reports the modules the signed-in person uses (none when they
/// cannot work on dossiers). Atomic write: OrigPDF never reads half a file.
#[tauri::command]
pub fn origpdf_report_modules(app: AppHandle, webview: Webview, modules: Vec<String>) -> Result<(), String> {
    require_trusted(&app, &webview)?;
    let dir = shared_dir(&app)?;
    ensure_dir(&dir)?;
    ensure_dir(&dir.join("inbox"))?;
    let version = app.package_info().version.to_string();
    let info = TutelliaInfo { version: 1, app_version: &version, modules: known_modules(&modules) };
    let text = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    let temp = dir.join("info.json.tmp");
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, dir.join("info.json")).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tutellia-origpdf-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(dir: &Path, id: &str, module: &str, sent_at: &str) {
        std::fs::write(dir.join(format!("{id}.pdf")), b"%PDF-1.7 test").unwrap();
        let note = format!(r#"{{"version":1,"module":"{module}","name":"Relevé.pdf","sentAt":"{sent_at}","from":"OrigPDF"}}"#);
        std::fs::write(dir.join(format!("{id}.json")), note).unwrap();
    }

    #[test]
    fn reads_registry_values_with_spaces_and_quotes() {
        let out = "\r\nHKEY_CURRENT_USER\\...\\OrigPDF\r\n    InstallLocation    REG_SZ    \"C:\\Users\\a b\\AppData\\Local\\OrigPDF\"\r\n    MainBinaryName    REG_SZ    orig-pdf-desktop.exe\r\n";
        assert_eq!(parse_reg_value(out, "InstallLocation").as_deref(), Some("C:\\Users\\a b\\AppData\\Local\\OrigPDF"));
        assert_eq!(parse_reg_value(out, "MainBinaryName").as_deref(), Some("orig-pdf-desktop.exe"));
        assert_eq!(parse_reg_value(out, "DisplayVersion"), None);
    }

    #[test]
    fn ids_can_never_be_paths() {
        assert!(is_valid_id("1763542000000-a1b2c3"));
        for bad in ["", "../x", "a/b", "a\\b", "a.pdf", "C:", &"a".repeat(65)] {
            assert!(!is_valid_id(bad), "{bad}");
        }
    }

    #[test]
    fn lists_complete_entries_oldest_first_and_skips_the_rest() {
        let dir = temp_dir("list");
        put(&dir, "2-b", "ASH", "2026-11-19T10:00:00Z");
        put(&dir, "1-a", "APA", "2026-11-18T10:00:00Z");
        put(&dir, "3-c", "XYZ", "2026-11-19T11:00:00Z"); // unknown module
        std::fs::write(dir.join("4-d.pdf"), b"%PDF-").unwrap(); // note not written yet
        let ids: Vec<String> = list_inbox(&dir).into_iter().map(|i| i.id).collect();
        assert_eq!(ids, ["1-a", "2-b"]);
    }

    #[test]
    fn removing_deletes_both_files_and_tolerates_missing_ones() {
        let dir = temp_dir("remove");
        put(&dir, "1-a", "PCH", "2026-11-19T10:00:00Z");
        remove_inbox_item(&dir, "1-a").unwrap();
        assert!(list_inbox(&dir).is_empty());
        assert!(!dir.join("1-a.pdf").exists());
        remove_inbox_item(&dir, "1-a").unwrap();
        assert!(remove_inbox_item(&dir, "../1-a").is_err());
    }

    #[test]
    fn only_known_modules_in_a_fixed_order() {
        let given = vec!["PCH".to_string(), "FOO".into(), "APA".into(), "APA".into()];
        assert_eq!(known_modules(&given), ["APA", "PCH"]);
    }
}
