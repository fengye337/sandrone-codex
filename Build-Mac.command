#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node macos/build.mjs
print '測試版尚待實機驗收。請先讀 macos/README.md，勿在進行中的 Work 對話退出應用。'
