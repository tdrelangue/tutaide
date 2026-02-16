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

    tauri_build::try_build(
        tauri_build::Attributes::new().windows_attributes(windows_attr),
    )
    .expect("failed to run tauri build");
}
