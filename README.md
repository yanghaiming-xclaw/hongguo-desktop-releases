# 红果桌面版 · Mac（hongguo-mac）

在 macOS 上找剧、接着上次看。支持搜索、收藏、本机观看进度续播、选集、倍速和自动连播。

> 本仓库分支是 [waligoraamodio288-rgb/hongguo-desktop-releases](https://github.com/waligoraamodio288-rgb/hongguo-desktop-releases)（红果短剧电脑版，Windows）的 **macOS 复刻**。上游仓库不含源码，本分支包含 Mac 版完整源码。
>
> **非官方项目**：与红果短剧运营方（字节跳动）及上游作者（渠道有数）均无合作关系，仅供个人学习使用。内容来自红果短剧官方网页版（hongguoduanju.com）公开页面，版权归原方所有。

## 功能（对齐上游 v1.0.4）

- **发现**：热播短剧/真人剧/漫剧/AI 剧榜单（热度角标、排名角标）、横幅、分类快捷入口
- **搜索**：剧名/演员搜索，分页
- **详情**：热度/评分/点赞/收藏、简介、标签、全量选集、热门剧评
- **播放**：明文 MP4 直链播放、0.5x–2x 倍速（切集不重置）、自动连播（预取下一集地址）、选集侧栏、断点续播（每 5 秒落盘）
- **收藏 / 历史**：独立存储；历史支持删除单条、清空、进度条展示
- **老板键**：全局快捷键（默认 `⌘⇧H`，可配置）隐藏/恢复窗口；可选隐藏时静音
- **托盘**：菜单栏常驻，可设点 × 进托盘（与原版一致）
- **排行榜 / 探索**：独立榜单页与分类筛选浏览
- **设置**：播放服务连接检查、检查更新、清除数据

## 技术实现

Tauri 2（Rust + WKWebView）+ React 18。上游 Windows 版为 WebView2 壳 + 本地 FastAPI「播放服务」（红果 App API 签名 + CENC 离线解密再串流）；本复刻改走**官方网页版 SSR 数据管线**，更简单也更稳：

```
hongguoduanju.com  ──GET──▶  SSR HTML 内嵌 window._ROUTER_DATA = {...JSON}
                                  │
        ┌─────────────────────────┼──────────────────────────┐
   首页/榜单/分类             搜索 /search/{kw}         详情 /detail?series_id=
   homeSections[]            searchList[]/totalCount    seriesDetail(全量 vid_list)
                                                        播放 /player/{sid}/{vid}
                                                        └─ video_player_info.main_url
                                                           = 带签名明文 MP4（qznovelvod CDN）
```

- 无需签名、无需解密、无需登录；解析集中在 `src-tauri/src/hongguo.rs`，网页版结构变化只需改这一个文件（回归测试：`cargo test`，fixtures 为真实页面快照）。
- MP4 直链有时效签名，播放前即时获取，403 自动重取。
- 本机数据（历史/收藏/设置）存于 `~/Library/Application Support/com.hongguo.mac/hongguo.db`（SQLite）。

## 构建与开发

要求：Node ≥ 20、Rust ≥ 1.77、macOS ≥ 13（Apple Silicon；Intel 同理）。

```bash
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 产出 .app 与 DMG（target/release/bundle/）
cargo test               # 解析器回归测试（8 例）
cargo run --bin probe    # 对真实页面跑内容管线探针
```

## 已知限制

- 未做 Apple 代码签名（无开发者证书），首次打开需右键 → 打开。
- 搜索/分类分页与清晰度选择依赖网页版能力（网页版只提供一档默认清晰度）。
- 观看进度不同步手机红果 App（与原版一致，仅本机）。
- 弹幕、跨设备同步：原版未实现，本版亦未实现。

## 分支说明

- `main`（继承自上游）：Windows 发行说明与附件。
- `mac`（本分支）：macOS 复刻版完整源码，`mac` 分支的 Releases 提供 DMG。
