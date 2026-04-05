#!/usr/bin/env bash
# Attempt to download sqlite-wasm runtime into public/sqlite/
set -e
OUT_DIR="$(cd "$(dirname "$0")/public/sqlite" && pwd)"
echo "Target: $OUT_DIR"
mkdir -p "$OUT_DIR"

echo "Please download the official sqlite-wasm runtime from https://sqlite.org/wasm/ and place the runtime files here:"
echo " - copy the runtime JS and WASM files into extension/public/sqlite/"
echo "Example runtime files: sqlite-wasm.data, sqlite-wasm.wasm, sqlite-wasm.js (names vary by distribution)"

if command -v curl >/dev/null 2>&1; then
  echo "curl available — but this script does not attempt automatic download to avoid hitting outdated urls."
fi

exit 0
