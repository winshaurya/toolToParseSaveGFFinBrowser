# Phase 1 — Python Preprocessor

This document describes Phase 1 deliverables for the "genomic feature database in the browser" project.

Goals
- Convert large GFF3 files into a SQLite DB optimized for read-heavy WASM queries (HTTP Range reads).
- Provide a minimal FastAPI service to accept a GFF URL, convert it, and serve the .sqlite file under `/static` with byte-range support.

Files added
- `src/preprocessor.py` — converter utility and CLI
- `app/main.py` — FastAPI app with `/convert` endpoint and `/static` mount
- `tests/test_preprocessor.py` — pytest for basic conversion sanity

Next steps
- Add more indexing and schema tuning for WASM page-size alignment.
- Add unit tests that validate specific expected tables and indices created by `gffutils`.
- Implement URL signing, cleanup policy for `static/` storage, and management endpoints.
