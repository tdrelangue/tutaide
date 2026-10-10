use std::fs;
use std::path::PathBuf;

fn main() {
    // Workaround: The project path contains an apostrophe (tut'aide)
    // which breaks the Windows Resource Compiler (RC.EXE).
    // We copy the icon to a temp directory with a clean path.
    let temp_icons = PathBuf::from(
        std::env::var("TEMP").unwrap_or_else(|_| "C:\\Temp".to_string()),
    )
    .join("tutaide-icons");
    fs::create_dir_all(&temp_icons).ok();

    let src_icon = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("icons")
        .join("icon.ico");
    let safe_icon = temp_icons.join("icon.ico");

    if src_icon.exists() {
        fs::copy(&src_icon, &safe_icon).ok();
    }

    let mut windows_attr = tauri_build::WindowsAttributes::new();
    if safe_icon.exists() {
        windows_attr = windows_attr.window_icon_path(safe_icon);
    }

    // App commands are declared so each capability grants only the ones its
    // pages need (an undeclared command would be callable by every page,
    // including a remote organisation server).
    let app_manifest = tauri_build::AppManifest::new().commands(&[
        "kill_server",
        "check_for_update",
        "get_connection",
        "set_connection",
        "open_connection_settings",
        "save_and_open",
    ]);

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(windows_attr)
            .app_manifest(app_manifest),
    )
    .expect("failed to run tauri build");
}
