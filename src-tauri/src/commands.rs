//! Tauri IPC 命令层。

use crate::avplayer::{AvLoadInfo, AvPlayer, AvPosition};
use crate::hongguo::{self, Hongguo};
use crate::store::{FavoriteItem, HistoryItem, Store};
use std::sync::Mutex;
use tauri::State;

type PlayerState<'a> = State<'a, Mutex<AvPlayer>>;

#[tauri::command]
pub async fn home_feed(hg: State<'_, Hongguo>) -> Result<hongguo::HomeFeed, String> {
    hg.home().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn category_page(
    hg: State<'_, Hongguo>,
    route: String,
    page: Option<u32>,
) -> Result<hongguo::CategoryPage, String> {
    hg.category(&route, page.unwrap_or(1)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_page(
    hg: State<'_, Hongguo>,
    keyword: String,
    page: Option<u32>,
) -> Result<hongguo::SearchPage, String> {
    hg.search(&keyword, page.unwrap_or(1)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn detail_page(
    hg: State<'_, Hongguo>,
    series_id: String,
) -> Result<hongguo::Detail, String> {
    hg.detail(&series_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn play_info(
    hg: State<'_, Hongguo>,
    series_id: String,
    vid: Option<String>,
    ep: Option<i64>,
) -> Result<hongguo::PlayInfo, String> {
    hg.play_info(&series_id, vid.as_deref(), ep).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_connection(hg: State<'_, Hongguo>) -> Result<hongguo::ConnStatus, String> {
    Ok(hg.check_connection().await)
}

// ---------- 历史 ----------

#[tauri::command]
pub async fn history_upsert(store: State<'_, Store>, item: HistoryItem) -> Result<(), String> {
    store.history_upsert(&item)
}

#[tauri::command]
pub async fn history_list(store: State<'_, Store>) -> Result<Vec<HistoryItem>, String> {
    store.history_list()
}

#[tauri::command]
pub async fn history_remove(store: State<'_, Store>, series_id: String) -> Result<(), String> {
    store.history_remove(&series_id)
}

#[tauri::command]
pub async fn history_clear(store: State<'_, Store>) -> Result<(), String> {
    store.history_clear()
}

// ---------- 收藏 ----------

#[tauri::command]
pub async fn favorite_toggle(store: State<'_, Store>, item: FavoriteItem) -> Result<bool, String> {
    store.favorite_toggle(&item)
}

#[tauri::command]
pub async fn favorite_is(store: State<'_, Store>, series_id: String) -> Result<bool, String> {
    store.favorite_is(&series_id)
}

#[tauri::command]
pub async fn favorite_list(store: State<'_, Store>) -> Result<Vec<FavoriteItem>, String> {
    store.favorite_list()
}

// ---------- 设置 ----------

#[tauri::command]
pub async fn setting_get(store: State<'_, Store>, key: String) -> Result<Option<String>, String> {
    Ok(store.setting_get(&key))
}

#[tauri::command]
pub async fn setting_set(
    store: State<'_, Store>,
    key: String,
    value: String,
) -> Result<(), String> {
    store.setting_set(&key, &value)
}

#[tauri::command]
pub async fn wipe_all(store: State<'_, Store>) -> Result<(), String> {
    store.wipe_all()
}

// ---------- 原生播放器（AVPlayer） ----------

#[tauri::command]
pub async fn av_load(
    player: PlayerState<'_>,
    url: String,
) -> Result<AvLoadInfo, String> {
    player.lock().unwrap().load(&url);
    // 时长可能尚未就绪，前端通过 av_position 轮询补齐
    Ok(AvLoadInfo { duration: 0.0 })
}

#[tauri::command]
pub async fn av_play(player: PlayerState<'_>) -> Result<(), String> {
    player.lock().unwrap().play();
    Ok(())
}

#[tauri::command]
pub async fn av_pause(player: PlayerState<'_>) -> Result<(), String> {
    player.lock().unwrap().pause();
    Ok(())
}

#[tauri::command]
pub async fn av_seek(player: PlayerState<'_>, seconds: f64) -> Result<(), String> {
    player.lock().unwrap().seek(seconds);
    Ok(())
}

#[tauri::command]
pub async fn av_set_rate(player: PlayerState<'_>, rate: f64) -> Result<(), String> {
    player.lock().unwrap().set_rate(rate);
    Ok(())
}

#[tauri::command]
pub async fn av_set_muted(player: PlayerState<'_>, muted: bool) -> Result<(), String> {
    player.lock().unwrap().set_muted(muted);
    Ok(())
}

#[tauri::command]
pub async fn av_set_volume(player: PlayerState<'_>, volume: f64) -> Result<(), String> {
    player.lock().unwrap().set_volume(volume);
    Ok(())
}

#[tauri::command]
pub async fn av_position(player: PlayerState<'_>) -> Result<AvPosition, String> {
    Ok(player.lock().unwrap().position())
}

// ---------- 老板键 / 应用级 ----------

#[tauri::command]
pub async fn apply_boss_key(
    app: tauri::AppHandle,
    store: State<'_, Store>,
    accelerator: String,
) -> Result<(), String> {
    // 先落库再注册，保证 handler 读到一致配置；失败时回滚
    let old = store
        .setting_get("boss_key")
        .unwrap_or_else(|| crate::DEFAULT_BOSS_KEY.to_string());
    store.setting_set("boss_key", &accelerator)?;
    if let Err(e) = crate::register_boss_key(&app, &accelerator) {
        store.setting_set("boss_key", &old).ok();
        return Err(e);
    }
    Ok(())
}
