#!/bin/bash
# 红果桌面版 Mac — App 源（全集）后端三件套启动脚本
# 前置：已按 docs/appapi-路线调研.md 装好 Android SDK/AVD(hg34)/frida/红果 App
# 用法：bash scripts/start-backend.sh   （模拟器与两个服务常驻；应用内超限集自动走此源）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/reference/zhangbaio-hongguo"
SDK="$ROOT/reference/android-sdk"
ADB="$SDK/platform-tools/adb"
JAVA="$ROOT/reference/jdk-17.0.20.1+1-jre/Contents/Home/bin/java"
export JAVA_HOME="$ROOT/reference/jdk-17.0.20.1+1-jre/Contents/Home"
export ANDROID_SDK_ROOT="$SDK"

echo "== 1/4 模拟器（无头，如已运行则跳过）=="
if ! "$ADB" devices | grep -q "emulator-5554"; then
  nohup "$SDK/emulator/emulator" -avd hg34 -no-window -no-audio -gpu swiftshader_indirect -no-boot-anim -no-snapshot > /tmp/hg_emu.log 2>&1 &
  disown
  "$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done; echo booted' > /dev/null 2>&1
fi
"$ADB" root > /dev/null 2>&1; sleep 2
"$ADB" shell "settings put system screen_off_timeout 600000; locksettings set-disabled true; wm dismiss-keyguard" > /dev/null 2>&1

echo "== 2/4 frida-server =="
"$ADB" shell "pidof frida-server" > /dev/null 2>&1 || {
  "$ADB" shell "nohup /data/local/tmp/frida-server >/dev/null 2>&1 &"
  sleep 3
}
"$ADB" forward tcp:27042 tcp:27042 > /dev/null 2>&1

echo "== 3/4 红果 App =="
"$ADB" shell "pidof com.phoenix.read" > /dev/null 2>&1 || {
  "$ADB" shell "am start -n com.phoenix.read/com.dragon.read.pages.splash.SplashActivity" > /dev/null 2>&1
  sleep 15
}
echo "  app pid: $("$ADB" shell pidof com.phoenix.read | tr -d '\r')"

echo "== 4/4 签名服务(:9099) + API 服务(:8000) =="
if ! lsof -nP -iTCP:9099 -sTCP:LISTEN > /dev/null 2>&1; then
  (cd "$REPO" && ADB="$ADB" ADB_DEVICE=emulator-5554 SIGN_PORT=9099 \
    nohup ./venv/bin/python -u sign_server.py > /tmp/hg_signsvc.log 2>&1 & disown)
  sleep 8
fi
if ! lsof -nP -iTCP:8000 -sTCP:LISTEN > /dev/null 2>&1; then
  (cd "$REPO" && SIGN_SERVER=http://127.0.0.1:9099 API_KEYS=hongguo-mac-local \
    nohup ./venv/bin/python -u server.py > /tmp/hg_apiserver.log 2>&1 & disown)
  sleep 8
fi

echo "== 自检 =="
SIG=$(curl -s -m 60 -X POST http://127.0.0.1:9099/sign -H "Content-Type: application/json" \
  -d '{"url":"https://api5-normal-sinfonlinec.fqnovel.com/reading/bookapi/search/tab/v?aid=8662&query=t","headers":{"content-type":"application/json"}}')
echo "$SIG" | grep -q "X-Gorgon" && echo "  签名服务 ✓" || echo "  签名服务 ✗（看 /tmp/hg_signsvc.log）"
STREAM=$(curl -s -m 300 -H "X-API-Key: hongguo-mac-local" -r 0-99 \
  "http://127.0.0.1:8000/stream?series_id=7688666572499471422&ep=150" -o /dev/null -w "%{http_code}")
[ "$STREAM" = "206" ] || [ "$STREAM" = "200" ] && echo "  App 源串流 ✓ (HTTP $STREAM)" || echo "  App 源串流 ✗ (HTTP $STREAM，看 /tmp/hg_apiserver.log)"
echo "== 完成。打开红果桌面版，超出试看的集将自动走 App 源 =="
