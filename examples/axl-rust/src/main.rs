//! LoveClaw × AXL — Rust Agent
//!
//! Shows how any Rust app (including Tauri desktop apps) can speak to a local
//! AXL node via plain HTTP. The same `reqwest` calls work inside a Tauri
//! command handler — just replace `main()` with `#[tauri::command]`.
//!
//! Usage:
//!   cargo run                              # show node identity
//!   cargo run -- --port 9012               # use Boris's node
//!   cargo run -- --send <key> <text>       # send a LoveClaw message
//!   cargo run -- --recv                    # receive one message
//!   cargo run -- --poll                    # poll continuously (Ctrl-C to stop)
//!   cargo run -- --demo <partner_key>      # run scripted exchange with partner

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

// ── AXL types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct Topology {
    our_public_key: String,
    our_ipv6: Option<String>,
}

/// Generic LoveClaw message envelope — matches the protocol in AXL.md
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Msg {
    #[serde(rename = "type")]
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    from_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vote: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl Msg {
    fn handshake(name: &str, key: &str) -> Self {
        Self {
            kind: "axl_handshake".into(),
            name: Some(name.into()),
            key: Some(key.into()),
            score: None,
            author: None,
            text: None,
            from_name: None,
            id: None,
            vote: None,
            reason: None,
        }
    }
    fn score(s: u32) -> Self {
        Self {
            kind: "score".into(),
            score: Some(s),
            name: None,
            key: None,
            author: None,
            text: None,
            from_name: None,
            id: None,
            vote: None,
            reason: None,
        }
    }
    fn diary(author: &str, text: &str) -> Self {
        Self {
            kind: "diary".into(),
            author: Some(author.into()),
            text: Some(text.into()),
            name: None,
            key: None,
            score: None,
            from_name: None,
            id: None,
            vote: None,
            reason: None,
        }
    }
}

// ── AXL client ────────────────────────────────────────────────────────────────

struct AxlClient {
    base: String,
    http: reqwest::Client,
}

impl AxlClient {
    fn new(port: u16) -> Self {
        Self {
            base: format!("http://127.0.0.1:{}", port),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
                .unwrap(),
        }
    }

    async fn topology(&self) -> Result<Topology, Box<dyn std::error::Error>> {
        let t = self.http.get(format!("{}/topology", self.base))
            .send().await?
            .json::<Topology>().await?;
        Ok(t)
    }

    async fn send(&self, peer_key: &str, msg: &Msg) -> Result<usize, Box<dyn std::error::Error>> {
        let resp = self.http.post(format!("{}/send", self.base))
            .header("X-Destination-Peer-Id", peer_key)
            .json(msg)
            .send().await?;

        let bytes = resp.headers()
            .get("x-sent-bytes")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        Ok(bytes)
    }

    /// Returns (from_key, raw_body) or None if queue empty.
    async fn recv(&self) -> Result<Option<(String, String)>, Box<dyn std::error::Error>> {
        let resp = self.http.get(format!("{}/recv", self.base)).send().await?;
        if resp.status().as_u16() == 204 {
            return Ok(None);
        }
        let from_key = resp.headers()
            .get("x-from-peer-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = resp.text().await?;
        Ok(Some((from_key, body)))
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_str() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600)  / 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn short(key: &str) -> String {
    format!("{}…", &key[..key.len().min(12)])
}

// ── Commands ──────────────────────────────────────────────────────────────────

async fn cmd_identity(axl: &AxlClient) -> Result<(), Box<dyn std::error::Error>> {
    let t = axl.topology().await?;
    println!("public key : {}", t.our_public_key);
    if let Some(ip) = t.our_ipv6 {
        println!("ipv6       : {}", ip);
    }
    Ok(())
}

async fn cmd_send(axl: &AxlClient, peer_key: &str, text: &str) -> Result<(), Box<dyn std::error::Error>> {
    let msg = Msg::diary("rust-agent", text);
    let bytes = axl.send(peer_key, &msg).await?;
    println!("sent {} bytes → {}", bytes, short(peer_key));
    Ok(())
}

async fn cmd_recv(axl: &AxlClient) -> Result<(), Box<dyn std::error::Error>> {
    match axl.recv().await? {
        None => println!("(no messages)"),
        Some((from, body)) => {
            println!("from : {}", short(&from));
            println!("body : {}", body);
        }
    }
    Ok(())
}

async fn cmd_poll(axl: &AxlClient) -> Result<(), Box<dyn std::error::Error>> {
    println!("Polling for messages — Ctrl-C to stop\n");
    loop {
        if let Some((from, body)) = axl.recv().await? {
            println!("[{}]  from {}  ·  {}", now_str(), short(&from), body);
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

/// testing back-and-forth exchange demonstrating the LoveClaw protocol.
async fn cmd_demo(axl: &AxlClient, partner_key: &str) -> Result<(), Box<dyn std::error::Error>> {
    let t = axl.topology().await?;
    let my_key = t.our_public_key.clone();

    println!("=== LoveClaw Rust Agent Demo ===");
    println!("my key  : {}", short(&my_key));
    println!("partner : {}\n", short(partner_key));

    // 1. Handshake
    println!("[{}] → axl_handshake", now_str());
    axl.send(partner_key, &Msg::handshake("rust-agent", &my_key)).await?;
    tokio::time::sleep(Duration::from_millis(600)).await;

    // 2. Trust score
    println!("[{}] → score 88", now_str());
    axl.send(partner_key, &Msg::score(88)).await?;
    tokio::time::sleep(Duration::from_millis(600)).await;

    // 3. Diary entry
    println!("[{}] → diary", now_str());
    axl.send(partner_key, &Msg::diary("rust-agent", "Built something cool in Rust today.")).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;

    // 4. Drain any replies
    println!("[{}]  draining inbox…", now_str());
    loop {
        match axl.recv().await? {
            None => break,
            Some((from, body)) => println!("[{}] ← from {}  ·  {}", now_str(), short(&from), body),
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    println!("\nDone.");
    Ok(())
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --port overrides default AXL port
    let port: u16 = args.windows(2)
        .find(|w| w[0] == "--port")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(9002);

    let axl = AxlClient::new(port);

    let result = match args.get(1).map(|s| s.as_str()) {
        Some("--send") => {
            let key  = args.get(2).expect("--send <peer_key> <text>");
            let text = args.get(3).expect("--send <peer_key> <text>");
            cmd_send(&axl, key, text).await
        }
        Some("--recv") => cmd_recv(&axl).await,
        Some("--poll") => cmd_poll(&axl).await,
        Some("--demo") => {
            let key = args.get(2).expect("--demo <partner_key>");
            cmd_demo(&axl, key).await
        }
        _ => cmd_identity(&axl).await,
    };

    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
