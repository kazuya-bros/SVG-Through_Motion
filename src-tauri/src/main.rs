#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;
mod config;
use backend::{Backend, Connection};
use config::{Binding, Config};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{mpsc, Mutex},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Inner {
    config: Config,
    backend: Option<Backend>,
    starting: bool,
    startup_error: String,
    target: String,
    settings_target: Option<String>,
    settings_revision: u64,
    registered: HashMap<u32, Binding>,
    pressed: HashSet<u32>,
    errors: Vec<String>,
    last_event: String,
}
struct State {
    inner: Mutex<Inner>,
    path: PathBuf,
    queue: mpsc::Sender<(Connection, Value)>,
}

fn local_settings(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() != "desktop"
        || !((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
    {
        return Err("アプリ設定画面から操作してください。".into());
    }
    Ok(())
}
fn notify(app: &tauri::AppHandle) {
    let _ = app.emit_to("desktop", "desktop-status", ());
}
fn show_settings(app: &tauri::AppHandle) {
    show_settings_for(app, None);
}
fn show_settings_for(app: &tauri::AppHandle, target: Option<String>) {
    let title = if target.is_some() { "SVG-Through Motion — ホットキー設定" } else { "SVG-Through Motion — 保存先と接続" };
    {
        let state = app.state::<State>();
        let mut inner = state.inner.lock().unwrap();
        inner.settings_target = target;
        inner.settings_revision += 1;
    }
    notify(app);
    if let Some(w) = app.get_webview_window("desktop") {
        let _ = w.set_title(title);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn release_all(state: &State, inner: &mut Inner) {
    inner.pressed.clear();
    if let Some(backend) = &inner.backend {
        if !inner.target.is_empty() {
            let _ = state.queue.send((
                backend.connection.clone(),
                json!({"session_id":inner.target,"action":"release_all"}),
            ));
        }
    }
}

fn configure_hotkeys(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<State>();
    let (config, ready) = {
        let mut inner = state.inner.lock().unwrap();
        release_all(&state, &mut inner);
        inner.registered.clear();
        inner.errors.clear();
        (
            inner.config.clone(),
            inner.backend.is_some() && !inner.target.is_empty(),
        )
    };
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    let parsed = config::validate_bindings(&config.bindings)?;
    if config.enabled && ready {
        for (binding, shortcut) in config.bindings.into_iter().zip(parsed) {
            match app.global_shortcut().register(shortcut) {
                Ok(()) => {
                    state
                        .inner
                        .lock()
                        .unwrap()
                        .registered
                        .insert(shortcut.id(), binding);
                }
                Err(_) => state.inner.lock().unwrap().errors.push(format!(
                    "{} は登録できません。他のアプリの割り当てと競合していないか確認してください。",
                    binding.shortcut
                )),
            }
        }
    }
    notify(app);
    Ok(())
}

#[tauri::command]
fn desktop_state(window: WebviewWindow, state: tauri::State<State>) -> Result<Value, String> {
    local_settings(&window)?;
    let inner = state.inner.lock().unwrap();
    Ok(
        json!({"config":inner.config,"running":inner.backend.is_some(),"starting":inner.starting,"startup_error":inner.startup_error,"url":inner.backend.as_ref().map(|b|&b.connection.url),"target":inner.target,"settings_target":inner.settings_target,"settings_revision":inner.settings_revision,"registered":inner.registered.len(),"errors":inner.errors,"last_event":inner.last_event}),
    )
}

#[tauri::command]
async fn choose_folder(
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    local_settings(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(|p| p.to_string())
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn desktop_sessions(window: WebviewWindow, app: tauri::AppHandle) -> Result<Value, String> {
    local_settings(&window)?;
    let connection = app
        .state::<State>()
        .inner
        .lock()
        .unwrap()
        .backend
        .as_ref()
        .map(|b| b.connection.clone());
    match connection {
        Some(c) => tauri::async_runtime::spawn_blocking(move || c.request("sessions", None))
            .await
            .map_err(|e| e.to_string())?,
        None => Ok(json!([])),
    }
}

#[tauri::command]
async fn save_hotkeys(
    window: WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
    bindings: Vec<Binding>,
    target: String,
) -> Result<(), String> {
    local_settings(&window)?;
    config::validate_bindings(&bindings)?;
    if !target.is_empty() {
        let list = desktop_sessions(window, app.clone()).await?;
        if !list.as_array().is_some_and(|a| {
            a.iter()
                .any(|s| s["id"] == target && s["connected"] == true)
        }) {
            return Err("接続中の出力を選び直してください。".into());
        }
        let selected=list.as_array().and_then(|rows|rows.iter().find(|s|s["id"]==target)).unwrap();
        for binding in &bindings {
            let owner=if binding.character_id.is_empty(){selected}else{selected["characters"].as_array().and_then(|rows|rows.iter().find(|c|c["id"]==binding.character_id)).ok_or("配信準備でキャラクターを追加してください。")?};
            if !binding.cue_id.is_empty() && !owner["actions"].as_array().is_some_and(|items|items.iter().any(|item|item["id"]==binding.cue_id)) {
                return Err("このキャラクターに登録した演出を選び直してください。".into());
            }
        }
    }
    {
        let state = app.state::<State>();
        let mut inner = state.inner.lock().unwrap();
        let mut next = inner.config.clone();
        next.enabled = enabled;
        next.bindings = bindings;
        config::save(&state.path, &next)?;
        release_all(&state, &mut inner);
        inner.config = next;
        inner.target = target;
    }
    configure_hotkeys(&app)
}

#[tauri::command]
async fn desktop_start(
    window: WebviewWindow,
    app: tauri::AppHandle,
    config: Config,
) -> Result<(), String> {
    local_settings(&window)?;
    start_app(app, config).await
}

#[tauri::command]
fn save_connection(
    window: WebviewWindow,
    app: tauri::AppHandle,
    data_dir: String,
    see_through_dir: String,
    port: u16,
) -> Result<(), String> {
    local_settings(&window)?;
    let state = app.state::<State>();
    let mut inner = state.inner.lock().unwrap();
    if inner.starting {
        return Err("起動が完了してから保存してください。".into());
    }
    let mut next = inner.config.clone();
    next.data_dir = data_dir.trim().into();
    next.see_through_dir = see_through_dir.trim().into();
    next.port = port;
    next.validate_connection()?;
    config::save(&state.path, &next)?;
    inner.config = next;
    Ok(())
}

async fn start_app(app: tauri::AppHandle, config: Config) -> Result<(), String> {
    {
        let state = app.state::<State>();
        let mut inner = state.inner.lock().unwrap();
        if inner.starting {
            return Err("アプリを起動しています。しばらくお待ちください。".into());
        }
        inner.starting = true;
        inner.startup_error.clear();
    }
    notify(&app);
    let result = start_backend_and_studio(&app, config).await;
    {
        let state = app.state::<State>();
        let mut inner = state.inner.lock().unwrap();
        inner.starting = false;
        if let Err(error) = &result {
            inner.startup_error = error.clone();
        }
    }
    notify(&app);
    if result.is_err() {
        show_settings(&app);
    } else if let Some(window) = app.get_webview_window("desktop") {
        let _ = window.hide();
    }
    result
}

async fn start_backend_and_studio(app: &tauri::AppHandle, config: Config) -> Result<(), String> {
    config.validate_connection()?;
    config::validate_bindings(&config.bindings)?;
    if app.state::<State>().inner.lock().unwrap().backend.is_none() {
        let resource = app.path().resource_dir().map_err(|e| e.to_string())?;
        let bundled = resource.join("backend/svg-through-server.exe");
        let executable = if bundled.is_file() {
            bundled
        } else if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../.desktop-build/backend/svg-through-server/svg-through-server.exe")
        } else {
            return Err("同梱サーバーがありません。配布フォルダ全体を展開してください。".into());
        };
        let log_dir = app.state::<State>().path.parent().unwrap().to_owned();
        let next = config.clone();
        let backend = tauri::async_runtime::spawn_blocking(move || {
            backend::start(&next, &executable, &log_dir)
        })
        .await
        .map_err(|e| e.to_string())??;
        let state = app.state::<State>();
        let mut inner = state.inner.lock().unwrap();
        config::save(&state.path, &config)?;
        inner.config = config;
        inner.backend = Some(backend);
    }
    open_studio(app.clone()).await?;
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let starting = app.state::<State>().inner.lock().unwrap().starting;
        if !starting && open_studio(app.clone()).await.is_err() {
            show_settings(&app);
        }
    });
}

#[tauri::command]
async fn desktop_home(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    local_settings(&window)?;
    open_studio(app).await?;
    window.hide().map_err(|e| e.to_string())
}

fn allowed_url(url: &tauri::Url, origin: &str) -> bool {
    url.as_str() == "about:blank" || url.origin().ascii_serialization() == origin
}

fn output_session(url: &tauri::Url) -> Option<String> {
    if url.path() != "/web/player.html" || url.query_pairs().any(|(k, _)| k == "display") {
        return None;
    }
    url.query_pairs().find_map(|(key, value)| {
        (key == "session" && value.len() == 32 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
            .then(|| value.into_owned())
    })
}

#[derive(Debug, PartialEq)]
enum SettingsView {
    App,
    Hotkeys(String),
}

// Opening a settings window is a native navigation action, not an HTTP API.
// Only this app's output page can request it; it grants no settings commands.
fn output_settings_view(source: &tauri::Url, request: &tauri::Url, origin: &str) -> Option<SettingsView> {
    if source.origin().ascii_serialization() != origin
        || request.origin().ascii_serialization() != origin
        || request.path() != "/__desktop/settings"
    {
        return None;
    }
    let session = output_session(source)?;
    match request.query_pairs().find(|(key, _)| key == "view")?.1.as_ref() {
        "app" => Some(SettingsView::App),
        "hotkeys" => Some(SettingsView::Hotkeys(session)),
        _ => None,
    }
}

#[cfg(test)]
mod output_settings_tests {
    use super::*;

    #[test]
    fn settings_use_the_calling_output_session() {
        let origin = "http://127.0.0.1:18765";
        let session = "0123456789abcdef0123456789abcdef";
        let source = format!("{origin}/web/player.html?session={session}").parse().unwrap();
        let hotkeys = format!("{origin}/__desktop/settings?view=hotkeys&session=ignored").parse().unwrap();
        let app = format!("{origin}/__desktop/settings?view=app").parse().unwrap();
        assert_eq!(output_settings_view(&source, &hotkeys, origin), Some(SettingsView::Hotkeys(session.into())));
        assert_eq!(output_settings_view(&source, &app, origin), Some(SettingsView::App));
    }

    #[test]
    fn settings_reject_unrelated_pages_and_origins() {
        let origin = "http://127.0.0.1:18765";
        let path = "/web/player.html?session=0123456789abcdef0123456789abcdef";
        let request = format!("{origin}/__desktop/settings?view=hotkeys").parse().unwrap();
        for source in [format!("{origin}/"), format!("{origin}{path}&display=1"),
            format!("{origin}/web/player.html?session=invalid"), format!("http://127.0.0.1:18766{path}")] {
            assert_eq!(output_settings_view(&source.parse().unwrap(), &request, origin), None);
        }
        let source = format!("{origin}{path}").parse().unwrap();
        for url in ["http://127.0.0.1:18766/__desktop/settings?view=hotkeys",
            "http://127.0.0.1:18765/__desktop/settings?view=exit",
            "http://127.0.0.1:18765/__desktop/settings",
            "http://127.0.0.1:18765/other?view=hotkeys"] {
            assert_eq!(output_settings_view(&source, &url.parse().unwrap(), origin), None);
        }
    }
}

// Editor and output windows only load this instance's loopback origin. They
// receive no Tauri capability and keep using the existing HTTP/WebSocket API.
fn studio_builder<'a>(
    app: &'a tauri::AppHandle,
    label: &str,
    url: tauri::Url,
    origin: String,
) -> WebviewWindowBuilder<'a, tauri::Wry, tauri::AppHandle> {
    let nav_origin = origin.clone();
    let nav_app = app.clone();
    let nav_label = label.to_owned();
    let popup_app = app.clone();
    let popup_origin = origin.clone();
    WebviewWindowBuilder::new(app,label,WebviewUrl::External(url))
        .title("SVG-Through Motion").inner_size(1280.,860.).min_inner_size(760.,540.).visible(true).center()
        .disable_drag_drop_handler()
        .initialization_script("window.__SVG_THROUGH_DESKTOP__ = true;")
        .additional_browser_args("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows")
        .on_navigation(move|url| {
            if url.path() == "/__desktop/settings" {
                if let Some(source) = nav_app.get_webview_window(&nav_label).and_then(|w| w.url().ok()) {
                    match output_settings_view(&source, url, &nav_origin) {
                        Some(SettingsView::App) => show_settings(&nav_app),
                        Some(SettingsView::Hotkeys(session)) => show_settings_for(&nav_app, Some(session)),
                        None => (),
                    }
                }
                return false;
            }
            allowed_url(url,&nav_origin)
        })
        .on_document_title_changed(|window,title|{let _=window.set_title(&title);})
        .on_page_load(|window, _| {
            let _ = window.remove_menu();
        })
        .on_new_window(move|url,features|{
            if !allowed_url(&url,&popup_origin){return tauri::webview::NewWindowResponse::Deny;}
            let label=format!("output-{}",uuid::Uuid::new_v4());
            match studio_builder(&popup_app,&label,"about:blank".parse().unwrap(),popup_origin.clone()).window_features(features).build(){
                Ok(window)=>tauri::webview::NewWindowResponse::Create{window},
                Err(_)=>tauri::webview::NewWindowResponse::Deny,
            }
        })
}

async fn open_studio(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("studio") {
        w.show().map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let url = app
        .state::<State>()
        .inner
        .lock()
        .unwrap()
        .backend
        .as_ref()
        .ok_or("アプリを起動してください。")?
        .connection
        .url
        .clone();
    let window = studio_builder(
        &app,
        "studio",
        url.parse().map_err(|_| "URLが不正です。")?,
        url,
    )
    .build()
    .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn desktop_exit(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    local_settings(&window)?;
    request_exit(app);
    Ok(())
}
fn request_exit(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        if app.dialog().message("すべての出力と処理サーバーを終了します。編集中の内容は制作画面で保存してから終了してください。")
            .title("SVG-Through Motionを終了しますか？").kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("終了する".into(),"作業を続ける".into())).blocking_show(){app.exit(0);}
    });
}

fn main() {
    let (tx, rx) = mpsc::channel::<(Connection, Value)>();
    let app=tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event|{
            let state=app.state::<State>();let mut inner=state.inner.lock().unwrap();
            let Some(binding)=inner.registered.get(&shortcut.id()).cloned()else{return};
            let pressed=event.state()==ShortcutState::Pressed;
            if pressed {if !inner.pressed.insert(shortcut.id()){return;}}else if !inner.pressed.remove(&shortcut.id()){return;}
            if !pressed&&binding.mode!="hold"{return;}
            if let Some(backend)=&inner.backend{
                let action=if !binding.cue_id.is_empty(){"cue"}else if pressed{binding.mode.as_str()}else{"release"};
                let _=state.queue.send((backend.connection.clone(),json!({"session_id":inner.target,"action":action,"index":binding.index,"key":shortcut.id().to_string(),"cue_id":binding.cue_id,"character_id":binding.character_id})));
            }
        }).build())
        .setup(move|app|{
            let path=std::env::var_os("SVG_THROUGH_DESKTOP_SETTINGS").map(PathBuf::from)
                .unwrap_or(app.path().app_config_dir()?.join("desktop.json"));
            let (mut config,errors)=match std::fs::read(&path){
                Ok(bytes)=>match serde_json::from_slice::<Config>(&bytes){Ok(c)=>(c,vec![]),Err(_)=>(Config::default(),vec!["保存された設定を読めませんでした。保存先とキーを設定し直してください。".into()])},
                Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(Config::default(),vec![]),
                Err(e)=>(Config::default(),vec![format!("設定を読めませんでした：{e}")]),
            };
            config.fill_data_dir(&std::env::current_exe()?)?;
            let auto_start = errors.is_empty();
            let initial_config = config.clone();
            app.manage(State{inner:Mutex::new(Inner{config,backend:None,starting:false,startup_error:String::new(),target:String::new(),settings_target:None,settings_revision:0,registered:HashMap::new(),pressed:HashSet::new(),errors,last_event:String::new()}),path,queue:tx});
            let handle=app.handle().clone();
            std::thread::spawn(move||for(connection,message)in rx{
                let result=connection.request("expression",Some(&message));
                let text=match result{Ok(_) if message["action"]=="cue"=>"登録した演出を呼び出しました".into(),Ok(_)=>format!("{}：表情 {}",if message["action"]=="release"||message["action"]=="release_all"{"一時表情を解除"}else{"切り替えました"},message["index"].as_u64().unwrap_or(0)+1),Err(e)=>e};
                handle.state::<State>().inner.lock().unwrap().last_event=text;notify(&handle);
            });
            let handle = app.handle().clone();
            if auto_start {
                tauri::async_runtime::spawn(async move { let _ = start_app(handle, initial_config).await; });
            } else { show_settings(&handle); }
            Ok(())
        })
        .on_window_event(|window,event|{
            if let tauri::WindowEvent::CloseRequested{api,..}=event {
                if window.label()=="desktop" {
                    api.prevent_close();
                    if window.app_handle().get_webview_window("studio").is_some() { let _ = window.hide(); }
                    else { request_exit(window.app_handle().clone()); }
                } else if window.label()=="studio" {
                    api.prevent_close(); request_exit(window.app_handle().clone());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![desktop_state,choose_folder,desktop_sessions,save_hotkeys,save_connection,desktop_start,desktop_home,desktop_exit])
        .build(tauri::generate_context!()).expect("SVG-Through Desktop could not start");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = app.global_shortcut().unregister_all();
            let backend = app.state::<State>().inner.lock().unwrap().backend.take();
            drop(backend);
        }
    });
}
