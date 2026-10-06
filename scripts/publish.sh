#!/bin/bash
# 发布 mac 分支到 GitHub：登录 gh → fork 上游 → 推送 mac 分支 →（可选）发 DMG release
# 用法：bash scripts/publish.sh [--with-release]
set -euo pipefail

UPSTREAM="waligoraamodio288-rgb/hongguo-desktop-releases"
GH="${GH:-$HOME/.local/bin/gh}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DMG="$ROOT/红果桌面版_1.0.4_aarch64.dmg"
VERSION="1.0.4"

command -v "$GH" >/dev/null || { echo "找不到 gh，请设置 GH 环境变量"; exit 1; }

# 1) 登录（交互式，只需一次）
"$GH" auth status >/dev/null 2>&1 || "$GH" auth login

# 2) fork 上游（已 fork 则跳过）
"$GH" repo fork "$UPSTREAM" --clone=false || true

USER="$("$GH" api user -q .login)"
FORK_URL="https://github.com/${USER}/${UPSTREAM#*/}.git"
echo "fork: $FORK_URL"

# 3) 推送 mac 分支
cd "$ROOT"
git remote remove fork 2>/dev/null || true
git remote add fork "$FORK_URL"
git push -u fork mac
echo "✅ mac 分支已推送：$FORK_URL/tree/mac"

# 4) 可选：把 DMG 发到 fork 的 release（tag: mac-v1.0.4）
if [[ "${1:-}" == "--with-release" ]]; then
  SHA=$(shasum -a 256 "$DMG" | awk '{print $1}')
  "$GH" release create "mac-v${VERSION}" "$DMG" \
    --repo "${USER}/${UPSTREAM#*/}" \
    --target mac \
    --title "红果桌面版 Mac v${VERSION}" \
    --notes "macOS 复刻版（Apple Silicon）。

- 应用：红果桌面版.app（未签名，首次打开请右键 → 打开）
- SHA-256: \`$SHA\`
- 系统要求：macOS 13+；源码见 \`mac\` 分支。仅供个人学习，内容版权归红果短剧运营方。"
  echo "✅ release 已发布：$FORK_URL/releases/tag/mac-v${VERSION}"
fi
