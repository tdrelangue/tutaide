//! "Serveur de ma structure": commands for choosing where Tutellia comes from,
//! the minimal permissions granted to the organisation's server, and opening a
//! downloaded document (macOS webviews cannot open downloads themselves).
//!
//! Every command checks which page calls it (`webview.url()`), on top of the
//! per-capability permissions: the organisation's server can never change the
//! connection, and can only hand over PDFs and images to open.

use crate::connection::{self, Connection, Saved};
use std::io::Write;
use std::sync::Mutex;
use tauri::{ipc::CapabilityBuilder, AppHandle, Manager, Url, Webview};

/// URL of the bundled start-up page (where the connection is chosen).
pub struct LauncherUrl(pub Mutex<Option<Url>>);

/// Origins of the local server (release and development).
const LOCAL_ORIGINS: [&str; 2] = ["http://localhost:3456", "http://localhost:3000"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    mode: &'static str,
    url: Option<String>,
    app_version: String,
}

fn config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

pub fn saved(app: &AppHandle) -> Saved {
    config_dir(app)
        .map(|dir| connection::load(&dir))
        .unwrap_or(Saved::Invalid)
}

/// scheme://host[:port] — explicit, because `Url::origin()` is opaque (and
/// serialises as "null") for custom schemes like tauri://localhost.
fn origin_of(url: &Url) -> String {
    let host = url.host_str().unwrap_or("");
    match url.port() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    }
}

fn caller_origin(webview: &Webview) -> Option<String> {
    webview.url().ok().map(|url| origin_of(&url))
}

fn launcher_origin(app: &AppHandle) -> Option<String> {
    app.state::<LauncherUrl>().0.lock().ok()?.as_ref().map(origin_of)
}

fn is_launcher(app: &AppHandle, webview: &Webview) -> bool {
    matches!(
        (caller_origin(webview), launcher_origin(app)),
        (Some(a), Some(b)) if a == b && !a.ends_with("://")
    )
}

/// The local server, or the organisation server this PC is set to.
pub fn is_trusted_app_page(app: &AppHandle, webview: &Webview) -> bool {
    let Some(caller) = caller_origin(webview) else { return false };
    if LOCAL_ORIGINS.contains(&caller.as_str()) {
        return true;
    }
    matches!(saved(app), Saved::Valid(Connection::Server { url }) if url == caller)
}

/// The bundled start-up page or the local server (never a remote page).
pub fn is_local_page(app: &AppHandle, webview: &Webview) -> bool {
    is_launcher(app, webview)
        || caller_origin(webview).is_some_and(|o| LOCAL_ORIGINS.contains(&o.as_str()))
}

#[tauri::command]
pub fn get_connection(app: AppHandle) -> ConnectionInfo {
    let app_version = app.package_info().version.to_string();
    let (mode, url) = match saved(&app) {
        Saved::Valid(Connection::Local) => ("local", None),
        Saved::Valid(Connection::Server { url }) => ("server", Some(url)),
        Saved::Invalid => ("invalid", None),
    };
    ConnectionInfo { mode, url, app_version }
}

/// Saves the choice and restarts the app, which then starts the right way.
/// Only the bundled start-up page may do this.
#[tauri::command]
pub fn set_connection(
    app: AppHandle,
    webview: Webview,
    mode: String,
    url: Option<String>,
) -> Result<(), String> {
    if !is_launcher(&app, &webview) {
        return Err("Non autorisé".into());
    }
    let connection = match mode.as_str() {
        "local" => Connection::Local,
        "server" => Connection::Server {
            url: connection::normalize_server_url(url.as_deref().unwrap_or(""))?,
        },
        _ => return Err("Mode inconnu".into()),
    };
    connection::save(&config_dir(&app)?, &connection)?;
    app.restart();
}

/// Back to the start-up page, on its "choose the connection" screen.
#[tauri::command]
pub fn open_connection_settings(app: AppHandle) -> Result<(), String> {
    let mut launcher = app
        .state::<LauncherUrl>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Écran de démarrage indisponible".to_string())?;
    launcher.set_query(Some("choose=1"));
    let window = app.get_webview_window("main").ok_or("Fenêtre introuvable")?;
    window.navigate(launcher).map_err(|e| e.to_string())
}

/// The organisation's server may use only what its pages need from the
/// desktop app: update checks (OrigAI's own update addresses, see
/// check_for_update), restart after an update, opening a PDF/image, and the
/// connection screen. Never file dialogs, launching programs, or changing the
/// connection itself.
pub fn grant_server_permissions(app: &AppHandle, origin: &str) -> tauri::Result<()> {
    app.add_capability(
        CapabilityBuilder::new("organisation-server")
            .remote(format!("{origin}/*"))
            .window("main")
            .permission("core:default")
            // No "updater:allow-check": the plugin's own check takes options
            // from the page; the server goes through check_for_update instead.
            .permission("updater:allow-download-and-install")
            .permission("process:allow-restart")
            .permission("allow-check-for-update")
            .permission("allow-kill-server")
            .permission("allow-get-connection")
            .permission("allow-open-connection-settings")
            .permission("allow-save-and-open"),
    )
}

// ---------------------------------------------------------------------------
// Opening a document
// ---------------------------------------------------------------------------

