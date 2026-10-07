# App API 全集路线 — 调研结论与实施蓝图（2026-10-07）

> 目的：突破红果网页版"未登录每剧仅 3 集试看"的限制，实现全集可看（原版 Windows 同款能力）。
> 结论：**可行，但需要本机常驻 Android 模拟器（AVD）作签名预言机**。离线 unidbg 签名对新版红果已失效（详见下文证据）。

## 1. 现状证据（本机实测 2026-10-07）

| 实验 | 结果 |
|---|---|
| unidbg-sign.jar 在 macOS ARM 启动（`com.hongguo.sign.FqTrace serve 9099`） | ✅ 成功（jar 自带 `natives/osx_arm64/`，JRE17 直接跑） |
| 签名服务输出 X-Argus/X-Gorgon/X-Ladon/X-Khronos/X-Medusa 全套头 | ✅ 成功 |
| 用该签名请求红果 App API（search，随机设备指纹） | ❌ HTTP 200 空 body（网关静默拦截） |
| 作者 6-30 接力文档 | 明确「红果 7.2.5.32 换新代 metasec SDK，证书机制不同，FqTrace 跨 App 打法对新 SDK 不通用」 |
| 作者对离线签名的评级 | 「真正的墙 = fresh 设备注册，研究级、高不确定性」 |

另：作者 MAC_ARM_PLAN.md 已验证 Apple Silicon 上 arm64 AVD + Frida 预言机可行且比 MuMu（x86+Houdini）快得多。

## 2. 红果网页版事实（当前版本行为）

- 每部剧 `accessible_episode_cnt` ≈ 3（各剧不同），超出集数播放页直接 404
- 网页版无任何登录体系（首页/详情/播放页零登录元素、零 passport 引用）→ **Web 登录路线不存在**
- 已上线应对：详情/选集 🔒 锁定提示 + 友好错误文案（commit 24cffeb）

## 3. App API 技术栈（原作者已开源，位于 reference/zhangbaio-hongguo）

| 环节 | 资产 | 状态 |
|---|---|---|
| 签名预言机 | Android 模拟器 + 红果 App + Frida（oracle.py/downloader.py "keybox 预言机"） | ✅ 已验证可用（Mac arm64 更快） |
| 离线签名（备用） | unidbg-sign.jar（跨 App 签名） | ❌ 对新版红果 SDK 失效，需攻关 fresh 设备注册（研究级） |
| API 客户端 | hongguo.py（search/episodes/multi_video_model，游客可调） | ✅ 现成 |
| 视频解密 | frida/offline_decrypt.py：spade_a→纯字节变换 unwrap→AES-128-CTR（CENC），100% 离线 | ✅ 已攻破并验证 |
| 流服务 | server.py /stream（Range 代理+解密串流） | ✅ 现成可参考 |
| 设备指纹 | devicepool.py：随机自洽设备身份即可，**无需注册** | ✅ 现成 |

## 4. 实施蓝图（获得用户确认模拟器前提后执行）

1. **环境**：Android Studio（Apple Silicon 原生）+ arm64 AVD（API 33/34）+ frida-server + 红果 APK（7.2.x）
   - 作者 MAC_ARM_PLAN.md 有完整环境清单（§1-2）
2. **预言机**：Frida hook metasec 出签名（downloader.py/oracle.py 现成）→ 本机 HTTP 签名服务（sign_server.py 改造，:9099 /sign 协议不变）
3. **数据面**：hongguo.py 拉搜索/全集/加密直链+spade_a → Rust `frontend_server` 增加 `/app/*` 代理（复用 tiny_http）
4. **播放**：AVPlayer 播解密流。解密方案二选一：
   a. Python sidecar 解密串流（server.py /stream 模式，最快落地）
   b. Rust 移植 AES-CTR 解密（aes/ctr crate，性能好，工程量+1天）
5. **打包**：sidecar（python venv + 脚本）随 .app 分发；模拟器作为外部前置依赖写进 README

## 5. 风险

- 字节随时改协议/风控（原作者 6 月至今已迭代 3 轮）；模拟器检测
- 红果 App 版本升级需重新抓 metasec 偏移
- 合规：仅供个人学习，勿分发解密内容
