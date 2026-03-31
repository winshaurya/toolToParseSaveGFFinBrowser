# Project Phases Implementation Plan

Phase 1: Backend
- Completed: `src/preprocessor.py`, `app/main.py` with Range-aware static serving.

Phase 2: Extension UI
- Scaffolded: `extension/` with React app, `ControlPanel`, `VisualLog`, styles, and placeholder wasm worker.

Phase 3: SQLite WASM
- Next: implement `src/wasmWorker.js` to import and initialize `@sqlite.org/sqlite-wasm`, configure HTTP VFS to point at `http://localhost:8000/static/<db>.sqlite`, and communicate with the React app.

Phase 4: JBrowse Handoff
- Next: add a mock `JBrowseView` React component that centers on received coordinates; hook it to VisualLog events.