const MAX_DOCUMENT_BYTES: usize = 50 * 1024 * 1024;

/// Only what Tutellia stores (PDF and images), recognised by content, not by
/// name: never an executable, script or shortcut.
fn document_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"%PDF-") {
        Some("pdf")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else {
        None
    }
}

/// The page sends the file name percent-encoded (IPC headers are ASCII only).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |b: u8| (b as char).to_digit(16);
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Invisible / direction characters that can disguise a file name.
fn is_format_char(c: char) -> bool {
    matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A harmless file name: no folders, no hidden characters, no reserved
/// Windows name, and ALWAYS the extension matching the real content.
fn safe_file_name(raw: &str, extension: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !is_format_char(*c))
        .map(|c| if "<>:\"|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let stem = cleaned
        .rsplit_once('.')
        .map_or(cleaned.as_str(), |(stem, _)| stem)
        .trim_matches(|c| c == '.' || c == ' ');
    let stem: String = stem.chars().take(100).collect();
    let device = stem.split('.').next().unwrap_or("").trim().to_ascii_uppercase();
    let stem = if stem.is_empty() || RESERVED.contains(&device.as_str()) {
        format!("document-{stem}")
    } else {
        stem
    };
    format!("{}.{extension}", stem.trim_end_matches('-'))
}

fn open_with_system(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Writes without ever replacing an existing file (create_new).
fn write_new_file(dir: &std::path::Path, name: &str, bytes: &[u8]) -> Result<std::path::PathBuf, String> {
    for n in 0..1000 {
        let candidate = if n == 0 { name.to_string() } else { format!("{n}-{name}") };
        let path = dir.join(candidate);
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(bytes).map_err(|e| e.to_string())?;
                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Impossible d'enregistrer le document".into())
}

/// Saves a document the page already downloaded (with the user's session)
/// into Downloads and opens it with the default app. Bytes arrive raw (no
/// JSON), the file name in the `x-filename` header.
#[tauri::command]
pub fn save_and_open(app: AppHandle, webview: Webview, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    if !is_trusted_app_page(&app, &webview) {
        return Err("Non autorisé".into());
    }
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Contenu attendu".into());
    };
    if bytes.len() > MAX_DOCUMENT_BYTES {
        return Err("Document trop volumineux".into());
    }
    let extension = document_extension(bytes).ok_or("Seuls les PDF et les images peuvent être ouverts")?;
    let raw_name = request
        .headers()
        .get("x-filename")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let name = safe_file_name(&raw_name, extension);
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = write_new_file(&dir, &name, bytes)?;
    open_with_system(&path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{document_extension, origin_of, percent_decode, safe_file_name};
    use tauri::Url;

    #[test]
    fn origins_are_explicit_even_for_custom_schemes() {
        assert_eq!(origin_of(&Url::parse("tauri://localhost/index.html").unwrap()), "tauri://localhost");
        assert_eq!(origin_of(&Url::parse("http://tauri.localhost/").unwrap()), "http://tauri.localhost");
        assert_eq!(origin_of(&Url::parse("https://srv.local:8443/x").unwrap()), "https://srv.local:8443");
        assert_ne!(origin_of(&Url::parse("data:text/html,hi").unwrap()), origin_of(&Url::parse("tauri://localhost/").unwrap()));
    }

    #[test]
    fn only_pdf_and_images_by_content() {
        assert_eq!(document_extension(b"%PDF-1.7 ..."), Some("pdf"));
        assert_eq!(document_extension(b"\x89PNG\r\n\x1a\nrest"), Some("png"));
        assert_eq!(document_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(document_extension(b"MZ\x90\x00 (an .exe)"), None);
        assert_eq!(document_extension(b"@echo off"), None);
    }

    #[test]
    fn the_extension_always_matches_the_content() {
        assert_eq!(safe_file_name("update.exe", "pdf"), "update.pdf");
        assert_eq!(safe_file_name("facture.pdf.lnk", "pdf"), "facture.pdf.pdf");
        assert_eq!(safe_file_name("relevé T3.pdf", "pdf"), "relevé T3.pdf");
    }

    #[test]
    fn names_cannot_escape_or_disguise() {
        assert_eq!(safe_file_name("../../etc/passwd", "pdf"), "passwd.pdf");
        assert_eq!(safe_file_name("..\\..\\x.pdf", "pdf"), "x.pdf");
        assert_eq!(safe_file_name("a:b?.pdf", "pdf"), "a_b_.pdf");
        assert_eq!(safe_file_name("fact\u{202E}fdp.exe", "pdf"), "factfdp.pdf");
        assert_eq!(safe_file_name("CON.pdf", "pdf"), "document-CON.pdf");
        assert_eq!(safe_file_name("CON.x.pdf", "pdf"), "document-CON.x.pdf");
        assert_eq!(safe_file_name("nul .txt", "png"), "document-nul.png");
        assert_eq!(safe_file_name("", "jpg"), "document.jpg");
    }

    #[test]
    fn decodes_percent_encoded_names() {
        assert_eq!(percent_decode("relev%C3%A9%20T3.pdf"), "relevé T3.pdf");
        assert_eq!(percent_decode("plain.pdf"), "plain.pdf");
        assert_eq!(percent_decode("bad%2"), "bad%2");
        assert_eq!(percent_decode("%41"), "A");
    }
}
