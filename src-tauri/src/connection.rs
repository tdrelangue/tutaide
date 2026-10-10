//! Where this desktop app gets Tutellia from:
//! - `Local`: its own bundled server on this PC (the historic behaviour, and
//!   the default when nothing was ever chosen, so updates change nothing for
//!   existing users);
//! - `Server`: the organisation's own Tutellia server ("Serveur de ma
//!   structure"), opened directly; no local server is started.
//!
//! The choice is a small JSON file in the app's config folder, per PC.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum Connection {
    Local,
    Server { url: String },
}

/// What the saved file says. `Invalid` (file present but unreadable, or an
/// address no longer accepted) is never silently turned into `Local`: the
/// person would then type protected persons' data into a different database
/// without knowing it. The start-up page asks them to choose again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Saved {
    Valid(Connection),
    Invalid,
}

const FILE_NAME: &str = "connection.json";

pub fn load(config_dir: &Path) -> Saved {
    let Ok(text) = std::fs::read_to_string(config_dir.join(FILE_NAME)) else {
        // No file yet: the historic behaviour, Tutellia on this computer.
        return Saved::Valid(Connection::Local);
    };
    match serde_json::from_str::<Connection>(&text) {
        Ok(Connection::Local) => Saved::Valid(Connection::Local),
        Ok(Connection::Server { url }) => match normalize_server_url(&url) {
            Ok(url) => Saved::Valid(Connection::Server { url }),
            Err(_) => Saved::Invalid,
        },
        Err(_) => Saved::Invalid,
    }
}

/// Atomic write (temp file + rename): an interrupted save never corrupts it.
pub fn save(config_dir: &Path, connection: &Connection) -> Result<(), String> {
    std::fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(connection).map_err(|e| e.to_string())?;
    let temp = config_dir.join(format!("{FILE_NAME}.tmp"));
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, config_dir.join(FILE_NAME)).map_err(|e| e.to_string())
}

/// Plain HTTP is accepted only for this PC itself, and only in development
/// builds: in a release, whatever listens on a local port is not trustworthy.
fn allows_plain_http(host: &str) -> bool {
    cfg!(debug_assertions) && matches!(host, "localhost" | "127.0.0.1")
}

/// Host names only (letters, digits, dots, hyphens): no wildcard or other
/// pattern character can reach the permission granted to the server.
fn is_plain_host(host: &str) -> bool {
    !host.is_empty()
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && !host.starts_with(['.', '-'])
}

/// Validates what the user typed and keeps only the origin
/// (`https://tutellia.udaf75.fr`). HTTPS is required: passwords and protected
/// persons' files must never travel in clear on a network.
pub fn normalize_server_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = tauri::Url::parse(&with_scheme).map_err(|_| "Adresse invalide".to_string())?;
    let host = url.host_str().ok_or_else(|| "Adresse invalide".to_string())?;
    if !is_plain_host(host) {
        return Err("Adresse invalide".into());
    }
    match url.scheme() {
        "https" => {}
        "http" if allows_plain_http(host) => {}
        "http" => return Err("L'adresse doit commencer par https:// (connexion chiffrée)".into()),
        _ => return Err("Adresse invalide".into()),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Adresse invalide".into());
    }
    Ok(url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_https_and_keeps_only_the_origin() {
        assert_eq!(
            normalize_server_url(" tutellia.udaf75.fr/login?x=1 ").unwrap(),
            "https://tutellia.udaf75.fr"
        );
        assert_eq!(
            normalize_server_url("https://srv.local:8443/").unwrap(),
            "https://srv.local:8443"
        );
    }

    #[test]
    fn refuses_plain_http_on_the_network() {
        assert!(normalize_server_url("http://tutellia.udaf75.fr").is_err());
        assert!(normalize_server_url("http://192.168.1.10").is_err());
    }

    #[test]
    fn plain_http_to_this_pc_only_in_development_builds() {
        // Tests run as a debug build: allowed here, refused in a release.
        assert_eq!(
            normalize_server_url("http://localhost:3000").unwrap(),
            "http://localhost:3000"
        );
        assert!(!cfg!(debug_assertions) || normalize_server_url("http://127.0.0.1:3000").is_ok());
    }

    #[test]
    fn refuses_other_schemes_credentials_and_patterns() {
        assert!(normalize_server_url("file:///etc/passwd").is_err());
        assert!(normalize_server_url("javascript:alert(1)").is_err());
        assert!(normalize_server_url("https://user:pass@srv.local").is_err());
        assert!(normalize_server_url("https://*.example.org").is_err());
        assert!(normalize_server_url("").is_err());
    }

    #[test]
    fn missing_file_is_local_but_a_broken_one_is_reported() {
        let dir = std::env::temp_dir().join(format!("tutellia-conn-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::remove_file(dir.join(FILE_NAME)).ok();
        assert_eq!(load(&dir), Saved::Valid(Connection::Local));
        std::fs::write(dir.join(FILE_NAME), "not json").unwrap();
        assert_eq!(load(&dir), Saved::Invalid);
        std::fs::write(dir.join(FILE_NAME), r#"{"mode":"server","url":"http://evil.example"}"#).unwrap();
        assert_eq!(load(&dir), Saved::Invalid, "an unsafe saved address is not used");
        let server = Connection::Server { url: "https://srv.local".into() };
        save(&dir, &server).unwrap();
        assert_eq!(load(&dir), Saved::Valid(server));
        std::fs::remove_dir_all(&dir).ok();
    }
}
