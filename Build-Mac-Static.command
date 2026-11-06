#!/bin/zsh
set -eu
root="${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node_path=$(command -v node) || { echo '需要 Node.js 24 或更新版本。'; exit 1; }
"$node_path" -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)' || { echo '需要 Node.js 24 或更新版本。'; exit 1; }
app='/Applications/ChatGPT.app'
target="$HOME/Applications/桑多涅 ChatGPT.app"
[[ -f "$app/Contents/Resources/electron.icns" ]] || { echo '未找到 /Applications/ChatGPT.app 或应用图标。'; exit 1; }
[[ ! -e "$target" ]] || { echo "目标已存在，不会覆盖：$target"; exit 1; }
stage=$(/usr/bin/mktemp -d /tmp/sandrone-build.XXXXXXXX)
trap '/bin/rm -rf -- "$stage"' EXIT
bundle="$stage/桑多涅 ChatGPT.app"
/usr/bin/osacompile -o "$bundle" "$root/macos/static/macos-launcher.applescript"
resources="$bundle/Contents/Resources"
/bin/cp "$root/macos/static/macos-skin.mjs" "$resources/macos-skin.mjs"
/bin/cp "$root/macos/static/macos-skin-utils.mjs" "$resources/macos-skin-utils.mjs"
/bin/cp "$root/themes/sandrone/background.png" "$resources/Sandrone-background.png"
/bin/cp "$app/Contents/Resources/electron.icns" "$resources/applet.icns"
printf '%s' "$node_path" > "$resources/node-path.txt"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string local.sandrone.launcher' -c 'Delete :CFBundleIconName' "$bundle/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$bundle"
/bin/mkdir -p "$HOME/Applications"
/usr/bin/ditto "$bundle" "$target"
echo "已生成：$target"
echo '保存工作并完全退出 ChatGPT 后，再从该启动器打开。'
