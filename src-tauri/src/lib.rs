use tauri::Manager;
use std::sync::Mutex;

struct ServerProcess(Mutex<Option<std::process::Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(ServerProcess(Mutex::new(None)));

            #[cfg(not(debug_assertions))]
            {
                use std::io::Write;
                use std::os::windows::process::CommandExt;
                use std::process::Command;
                use std::thread;
                use std::time::Duration;

                const CREATE_NO_WINDOW: u32 = 0x08000000;

                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("failed to resolve resource dir");
                let server_dir = resource_dir.join("nextjs-server");
                let server_path = server_dir.join("server.js");

                // Debug log at %TEMP%\tutaide.log
                let log_path = std::env::temp_dir().join("tutaide.log");
                let mut log =
                    std::fs::File::create(&log_path).expect("failed to create log");
                writeln!(log, "resource_dir = {:?}", resource_dir).ok();
                writeln!(log, "server_dir exists = {}", server_dir.exists()).ok();
                writeln!(log, "server.js exists = {}", server_path.exists()).ok();

                // Determine node binary: prefer bundled, fall back to system
                let bundled_node = if cfg!(target_os = "windows") {
                    resource_dir.join("node.exe")
                } else {
                    resource_dir.join("node")
                };
                let node_exe: std::path::PathBuf = if bundled_node.exists() {
                    writeln!(log, "using bundled node at {:?}", bundled_node).ok();
                    // On macOS ensure the binary is executable
                    #[cfg(target_os = "macos")]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = std::fs::metadata(&bundled_node) {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            std::fs::set_permissions(&bundled_node, perms).ok();
                        }
                    }
                    bundled_node
                } else {
                    writeln!(log, "bundled node not found, using system node").ok();
                    std::path::PathBuf::from("node")
                };

                // Kill any leftover process on port 3456 from a previous run
                if let Ok(out) = Command::new("cmd")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["/c", "netstat -ano | findstr 127.0.0.1:3456"])
                    .output()
                {
                    for line in String::from_utf8_lossy(&out.stdout).lines() {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if let Some(pid_str) = parts.last() {
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                if pid > 4 {
                                    Command::new("taskkill")
                                        .creation_flags(CREATE_NO_WINDOW)
                                        .args(["/F", "/PID", &pid.to_string()])
                                        .spawn()
                                        .ok();
                                    writeln!(log, "killed leftover pid {}", pid).ok();
                                }
                            }
                        }
                    }
                }
                thread::sleep(Duration::from_millis(500));

                // Redirect node stdout+stderr into the log for diagnostics
                let log_out = std::fs::OpenOptions::new()
                    .append(true)
                    .open(&log_path)
                    .ok();
                let log_err = std::fs::OpenOptions::new()
                    .append(true)
                    .open(&log_path)
                    .ok();

                // Spawn the Next.js server
                let mut cmd = Command::new(&node_exe);
                cmd.creation_flags(CREATE_NO_WINDOW)
                    .arg(&server_path)
                    .env("PORT", "3456")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("NEXTAUTH_URL", "http://localhost:3456")
                    .current_dir(&server_dir);

                match (log_out, log_err) {
                    (Some(o), Some(e)) => { cmd.stdout(o).stderr(e); }
                    _ => { cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()); }
                }

                match cmd.spawn() {
                    Ok(child) => {
                        writeln!(log, "node spawned OK, pid = {}", child.id()).ok();
                        *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        writeln!(log, "node spawn FAILED: {}", e).ok();
                    }
                }

                // Ensure WebView2 can reach loopback (needed on some Windows configs)
                Command::new("CheckNetIsolation.exe")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["LoopbackExempt", "-a", "-n=Microsoft.Win32WebViewHost_cw5n1h2txyewy"])
                    .spawn()
                    .ok();

                // Poll TCP port and navigate once ready (works from a real HTML page)
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");
                let log_path_clone = log_path.clone();
                thread::spawn(move || {
                    use std::io::{Write as IoWrite, BufRead, BufReader};

                    for i in 0..40 {
                        thread::sleep(Duration::from_millis(500));
                        if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
                            &"127.0.0.1:3456".parse().unwrap(),
                            Duration::from_millis(500),
                        ) {
                            // TCP is open — send a real HTTP request to confirm the server responds
                            let _ = stream.write_all(
                                b"GET / HTTP/1.0\r\nHost: 127.0.0.1:3456\r\nConnection: close\r\n\r\n",
                            );
                            stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
                            let first_line = BufReader::new(&stream)
                                .lines()
                                .next()
                                .and_then(|l| l.ok())
                                .unwrap_or_else(|| "(no response)".into());

                            if let Ok(mut f) = std::fs::OpenOptions::new()
                                .append(true)
                                .open(&log_path_clone)
                            {
                                writeln!(f, "HTTP test after {} polls: {}", i + 1, first_line).ok();
                            }

                            // Only navigate if the server actually replied
                            if first_line.starts_with("HTTP/") {
                                // Wait a bit more to let the server fully stabilize
                                thread::sleep(Duration::from_millis(1000));

                                // Verify server is still up after the wait
                                let still_up = std::net::TcpStream::connect_timeout(
                                    &"127.0.0.1:3456".parse().unwrap(),
                                    Duration::from_millis(500),
                                ).is_ok();

                                if let Ok(mut f) = std::fs::OpenOptions::new()
                                    .append(true)
                                    .open(&log_path_clone)
                                {
                                    writeln!(f, "server still up after 1s wait: {}", still_up).ok();
                                }

                                let nav_result = window.navigate(
                                    "http://localhost:3456".parse().unwrap(),
                                );
                                if let Ok(mut f) = std::fs::OpenOptions::new()
                                    .append(true)
                                    .open(&log_path_clone)
                                {
                                    writeln!(f, "navigate() result: {:?}", nav_result.is_ok()).ok();
                                }
                                return;
                            }
                            // Server not ready yet — keep polling
                        }
                    }
                    if let Ok(mut f) = std::fs::OpenOptions::new()
                        .append(true)
                        .open(&log_path_clone)
                    {
                        writeln!(f, "port never became ready").ok();
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|app, event| {
            // Kill the Node.js server when the app exits
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = app.state::<ServerProcess>().0.lock() {
                    if let Some(mut child) = guard.take() {
                        child.kill().ok();
                    }
                }
            }
        });
}
