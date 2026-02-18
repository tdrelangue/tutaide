use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In production, spawn the Next.js standalone server
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_shell::ShellExt;

                let shell = app.shell();
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("failed to resolve resource dir");
                let server_dir = resource_dir.join("nextjs-server");
                let server_path = server_dir.join("server.js");

                shell
                    .command("node")
                    .args([server_path.to_string_lossy().to_string()])
                    .env("PORT", "3456")
                    .env("HOSTNAME", "127.0.0.1")
                    .current_dir(server_dir)
                    .spawn()
                    .expect("failed to start Next.js server");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
