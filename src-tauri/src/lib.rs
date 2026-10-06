mod avplayer;
mod commands;
mod frontend_server;
pub mod hongguo;
pub mod store;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_BOSS_KEY: &str = "CmdOrCtrl+Shift+H";

fn boss_key_of(store: &store::Store) -> String {
    store
        .setting_get("boss_key")
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_BOSS_KEY.to_string())
}

/// （重新）注册老板键；保存设置后由前端调用。
fn register_boss_key(app: &tauri::AppHandle, accelerator: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    let sc: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("无效的快捷键：{accelerator}"))?;
    gs.register(sc).map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            // 老板键隐藏：通知前端（可选静音），再隐藏窗口
            let _ = win.emit("boss-key", "hide");
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
            let _ = win.emit("boss-key", "show");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let store = app.state::<store::Store>();
                        let current = boss_key_of(&store);
                        if shortcut.to_string() == current {
                            toggle_main_window(app);
                        }
                    }
                })
                .build(),
        )
        .manage(
            hongguo::Hongguo::new().expect("初始化 HTTP 客户端失败"),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = store::Store::open(&dir).map_err(|e| format!("初始化本地数据失败：{e}"))?;
            let boss = boss_key_of(&store);
            if let Err(e) = register_boss_key(app.handle(), &boss) {
                eprintln!("老板键注册失败：{e}");
            }

            // 托盘
            let show = MenuItem::with_id(app, "show", "显示红果桌面版", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = tauri::include_image!("icons/32x32.png");
            tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("红果桌面版")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            app.manage(store);

            // macOS 26.6+ WKWebView 对 tauri:// 自定义协议主帧导航存在回归
            // （release 白屏，debug 的 http devUrl 正常），改用内嵌 HTTP 服务前端；
            // frontendDist 指向首选地址使 IPC 按本地来源放行（见 frontend_server.rs）。
            let port = frontend_server::start()?;
            let mut url: tauri::Url = format!("http://127.0.0.1:{port}/").parse().unwrap();
            // 测试钩子：HG_TEST_HASH=player/{sid}?ep=1 直接以播放页启动
            if let Ok(h) = std::env::var("HG_TEST_HASH") {
                if !h.is_empty() {
                    url.set_fragment(Some(h.as_str()));
                }
            }
            // 原生 AVPlayer 视频层垫底：webview 需透明，播放页视频区域透出原生画面
            // （macOS 26.6+ WKWebView 的 <video>/canvas 合成层上屏失效，见 avplayer.rs）
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("红果桌面版")
                .inner_size(1280.0, 800.0)
                .min_inner_size(980.0, 620.0)
                .center()
                .transparent(true)
                .build()?;

            // 原生播放层插到 webview 之下（主线程）
            let win = app.get_webview_window("main").ok_or("主窗口缺失")?;
            let ns = win.ns_window().map_err(|e| format!("获取 NSWindow 失败: {e}"))?;
            let player = avplayer::create_under_webview(ns)?;
            app.manage(player);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::home_feed,
            commands::category_page,
            commands::search_page,
            commands::detail_page,
            commands::play_info,
            commands::check_connection,
            commands::history_upsert,
            commands::history_list,
            commands::history_remove,
            commands::history_clear,
            commands::favorite_toggle,
            commands::favorite_is,
            commands::favorite_list,
            commands::setting_get,
            commands::setting_set,
            commands::wipe_all,
            commands::apply_boss_key,
            commands::av_load,
            commands::av_play,
            commands::av_pause,
            commands::av_seek,
            commands::av_set_rate,
            commands::av_set_muted,
            commands::av_position,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let store = window.app_handle().state::<store::Store>();
                let close_to_tray =
                    store.setting_get("close_to_tray").map(|v| v == "1").unwrap_or(false);
                if close_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("红果桌面版启动失败");
}
