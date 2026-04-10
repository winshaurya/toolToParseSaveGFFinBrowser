Place the sqlite-wasm runtime files here for HTTP-VFS support.

Steps:
1. Download the sqlite-wasm distribution from https://sqlite.org/wasm/.
2. Copy the runtime JS and WASM files (for example `sqlite-wasm.js` and `sqlite-wasm.wasm`) into this folder.
3. During development Vite will serve these files under `/sqlite/` so the worker can `importScripts('/sqlite/worker-bootstrap.js')` or load `/sqlite/sqlite-wasm.js` directly.

If you prefer a CDN, `worker-bootstrap.js` will attempt several CDN locations as a fallback.
