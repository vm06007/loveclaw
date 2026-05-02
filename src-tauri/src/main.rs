#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static AXL_PROCS: Mutex<Vec<std::process::Child>> = Mutex::new(Vec::new());

// Set once from CLI args before Tauri starts
static INSTANCE_ROLE: OnceLock<String> = OnceLock::new();
static INSTANCE_NAME: OnceLock<String> = OnceLock::new();

// ── CLI args ──────────────────────────────────────────────────────────────────

fn parse_cli_args() {
    // 1. CLI flags (for direct binary invocation: ./loveclaw --alice)
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--alice" => {
                let _ = INSTANCE_ROLE.set("alice".into());
                let _ = INSTANCE_NAME.set("alice".into());
            }
            "--boris" => {
                let _ = INSTANCE_ROLE.set("boris".into());
                let _ = INSTANCE_NAME.set("boris".into());
            }
            "--role" => {
                if let Some(v) = args.get(i + 1) {
                    let _ = INSTANCE_ROLE.set(v.clone());
                    i += 1;
                }
            }
            "--name" => {
                if let Some(v) = args.get(i + 1) {
                    let _ = INSTANCE_NAME.set(v.clone());
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    // 2. Env vars (for `npm run dev:alice` via tauri dev, which can't pass binary args)
    if INSTANCE_ROLE.get().is_none() {
        if let Ok(role) = std::env::var("LOVECLAW_ROLE") {
            let name = std::env::var("LOVECLAW_NAME").unwrap_or_else(|_| role.clone());
            let _ = INSTANCE_ROLE.set(role);
            let _ = INSTANCE_NAME.set(name);
        }
    }
}

#[tauri::command]
fn get_instance_config() -> serde_json::Value {
    let role = INSTANCE_ROLE.get().map(|s| s.as_str()).unwrap_or("");
    let name = INSTANCE_NAME.get().map(|s| s.as_str()).unwrap_or("");
    let axl_port: u16 = if role == "boris" { 9012 } else { 9002 };
    serde_json::json!({ "role": role, "name": name, "axlPort": axl_port })
}

// ── Device signals ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct DeviceSignal {
    #[serde(rename = "type")]
    signal_type: String,
    value: String,
}

/// Battery only. Location comes from the WebView via `navigator.geolocation` in `heartbeat.js`
/// (real device / OS position when the user allows it — not IP-based).
#[tauri::command]
fn get_device_signals() -> Vec<DeviceSignal> {
    let mut signals = Vec::new();

    if let Ok(output) = std::process::Command::new("ioreg")
        .args(["-rn", "AppleSmartBattery"])
        .output()
    {
        let raw = String::from_utf8_lossy(&output.stdout);
        if let Some(cap) = parse_ioreg_int(&raw, "CurrentCapacity") {
            if let Some(max) = parse_ioreg_int(&raw, "MaxCapacity") {
                if max > 0 {
                    let mut value = format!("{}%", cap * 100 / max);
                    if ioreg_battery_charging(&raw) {
                        value.push_str(" (charging)");
                    }
                    signals.push(DeviceSignal {
                        signal_type: "battery".into(),
                        value,
                    });
                }
            }
        }
    }

    if !signals.iter().any(|s| s.signal_type == "battery") {
        if let Some(v) = battery_from_pmset() {
            signals.push(DeviceSignal {
                signal_type: "battery".into(),
                value: v,
            });
        } else {
            signals.push(DeviceSignal {
                signal_type: "battery".into(),
                value: "No built-in battery (desktop) or sensors unavailable".into(),
            });
        }
    }

    signals
}

fn json_coord_geojs(v: Option<&serde_json::Value>) -> Option<f64> {
    let v = v?;
    v.as_f64().or_else(|| v.as_str()?.parse().ok())
}

/// Coarse lat/lon from public IP (geojs). Used in Tauri only when WebView geolocation fails.
#[tauri::command]
async fn get_ip_location_coords() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let resp = client
        .get("https://get.geojs.io/v1/ip/geo.json")
        .header("User-Agent", "LoveClaw/0.1 (tauri)")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body: serde_json::Value = resp.json().await.ok()?;
    let lat = json_coord_geojs(body.get("latitude"))?;
    let lon = json_coord_geojs(body.get("longitude"))?;
    Some(format!("{:.4}°, {:.4}°", lat, lon))
}

fn extract_percent_from_line(line: &str) -> Option<i32> {
    let bytes = line.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j < i {
                let slice = &line[j..i];
                if let Ok(n) = slice.parse::<i32>() {
                    if (0..=100).contains(&n) {
                        return Some(n);
                    }
                }
            }
        }
        i += 1;
    }
    None
}

