#!/usr/bin/env bash
# Google（Apps Script）に貼り付ける2つのファイルを作る
#   gas/Code.gs    … gas-src/Code.head.gs と server-core.js をつなげたもの
#   gas/Index.html … index.html に、CSS と JavaScript を全部埋めこんで1つにしたもの
#                    （data-local がついた「このPCで試すとき用」のファイルは入れない）
# 使い方: bash tools/build-gas.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p gas

{
  cat gas-src/Code.head.gs
  echo
  echo "// ===== ここから下は server-core.js（中身の処理） ====="
  cat server-core.js
} > gas/Code.gs

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ \<link\ rel=\"stylesheet\"\ href=\"([^\"]+)\"\> ]]; then
    echo "  <style>"
    cat "${BASH_REMATCH[1]}"
    echo "  </style>"
  elif [[ "$line" =~ data-local ]]; then
    continue
  elif [[ "$line" =~ \<script\ src=\"([^\"]+)\"\>\</script\> ]]; then
    echo "  <script>"
    cat "${BASH_REMATCH[1]}"
    echo "  </script>"
  else
    printf '%s\n' "$line"
  fi
done < index.html > gas/Index.html

# 埋めこみ漏れがないか確かめる
if grep -q '<script src=' gas/Index.html || grep -q 'rel="stylesheet"' gas/Index.html; then
  echo "★埋めこめなかったファイルがあります" >&2
  exit 1
fi

echo "できました:"
wc -c gas/Code.gs gas/Index.html
