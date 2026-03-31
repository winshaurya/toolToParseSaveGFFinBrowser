# Extension: Storytelling Dashboard

This folder contains a Vite + React scaffold for the Chrome Extension side-panel (popup) that visualizes the SQLite WASM engine steps.

Quick dev:

1. cd extension
2. npm install
3. npm run dev

Load `index.html` as the extension popup during development (pack/unpack or use build outputs).

Notes:
- `src/wasmWorker.js` is a placeholder that should initialize `@sqlite.org/sqlite-wasm` and configure the HTTP VFS.
- `ControlPanel` simulates generating SQL and firing an HTTP Range request to the backend sqlite file.
