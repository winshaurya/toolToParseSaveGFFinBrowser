# Phase 1 — Python Preprocessor

This component converts GFF3 files into a gffutils-backed SQLite DB and exposes a small FastAPI service to convert remote GFFs and serve the resulting SQLite files via `/static` (StaticFiles).

Quick start

1. Create a virtualenv and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

2. Run the FastAPI app (development):

```bash
uvicorn app.main:app --reload --port 8000
```

3. POST a JSON body to `/convert` with `gff_url` to start conversion. The response returns a `sqlite_url` under `/static` where the generated DB will appear once ready.

Notes
- The static endpoint uses Starlette's StaticFiles which supports `Accept-Ranges: bytes` so the file can be read via HTTP range requests from the browser or SQLite WASM HTTP VFS.