fn pmset_line_charging(line: &str) -> bool {
    let lower = line.to_lowercase();
    if lower.contains("discharging") {
        return false;
    }
    lower.contains("charging") && !lower.contains("not charging")
}

fn battery_from_pmset() -> Option<String> {
    let output = std::process::Command::new("pmset")
        .args(["-g", "batt"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut best: Option<i32> = None;
    let mut charging = false;
    for line in text.lines() {
        if line.contains("InternalBattery") {
            if let Some(pct) = extract_percent_from_line(line) {
                best = Some(pct);
                charging = pmset_line_charging(line);
            }
        }
    }
    if best.is_none() {
        for line in text.lines() {
            if let Some(pct) = extract_percent_from_line(line) {
                best = Some(pct);
                charging = pmset_line_charging(line);
                break;
            }
        }
    }
    best.map(|p| {
        let mut s = format!("{}%", p);
        if charging {
            s.push_str(" (charging)");
        }
        s
    })
}

fn parse_ioreg_yes_no(text: &str, key: &str) -> Option<bool> {
    let needle = format!("\"{}\" = ", key);
    let line = text.lines().find(|l| l.contains(&needle))?;
    let val = line.split('=').nth(1)?.trim();
    if val.eq_ignore_ascii_case("Yes") || val == "1" {
        return Some(true);
    }
    if val.eq_ignore_ascii_case("No") || val == "0" {
        return Some(false);
    }
    None
}

/// Align with browser `BatteryManager.charging`: AC connected and not fully charged, or actively charging.
fn ioreg_battery_charging(raw: &str) -> bool {
    if parse_ioreg_yes_no(raw, "IsCharging") == Some(true) {
        return true;
    }
    let external = parse_ioreg_yes_no(raw, "ExternalConnected");
    let full = parse_ioreg_yes_no(raw, "FullyCharged");
    external == Some(true) && full != Some(true)
}

fn parse_ioreg_int(text: &str, key: &str) -> Option<i64> {
    let needle = format!("\"{}\" = ", key);
    let line = text.lines().find(|l| l.contains(&needle))?;
    line.split('=').nth(1)?.trim().parse().ok()
}

// ── Diary generation ──────────────────────────────────────────────────────────

#[tauri::command]
async fn generate_diary_entry(signals: String) -> String {
    let client = reqwest::Client::new();
    if let Ok(resp) = client
        .post("http://localhost:9090/diary")
        .json(&serde_json::json!({ "signals": signals }))
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
    {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            if let Some(text) = body.get("text").and_then(|v| v.as_str()) {
                return text.to_string();
            }
        }
    }

    format!(
        "Today's snapshot: {}. Connection felt stable. Trust holds.",
        if signals.is_empty() { "signals quiet" } else { &signals }
    )
}

// ── AXL node management ───────────────────────────────────────────────────────

fn find_axl_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    for _ in 0..10 {
        let candidate = dir.join("examples/axl-demo");
        if candidate.join("axl/node").exists() {
            return candidate.canonicalize().ok();
        }
        dir = dir.parent()?;
    }
    None
}

fn port_open(port: u16) -> bool {
    std::net::TcpStream::connect(std::net::SocketAddr::from(([127, 0, 0, 1], port))).is_ok()
}

