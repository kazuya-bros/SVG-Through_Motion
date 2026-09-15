use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path};
use tauri_plugin_global_shortcut::Shortcut;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub shortcut: String,
    pub index: usize,
    pub mode: String,
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
            bindings: (0..5)
                .map(|i| Binding {
                    shortcut: format!("Ctrl+Alt+{}", i + 1),
                    index: i,
                    mode: "select".into(),
                })
                .collect(),
        }
    }
}

pub fn validate_bindings(bindings: &[Binding]) -> Result<Vec<Shortcut>, String> {
    if bindings.len() > 12 {
        return Err("割り当ては12個までです。".into());
    }
    let mut used = HashSet::new();
    bindings
        .iter()
        .enumerate()
        .map(|(i, b)| {
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
    fn prevents_bare_keys_and_duplicate_aliases() {
        let mut c = Config::default();
        assert!(validate_bindings(&c.bindings).is_ok());
        c.bindings[0].shortcut = "1".into();
        assert!(validate_bindings(&c.bindings).is_err());
        c.bindings[0].shortcut = "Control+Alt+2".into();
        assert!(validate_bindings(&c.bindings).is_err());
    }
    #[test]
    fn validates_mode_and_expression_range() {
        let mut c = Config::default();
        c.bindings[0].mode = "hold".into();
        assert!(validate_bindings(&c.bindings).is_ok());
        c.bindings[0].index = 12;
        assert!(validate_bindings(&c.bindings).is_err());
    }
}
