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
    target: String,
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
    if let Some(w) = app.get_webview_window("desktop") {
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
        json!({"config":inner.config,"running":inner.backend.is_some(),"url":inner.backend.as_ref().map(|b|&b.connection.url),"target":inner.target,"registered":inner.registered.len(),"errors":inner.errors,"last_event":inner.last_event}),
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
    notify(&app);
    Ok(())
}

fn allowed_url(url: &tauri::Url, origin: &str) -> bool {
    url.as_str() == "about:blank" || url.origin().ascii_serialization() == origin
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
    let popup_app = app.clone();
    let popup_origin = origin.clone();
    WebviewWindowBuilder::new(app,label,WebviewUrl::External(url))
        .title("SVG-Through Motion").inner_size(1280.,860.).min_inner_size(760.,540.).visible(true).center()
        .disable_drag_drop_handler()
        .additional_browser_args("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows")
        .on_navigation(move|url|allowed_url(url,&nav_origin))
        .on_document_title_changed(|window,title|{let _=window.set_title(&title);})
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
        .plugin(tauri_plugin_single_instance::init(|app,_,_|show_settings(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event|{
            let state=app.state::<State>();let mut inner=state.inner.lock().unwrap();
            let Some(binding)=inner.registered.get(&shortcut.id()).cloned()else{return};
            let pressed=event.state()==ShortcutState::Pressed;
            if pressed {if !inner.pressed.insert(shortcut.id()){return;}}else if !inner.pressed.remove(&shortcut.id()){return;}
            if !pressed&&binding.mode!="hold"{return;}
            if let Some(backend)=&inner.backend{
                let action=if pressed{binding.mode.as_str()}else{"release"};
                let _=state.queue.send((backend.connection.clone(),json!({"session_id":inner.target,"action":action,"index":binding.index,"key":shortcut.id().to_string()})));
            }
        }).build())
        .setup(move|app|{
            let path=std::env::var_os("SVG_THROUGH_DESKTOP_SETTINGS").map(PathBuf::from)
                .unwrap_or(app.path().app_config_dir()?.join("desktop.json"));
            let (config,errors)=match std::fs::read(&path){
                Ok(bytes)=>match serde_json::from_slice::<Config>(&bytes){Ok(c)=>(c,vec![]),Err(_)=>(Config::default(),vec!["保存された設定を読めませんでした。保存先とキーを設定し直してください。".into()])},
                Err(_)=>(Config::default(),vec![]),
            };
            app.manage(State{inner:Mutex::new(Inner{config,backend:None,target:String::new(),registered:HashMap::new(),pressed:HashSet::new(),errors,last_event:String::new()}),path,queue:tx});
            let handle=app.handle().clone();
            std::thread::spawn(move||for(connection,message)in rx{
                let result=connection.request("expression",Some(&message));
                let text=match result{Ok(_)=>format!("{}：表情 {}",if message["action"]=="release"||message["action"]=="release_all"{"一時表情を解除"}else{"切り替えました"},message["index"].as_u64().unwrap_or(0)+1),Err(e)=>e};
                handle.state::<State>().inner.lock().unwrap().last_event=text;notify(&handle);
            });
            let settings=tauri::menu::MenuItem::with_id(app,"settings","アプリ設定・ホットキー",true,None::<&str>)?;
            let exit=tauri::menu::MenuItem::with_id(app,"exit","終了",true,None::<&str>)?;
            let menu=tauri::menu::Menu::with_items(app,&[&tauri::menu::Submenu::with_items(app,"アプリ",true,&[&settings,&exit])?])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app,event|match event.id().as_ref(){"settings"=>show_settings(app),"exit"=>request_exit(app.clone()),_=>()})
        .on_window_event(|window,event|{if window.label()=="desktop" {if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();request_exit(window.app_handle().clone());}}})
        .invoke_handler(tauri::generate_handler![desktop_state,choose_folder,desktop_sessions,save_hotkeys,desktop_start,desktop_exit])
        .build(tauri::generate_context!()).expect("SVG-Through Desktop could not start");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = app.global_shortcut().unregister_all();
            let backend = app.state::<State>().inner.lock().unwrap().backend.take();
            drop(backend);
        }
    });
}
