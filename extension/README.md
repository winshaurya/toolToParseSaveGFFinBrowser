# Extension: Storytelling Dashboard

This folder contains a Vite + React scaffold for the Chrome Extension side-panel (popup) that visualizes the SQLite WASM engine steps.

Quick dev:

1. cd extension
2. npm install
3. npm run dev

Tailwind setup (dev):

1. In the `extension` folder, install Tailwind dev deps:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

2. Ensure `tailwind.config.cjs` and `postcss.config.cjs` exist (provided in repo). Import `src/index.css` from the app entry so Tailwind utilities are available.

3. Run `npm run dev` (Vite will process Tailwind via PostCSS).

Load `index.html` as the extension popup during development (pack/unpack or use build outputs).

Notes:
- `src/wasmWorker.js` is a placeholder that should initialize the sqlite-wasm runtime and configure the HTTP VFS.
- `ControlPanel` simulates generating SQL and firing an HTTP Range request to the backend sqlite file.

Installing sqlite-wasm
- The official sqlite-wasm artifacts are distributed from sqlite.org and may not be available as an npm package. To integrate the real HTTP VFS:
	1. Download the sqlite-wasm distribution from https://sqlite.org/wasm/ (follow docs at https://sqlite.org/wasm/doc/trunk/api-vfs.md#vfs-http).
	2. Place the runtime files under `extension/public/sqlite/` or bundle them with your build.
	3. Update `src/wasmWorker.js` to import or load the runtime (e.g., via `importScripts`) and configure the HTTP VFS to point at your hosted `.sqlite` URL (e.g. `http://localhost:8000/static/db.sqlite`).

Note: The current worker contains a simulated exec path so you can develop the UI before full wasm integration.
