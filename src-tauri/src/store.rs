//! 本机数据：观看历史 / 收藏 / 设置（SQLite）。
//! 对齐原版行为：进度仅存本机；清除历史不影响收藏。

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HistoryItem {
    pub series_id: String,
    pub title: String,
    pub cover: String,
    pub vid: String,
    pub ep_index: i64,
    pub ep_total: i64,
    pub position_sec: f64,
    pub duration_sec: f64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FavoriteItem {
    pub series_id: String,
    pub title: String,
    pub cover: String,
    pub tags: String,
    pub created_at: i64,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Store {
    pub fn open(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let conn = Connection::open(dir.join("hongguo.db")).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS history(
               series_id TEXT PRIMARY KEY, title TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '',
               vid TEXT NOT NULL DEFAULT '', ep_index INTEGER NOT NULL DEFAULT 1,
               ep_total INTEGER NOT NULL DEFAULT 0, position_sec REAL NOT NULL DEFAULT 0,
               duration_sec REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE IF NOT EXISTS favorites(
               series_id TEXT PRIMARY KEY, title TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '',
               tags TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ---------- 历史 ----------

    pub fn history_upsert(&self, it: &HistoryItem) -> Result<(), String> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO history(series_id,title,cover,vid,ep_index,ep_total,position_sec,duration_sec,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(series_id) DO UPDATE SET title=?2,cover=?3,vid=?4,ep_index=?5,ep_total=?6,
               position_sec=?7,duration_sec=?8,updated_at=?9",
            rusqlite::params![
                it.series_id,
                it.title,
                it.cover,
                it.vid,
                it.ep_index,
                it.ep_total,
                it.position_sec,
                it.duration_sec,
                now()
            ],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    }

    pub fn history_list(&self) -> Result<Vec<HistoryItem>, String> {
        let c = self.conn.lock().unwrap();
        let mut st = c
            .prepare("SELECT series_id,title,cover,vid,ep_index,ep_total,position_sec,duration_sec,updated_at FROM history ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| {
                Ok(HistoryItem {
                    series_id: r.get(0)?,
                    title: r.get(1)?,
                    cover: r.get(2)?,
                    vid: r.get(3)?,
                    ep_index: r.get(4)?,
                    ep_total: r.get(5)?,
                    position_sec: r.get(6)?,
                    duration_sec: r.get(7)?,
                    updated_at: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    #[allow(dead_code)]
    pub fn history_get(&self, series_id: &str) -> Result<Option<HistoryItem>, String> {
        let items = self.history_list()?;
        Ok(items.into_iter().find(|x| x.series_id == series_id))
    }

    pub fn history_remove(&self, series_id: &str) -> Result<(), String> {
        let c = self.conn.lock().unwrap();
        c.execute("DELETE FROM history WHERE series_id=?1", [series_id])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn history_clear(&self) -> Result<(), String> {
        let c = self.conn.lock().unwrap();
        c.execute("DELETE FROM history", [])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    // ---------- 收藏 ----------

    pub fn favorite_toggle(&self, it: &FavoriteItem) -> Result<bool, String> {
        let c = self.conn.lock().unwrap();
        let exists: bool = c
            .query_row(
                "SELECT 1 FROM favorites WHERE series_id=?1",
                [&it.series_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if exists {
            c.execute("DELETE FROM favorites WHERE series_id=?1", [&it.series_id])
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            c.execute(
                "INSERT INTO favorites(series_id,title,cover,tags,created_at) VALUES(?1,?2,?3,?4,?5)",
                rusqlite::params![it.series_id, it.title, it.cover, it.tags, now()],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    pub fn favorite_is(&self, series_id: &str) -> Result<bool, String> {
        let c = self.conn.lock().unwrap();
        Ok(c.query_row(
            "SELECT 1 FROM favorites WHERE series_id=?1",
            [series_id],
            |_| Ok(true),
        )
        .unwrap_or(false))
    }

    pub fn favorite_list(&self) -> Result<Vec<FavoriteItem>, String> {
        let c = self.conn.lock().unwrap();
        let mut st = c
            .prepare("SELECT series_id,title,cover,tags,created_at FROM favorites ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| {
                Ok(FavoriteItem {
                    series_id: r.get(0)?,
                    title: r.get(1)?,
                    cover: r.get(2)?,
                    tags: r.get(3)?,
                    created_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    // ---------- 设置 ----------

    pub fn setting_get(&self, key: &str) -> Option<String> {
        let c = self.conn.lock().unwrap();
        c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
            r.get::<_, String>(0)
        })
        .ok()
    }

    pub fn setting_set(&self, key: &str, value: &str) -> Result<(), String> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            rusqlite::params![key, value],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    }

    pub fn wipe_all(&self) -> Result<(), String> {
        let c = self.conn.lock().unwrap();
        c.execute_batch("DELETE FROM history; DELETE FROM favorites; DELETE FROM settings;")
            .map_err(|e| e.to_string())
    }
}
