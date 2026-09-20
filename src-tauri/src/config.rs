use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path};
use tauri_plugin_global_shortcut::Shortcut;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub shortcut: String,
    pub index: usize,
    pub mode: String,
    #[serde(default)]
    pub cue_id: String,
    #[serde(default)]
    pub character_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub data_dir: String,
    pub see_through_dir: String,
    pub port: u16,
    pub enabled: bool,
    pub bindings: Vec<Binding>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            data_dir: String::new(),
            see_through_dir: String::new(),
            port: 18765,
            enabled: false,
            bindings: (0..2)
                .map(|i| Binding {
                    shortcut: format!("Ctrl+Alt+{}", i),
                    index: 0,
                    mode: "select".into(),
                    cue_id: format!("{:032x}", i),
                    character_id: String::new(),
                })
                .collect(),
        }
    }
}

impl Config {
    // Persist the first chosen path so moving/updating the executable does not
    // silently switch an existing workspace to a new empty directory.
    pub fn fill_data_dir(&mut self, executable: &Path) -> Result<(), String> {
        if self.data_dir.trim().is_empty() {
            self.data_dir = executable
                .parent()
                .ok_or("アプリの場所を取得できません。")?
                .join("data")
                .to_string_lossy()
                .into_owned();
        }
        Ok(())
    }

    pub fn validate_connection(&self) -> Result<(), String> {
        if !Path::new(&self.data_dir).is_absolute() {
            return Err("素材・プロジェクトの保存先を絶対パスで指定してください。".into());
        }
        if self.port == 0 {
            return Err("ポートは1〜65535で指定してください。".into());
        }
        Ok(())
    }
}

pub fn validate_bindings(bindings: &[Binding]) -> Result<Vec<Shortcut>, String> {
    if bindings.len() > 32 {
        return Err("割り当ては32個までです。".into());
    }
    let mut used = HashSet::new();
    bindings
        .iter()
        .enumerate()
        .map(|(i, b)| {
            if !b.cue_id.is_empty() && (b.cue_id.len()!=32 || !b.cue_id.bytes().all(|v|v.is_ascii_hexdigit() && !v.is_ascii_uppercase()) || b.mode!="select") {
                return Err(format!("{}行目の演出設定が不正です。", i + 1));
            }
            if !b.character_id.is_empty() && (b.character_id.len()>100 || !b.character_id.bytes().all(|v|v.is_ascii_alphanumeric() || v==b'-' || v==b'_') || b.cue_id.is_empty()) {return Err(format!("{}行目のキャラクターと演出を選んでください。",i+1));}
            if b.index > 11 || !["select", "hold"].contains(&b.mode.as_str()) {
                return Err(format!("{}行目の表情または切替方式が不正です。", i + 1));
            }
            if b.shortcut.len() > 80
                || !b
                    .shortcut
                    .split('+')
                    .any(|s| ["ctrl", "control", "alt"].contains(&s.to_lowercase().as_str()))
            {
                return Err(format!("{}行目はCtrlまたはAltを含めてください。", i + 1));
            }
            let shortcut = b
                .shortcut
                .parse::<Shortcut>()
                .map_err(|_| format!("{}行目のキーを確認してください。", i + 1))?;
            if !used.insert(shortcut.id()) {
                return Err(format!("{}行目のキーが重複しています。", i + 1));
            }
            Ok(shortcut)
        })
        .collect()
}

pub fn save(path: &Path, config: &Config) -> Result<(), String> {
    let parent = path.parent().ok_or("設定の保存先がありません。")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("tmp");
    std::fs::write(
        &temporary,
        serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_effects_and_legacy_expression_bindings() {
        let mut binding: Binding = serde_json::from_str(r#"{"shortcut":"Ctrl+Alt+9","index":0,"mode":"select"}"#).unwrap();
        assert!(binding.cue_id.is_empty());
        assert!(binding.character_id.is_empty());
        binding.cue_id = "a".repeat(32);
        assert!(validate_bindings(&[binding.clone()]).is_ok());
        binding.character_id="character-a".into();
        assert!(validate_bindings(&[binding.clone()]).is_ok());
        binding.character_id="../bad".into();
        assert!(validate_bindings(&[binding.clone()]).is_err());
        binding.character_id.clear();
        binding.mode = "hold".into();
        assert!(validate_bindings(&[binding.clone()]).is_err());
        binding.mode = "select".into();
        binding.cue_id = "../bad".into();
        assert!(validate_bindings(&[binding]).is_err());
    }
    #[test]
    fn first_launch_defaults_beside_app_and_keeps_existing_workspace_on_update() {
        let base = std::env::temp_dir();
        let mut c = Config::default();
        c.fill_data_dir(&base.join("version1/app.exe")).unwrap();
        assert_eq!(Path::new(&c.data_dir), base.join("version1/data"));
        c.fill_data_dir(&base.join("version2/app.exe")).unwrap();
        assert_eq!(Path::new(&c.data_dir), base.join("version1/data"));
        assert!(c.validate_connection().is_ok());
        c.data_dir = "relative/data".into();
        assert!(c.validate_connection().is_err());
        c.data_dir = base.to_string_lossy().into_owned();
        c.port = 0;
        assert!(c.validate_connection().is_err());
    }
    #[test]
    fn prevents_bare_keys_and_duplicate_aliases() {
        let mut c = Config::default();
        assert!(validate_bindings(&c.bindings).is_ok());
        c.bindings[0].shortcut = "1".into();
        assert!(validate_bindings(&c.bindings).is_err());
        c.bindings[0].shortcut = "Control+Alt+1".into();
        assert!(validate_bindings(&c.bindings).is_err());
    }
    #[test]
    fn validates_mode_and_expression_range() {
        let mut c = Config::default();
        c.bindings[0].cue_id.clear();
        c.bindings[0].mode = "hold".into();
        assert!(validate_bindings(&c.bindings).is_ok());
        c.bindings[0].index = 12;
        assert!(validate_bindings(&c.bindings).is_err());
    }
}
