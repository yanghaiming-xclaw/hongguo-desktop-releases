import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, APP_VERSION, ConnStatus, SOURCE_REPO } from "../api";
import TopBar from "../components/TopBar";

function Switch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export default function Settings() {
  const [bossKey, setBossKey] = useState("");
  const [bossSaved, setBossSaved] = useState("");
  const [muteHide, setMuteHide] = useState(false);
  const [closeTray, setCloseTray] = useState(false);
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  useEffect(() => {
    api.settingGet("boss_key").then((v) => {
      setBossKey(v || "CmdOrCtrl+Shift+H");
      setBossSaved(v || "CmdOrCtrl+Shift+H");
    });
    api.settingGet("mute_on_hide").then((v) => setMuteHide(v === "1"));
    api.settingGet("close_to_tray").then((v) => setCloseTray(v === "1"));
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    setUpdateMsg("");
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${SOURCE_REPO}/releases/latest`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const latest: string = (data.tag_name || "").replace(/^v/, "");
      if (latest && latest !== APP_VERSION) {
        setUpdateMsg(`发现新版本 ${latest}，正在打开下载页…`);
        openUrl(data.html_url).catch(() => {});
      } else {
        setUpdateMsg(`已是最新版本（${APP_VERSION}）`);
      }
    } catch (e) {
      setUpdateMsg(`检查失败：${e}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <TopBar />
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-title">设置</div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="label">播放服务</div>
              <div className="desc">检查与红果网页版内容服务的连接（对齐原版「设置 → 播放服务」）</div>
              {conn && (
                <div className="desc" style={{ color: conn.ok ? "#2e9e5b" : "var(--accent)" }}>
                  {conn.message}（{conn.latency_ms}ms）
                </div>
              )}
            </div>
            <button
              className="danger-btn"
              style={{ color: "#22242a", background: "#fff", borderColor: "var(--line)" }}
              onClick={async () => {
                setConn(null);
                setConn(await api.checkConnection());
              }}
            >
              检查连接
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">老板键</div>
              <div className="desc">全局快捷键，隐藏 / 恢复窗口（隐藏不会自动暂停或静音）</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={bossKey}
                placeholder="CmdOrCtrl+Shift+H"
                onChange={(e) => setBossKey(e.target.value)}
              />
              <button
                className="danger-btn"
                style={{ color: "#fff", background: "var(--accent)", borderColor: "var(--accent)" }}
                onClick={async () => {
                  try {
                    await api.applyBossKey(bossKey.trim());
                    setBossSaved(bossKey.trim());
                    alert("老板键已生效：" + bossKey.trim());
                  } catch (e) {
                    alert("设置失败：" + e);
                  }
                }}
                disabled={bossKey.trim() === bossSaved}
              >
                保存
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">老板键隐藏时静音</div>
              <div className="desc">用老板键隐藏窗口时自动静音，恢复时取消</div>
            </div>
            <Switch
              on={muteHide}
              onChange={(v) => {
                setMuteHide(v);
                api.settingSet("mute_on_hide", v ? "1" : "0");
              }}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="label">关闭窗口时最小化到托盘</div>
              <div className="desc">点 × 不退出程序，从菜单栏托盘图标恢复（与原版行为一致）</div>
            </div>
            <Switch
              on={closeTray}
              onChange={(v) => {
                setCloseTray(v);
                api.settingSet("close_to_tray", v ? "1" : "0");
              }}
            />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="label">检查更新</div>
              <div className="desc">
                当前版本 {APP_VERSION}
                {updateMsg && ` · ${updateMsg}`}
              </div>
            </div>
            <button
              className="danger-btn"
              style={{ color: "#22242a", background: "#fff", borderColor: "var(--line)" }}
              onClick={checkUpdate}
              disabled={checking}
            >
              {checking ? "检查中…" : "检查更新"}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="label">数据管理</div>
              <div className="desc">观看进度与收藏仅保存在本机</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="danger-btn"
                onClick={async () => {
                  if (confirm("清空观看历史？（收藏保留）")) {
                    await api.historyClear();
                    alert("已清空观看历史");
                  }
                }}
              >
                清空历史
              </button>
              <button
                className="danger-btn"
                onClick={async () => {
                  if (confirm("清除全部数据（历史+收藏+设置）？此操作不可恢复。")) {
                    await api.wipeAll();
                    alert("已清除全部本机数据");
                  }
                }}
              >
                清除全部
              </button>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="label">关于 红果桌面版（Mac）</div>
              <div className="desc" style={{ lineHeight: 1.8 }}>
                v{APP_VERSION} · 非官方复刻，与红果短剧运营方无合作关系，仅供个人学习。
                <br />
                复刻自 {SOURCE_REPO}（Windows 版）。内容来自红果短剧官方网页版，版权归原方所有。
              </div>
            </div>
            <button
              className="danger-btn"
              style={{ color: "#22242a", background: "#fff", borderColor: "var(--line)" }}
              onClick={() => openUrl(`https://github.com/${SOURCE_REPO}`).catch(() => {})}
            >
              源码仓库
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
