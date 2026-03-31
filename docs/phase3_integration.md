# Phase 3 — SQLite WASM HTTP VFS Integration

This document explains how to integrate the official sqlite-wasm HTTP VFS into the extension worker so the browser can query a remote `.sqlite` file via HTTP Range requests.

Steps

1. Obtain sqlite-wasm runtime
   - Visit https://sqlite.org/wasm/ and download the recommended distribution.
   - Place the runtime files under `extension/public/sqlite/` (e.g., `sqlite-alloc.wasm`, `sqlite-asm.js`, etc.)

2. Modify the worker
   - Update `extension/src/wasmWorker.js` to `importScripts('/sqlite/<runtime-file>.js')` and call the provided initializer (example patterns are commented in the file).
   - Configure the HTTP VFS per the sqlite-wasm docs (see https://sqlite.org/wasm/doc/trunk/api-vfs.md#vfs-http). This typically involves registering the `vfs_http` plugin and then opening the database path as the remote URL.

3. Build and bundle
   - If using `importScripts`, ensure the runtime files are copied to the extension's `public` folder so they are served in development mode.
   - If bundling the runtime into the worker, add it to the build pipeline and adjust the worker import accordingly.

4. Test
   - Start backend: `uvicorn app.main:app --reload --port 8000` and ensure `.sqlite` is served under `/static/` with `Accept-Ranges`.
   - Start the extension dev server: `cd extension && npm run dev` and open the popup UI.
   - Use the Control Panel to open the remote URL and `exec` a query. Watch the Visual Log for HTTP Range events.

Troubleshooting
- If the worker fails to import the runtime, the `wasmWorker.js` will operate in simulated mode and return fake rows so you can finish UI work first.
- Building with real sqlite-wasm requires attention to how the wasm binary is located (use `locateFile` or place wasm next to the worker script).