fn wait_for_port(port: u16, label: &str, tries: u32) {
    for _ in 0..tries {
        if port_open(port) {
            eprintln!("[axl] {} ready on :{}", label, port);
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    eprintln!("[axl] {} did not come up on :{}", label, port);
}

fn ensure_key(dir: &std::path::Path, filename: &str) {
    if dir.join(filename).exists() { return; }
    let result = std::process::Command::new("openssl")
        .args(["genpkey", "-algorithm", "ed25519", "-out", filename])
        .current_dir(dir)
        .status();
    match result {
        Ok(s) if s.success() => eprintln!("[axl] generated {}", filename),
        _ => eprintln!("[axl] failed to generate {} (openssl required)", filename),
    }
}

fn spawn_node(axl_bin: &std::path::Path, axl_dir: &std::path::Path, config: &str, label: &str) {
    match std::process::Command::new(axl_bin)
        .args(["-config", config])
        .current_dir(axl_dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => {
            eprintln!("[axl] {} started (pid {})", label, child.id());
            AXL_PROCS.lock().unwrap().push(child);
        }
        Err(e) => eprintln!("[axl] failed to start {}: {}", label, e),
    }
}

fn start_axl_nodes() {
    let role = INSTANCE_ROLE.get().map(|s| s.as_str()).unwrap_or("");

    let axl_dir = match find_axl_dir() {
        Some(d) => d,
        None => {
            eprintln!("[axl] examples/axl-demo not found — run setup.sh first");
            return;
        }
    };
    let axl_bin = axl_dir.join("axl/node");
    if !axl_bin.exists() {
        eprintln!("[axl] binary not found — run setup.sh first");
        return;
    }

    match role {
        "alice" => {
            // Alice: listener node, no initial peers
            if port_open(9002) {
                eprintln!("[axl] alice already up on :9002");
                return;
            }
            ensure_key(&axl_dir, "alice-key.pem");
            let cfg = serde_json::json!({
                "PrivateKeyPath": "alice-key.pem",
                "Peers": [],
                "Listen": ["tls://0.0.0.0:9001"],
                "api_port": 9002,
                "router_port": 9003,
                "a2a_port": 9004
            });
            let _ = std::fs::write(axl_dir.join("node-alice.json"), serde_json::to_string_pretty(&cfg).unwrap());
            spawn_node(&axl_bin, &axl_dir, "node-alice.json", "alice");
            wait_for_port(9002, "alice", 30);
        }
        "boris" => {
            // Boris: connects to Alice's TLS listener
            if port_open(9012) {
                eprintln!("[axl] boris already up on :9012");
                return;
            }
            ensure_key(&axl_dir, "boris-key.pem");
            let cfg = serde_json::json!({
                "PrivateKeyPath": "boris-key.pem",
                "Peers": ["tls://127.0.0.1:9001"],
                "Listen": ["tls://0.0.0.0:7001"],
                "api_port": 9012,
                "tcp_port": 7000,
                "router_port": 9013,
                "a2a_port": 9014
            });
            let _ = std::fs::write(axl_dir.join("node-boris.json"), serde_json::to_string_pretty(&cfg).unwrap());
            spawn_node(&axl_bin, &axl_dir, "node-boris.json", "boris");
            wait_for_port(9012, "boris", 30);
        }
        _ => {
            // No role flag — start both (browser-tab demo mode)
            if port_open(9002) && port_open(9012) {
                eprintln!("[axl] both nodes already up");
                return;
            }
            ensure_key(&axl_dir, "alice-key.pem");
            ensure_key(&axl_dir, "boris-key.pem");
            let alice_cfg = serde_json::json!({
                "PrivateKeyPath": "alice-key.pem",
                "Peers": [],
                "Listen": ["tls://0.0.0.0:9001"],
                "api_port": 9002,
                "router_port": 9003,
                "a2a_port": 9004
            });
            let boris_cfg = serde_json::json!({
                "PrivateKeyPath": "boris-key.pem",
                "Peers": ["tls://127.0.0.1:9001"],
                "Listen": ["tls://0.0.0.0:7001"],
                "api_port": 9012,
                "tcp_port": 7000,
                "router_port": 9013,
                "a2a_port": 9014
            });
            let _ = std::fs::write(axl_dir.join("node-alice.json"), serde_json::to_string_pretty(&alice_cfg).unwrap());
            let _ = std::fs::write(axl_dir.join("node-boris.json"), serde_json::to_string_pretty(&boris_cfg).unwrap());
            if !port_open(9002) {
                spawn_node(&axl_bin, &axl_dir, "node-alice.json", "alice");
                std::thread::sleep(std::time::Duration::from_millis(800));
            }
            if !port_open(9012) {
                spawn_node(&axl_bin, &axl_dir, "node-boris.json", "boris");
            }
            wait_for_port(9002, "alice", 30);
            wait_for_port(9012, "boris", 30);
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    parse_cli_args();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            std::thread::spawn(start_axl_nodes);

            let role = INSTANCE_ROLE.get().map(|s| s.as_str()).unwrap_or("");

            // Build the URL with ?role= baked in so JS reads it immediately via URLSearchParams.
            // WebviewUrl::App path is appended to devUrl in dev, or served from dist in prod.
            let url_path = if role.is_empty() {
                std::path::PathBuf::from("/")
            } else {
                std::path::PathBuf::from(format!("/?role={}", role))
            };

            let title = if role.is_empty() {
                "LoveClaw".to_string()
            } else {
                format!("LoveClaw — {}", role[..1].to_uppercase() + &role[1..])
            };

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App(url_path),
            )
            .title(&title)
            .inner_size(442.0, 790.0)
            .min_inner_size(390.0, 600.0)
            .center()
            .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_device_signals,
            get_ip_location_coords,
            generate_diary_entry,
            get_instance_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
