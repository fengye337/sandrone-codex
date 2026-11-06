#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
print '請在終端使用：node macos/audit-current.mjs --manual home'
print '其他情境：thread menu settings narrow opening replay disabled restored'
read -r 'scenario?目前情境（預設 home）：'
node macos/audit-current.mjs --manual "${scenario:-home}"
read -r 'reply?按 Enter 關閉。'
