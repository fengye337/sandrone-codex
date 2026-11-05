#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node macos/build-preview.mjs
open dist/Sandrone-Mac-preview.html
