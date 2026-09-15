use crate::config::Config;
use serde_json::Value;
use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

#[derive(Clone)]
pub struct Connection {
    pub url: String,
    pub token: String,
}
impl Connection {
    pub fn request(&self, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|e| e.to_string())?;
        let url = format!("{}/api/desktop/{}", self.url, path);
        let req = if let Some(body) = body {
            client.post(url).json(body)
        } else {
            client.get(url)
        };
        let response = req
            .bearer_auth(&self.token)
            .send()
            .map_err(|_| "アプリの処理サーバーに接続できません。".to_string())?;
        let status = response.status();
        let value: Value = response
            .json()
            .map_err(|_| "サーバーの応答を読み取れません。".to_string())?;
        if !status.is_success() {
            return Err(value["detail"]
                .as_str()
                .unwrap_or("操作できませんでした。")
                .to_string());
        }
        Ok(value)
    }
}

pub struct Backend {
    pub child: Child,
    pub connection: Connection,
}
impl Drop for Backend {
    fn drop(&mut self) {
        // EOF asks Python to stop its own jobs; never terminate another service.
        drop(self.child.stdin.take());
        for _ in 0..40 {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn start(config: &Config, executable: &Path, log_dir: &Path) -> Result<Backend, String> {
    if config.port == 0 {
        return Err("ポートは1〜65535で指定してください。".into());
    }
    if config.data_dir.trim().is_empty() || !Path::new(&config.data_dir).is_absolute() {
        return Err("素材・プロジェクトの保存先を絶対パスで指定してください。".into());
    }
    // Fail before spawning; Python also exclusively binds this port.
    let probe=std::net::TcpListener::bind(("127.0.0.1",config.port))
        .map_err(|_|format!("ポート{}は使用中です。詳細設定で別の番号にしてください。既存サーバーは停止していません。",config.port))?;
    drop(probe);
    std::fs::create_dir_all(&config.data_dir).map_err(|e| format!("保存先を開けません: {e}"))?;
    std::fs::create_dir_all(log_dir).map_err(|e| e.to_string())?;
    let log = std::fs::File::create(log_dir.join("backend.log")).map_err(|e| e.to_string())?;
    let token = uuid::Uuid::new_v4().to_string();
    let mut command = Command::new(executable);
    command
        .args(["--port", &config.port.to_string()])
        .env("SVG_THROUGH_DESKTOP_TOKEN", &token)
        .env("SVG_THROUGH_DATA_DIR", &config.data_dir)
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::piped())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    if !config.see_through_dir.trim().is_empty() {
        command.env("SVG_THROUGH_SEE_THROUGH_ROOT", &config.see_through_dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command
        .spawn()
        .map_err(|e| format!("同梱サーバーを起動できません: {e}"))?;
    let mut backend = Backend {
        child,
        connection: Connection {
            url: format!("http://127.0.0.1:{}", config.port),
            token,
        },
    };
    for _ in 0..150 {
        if matches!(backend.child.try_wait(), Ok(Some(_))) {
            return Err(format!(
                "処理サーバーの起動に失敗しました。{}を確認してください。",
                log_dir.join("backend.log").display()
            ));
        }
        if let Ok(value) = backend.connection.request("health", None) {
            if value["protocol"] == 1 {
                return Ok(backend);
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err("処理サーバーの起動が時間内に完了しませんでした。アプリを再起動してください。".into())
}
