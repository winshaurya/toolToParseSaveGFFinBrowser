# Genomic Feature DB In-Browser — Project README

This repository implements a proof-of-concept pipeline to query large GFF3 genome annotation files entirely in the browser using SQLite compiled to WebAssembly and an HTTP VFS that issues Range requests to a hosted `.sqlite` file.

Structure
- `app/` — FastAPI application that accepts GFF URLs, converts them to SQLite using `gffutils`, and serves resulting `.sqlite` files with byte-range (`Accept-Ranges`) support.
- `src/` — Python scripts: `preprocessor.py` conversion utility, small runners and tests.
- `extension/` — Vite + React scaffold for the Chrome extension UI (Storytelling Dashboard). Includes a `wasmWorker.js` placeholder for sqlite-wasm integration, `ControlPanel`, `VisualLog`, and a mock `JBrowseView`.

How it works (high level)
1. Backend: convert GFF -> SQLite using `gffutils.create_db` and store in `static/`.
2. Serve `.sqlite` from FastAPI with byte-range support so WASM's HTTP VFS can request only the necessary pages.
3. Extension UI: user provides DB URL + query. The UI animates the engine steps: generated SQL, HTTP Range requests, WASM execution, and result rows.
4. Handoff: the extension demonstrates centering a mock genome browser (JBrowseView) using returned coordinates.

Dev quickstart

Backend (Python):

```powershell
cd "c:\Users\mrsha\Desktop\killinit\New folder (3)"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Extension (frontend):

```bash
cd extension
npm install
npm run dev
```

Notes
- `extension/src/wasmWorker.js` currently contains a simulated worker and a stubbed sqlite-wasm initialization. To enable real queries, install `@sqlite.org/sqlite-wasm` and replace simulation with real HTTP-VFS mounting per the sqlite-wasm docs.
- Pushing to remote: this repo attempts to push but you may need to provide credentials or use an SSH key.
