import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request, Response, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import json
from urllib.parse import unquote
import mimetypes

from src.preprocessor import convert_gff_to_sqlite


app = FastAPI(title="GFF -> SQLite Service (Phase 1)")

# Allow cross-origin requests for the simple prototype UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

# Custom static route with Range support is defined below; do not mount StaticFiles to /static

# conversion jobs registry: job_id -> {status: 'pending'|'running'|'done'|'failed', sqlite_url, error}
conversion_jobs = {}


def _parse_range(range_header: str, file_size: int):
    # Supports single range only: bytes=start-end or bytes=-suffix or bytes=start-
    if not range_header or not range_header.startswith("bytes="):
        return None
    range_val = range_header.split("=", 1)[1].strip()
    if "," in range_val:
        # multiple ranges not supported
        return None
    if range_val.startswith("-"):
        # suffix length
        suffix = int(range_val[1:])
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] != "" else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] != "" else file_size - 1
    if start > end or start < 0:
        return None
    return start, end


@app.get("/static/{filename:path}")
async def static_file(filename: str, request: Request):
    file_path = STATIC_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path=str(file_path), filename=filename, media_type=mimetypes.guess_type(str(file_path))[0] or "application/octet-stream")

    parsed = _parse_range(range_header, file_size)
    if parsed is None:
        # ignore and serve whole file
        return FileResponse(path=str(file_path), filename=filename, media_type=mimetypes.guess_type(str(file_path))[0] or "application/octet-stream")

    start, end = parsed
    length = end - start + 1

    def iter_file():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = length
            chunk_size = 8192
            while remaining > 0:
                read_size = min(chunk_size, remaining)
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return StreamingResponse(iter_file(), status_code=206, media_type=mimetypes.guess_type(str(file_path))[0] or "application/octet-stream", headers=headers)


def _do_convert(gff_url: str, out_path: str):
    # perform conversion and update job registry if possible
    # out_path is an absolute path under STATIC_DIR
    # The filename is the last path component
    filename = os.path.basename(out_path)
    # find job by sqlite_url
    job = None
    for jid, info in conversion_jobs.items():
        if info.get("sqlite_url") == f"/static/{filename}":
            job = jid
            break
    if job:
        conversion_jobs[job]["status"] = "running"
    try:
        convert_gff_to_sqlite(gff_url, out_path)
        if job:
            conversion_jobs[job]["status"] = "done"
            conversion_jobs[job]["sqlite_url"] = f"/static/{filename}"
    except Exception as e:
        if job:
            conversion_jobs[job]["status"] = "failed"
            conversion_jobs[job]["error"] = str(e)
        raise


def _parse_gff_stream(gff_url: str):
    """Stream-parse a GFF3 URL and yield NDJSON feature lines as bytes.

    Each yielded line is a JSON object with keys: seqid, source, type, start, end,
    score, strand, phase, attributes.
    """
    import httpx

    def parse_attrs(attr_text: str):
        out = {}
        for item in attr_text.split(';'):
            if not item:
                continue
            if '=' in item:
                k, v = item.split('=', 1)
                out[k] = unquote(v)
            else:
                parts = item.split()
                if len(parts) >= 2:
                    out[parts[0]] = unquote(' '.join(parts[1:]))
        return out

    with httpx.stream("GET", gff_url, follow_redirects=True, timeout=60.0) as r:
        r.raise_for_status()
        buf = ""
        for chunk in r.iter_bytes():
            if not chunk:
                continue
            try:
                txt = chunk.decode('utf-8')
            except Exception:
                txt = chunk.decode('latin-1', errors='ignore')
            buf += txt
            lines = buf.split('\n')
            buf = lines.pop()  # keep last partial
            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                cols = line.split('\t')
                if len(cols) < 9:
                    continue
                seqid, source, typ, start, end, score, strand, phase, attrs = cols[:9]
                try:
                    si = int(start)
                    ei = int(end)
                except Exception:
                    continue
                score_val = None if score == '.' else float(score) if score != '.' else None
                phase_val = None if phase == '.' else int(phase) if phase.isdigit() else None
                ad = parse_attrs(attrs)
                feat = {
                    "seqid": seqid,
                    "source": source,
                    "type": typ,
                    "start": si,
                    "end": ei,
                    "score": score_val,
                    "strand": strand,
                    "phase": phase_val,
                    "attributes": ad,
                }
                yield (json.dumps(feat) + "\n").encode('utf-8')
        # final partial
        if buf:
            line = buf.strip()
            if line and not line.startswith('#'):
                cols = line.split('\t')
                if len(cols) >= 9:
                    seqid, source, typ, start, end, score, strand, phase, attrs = cols[:9]
                    try:
                        si = int(start)
                        ei = int(end)
                        score_val = None if score == '.' else float(score) if score != '.' else None
                        phase_val = None if phase == '.' else int(phase) if phase.isdigit() else None
                        ad = parse_attrs(attrs)
                        feat = {
                            "seqid": seqid,
                            "source": source,
                            "type": typ,
                            "start": si,
                            "end": ei,
                            "score": score_val,
                            "strand": strand,
                            "phase": phase_val,
                            "attributes": ad,
                        }
                        yield (json.dumps(feat) + "\n").encode('utf-8')
                    except Exception:
                        pass


@app.post('/parse_gff')
async def parse_gff_endpoint(payload: dict):
    """POST /parse_gff {"gff_url": "https://..."}

    Streams NDJSON features back to the client so the browser can keep them in memory.
    """
    gff_url = payload.get('gff_url')
    if not gff_url:
        return JSONResponse({"error": "gff_url required"}, status_code=400)
    return StreamingResponse(_parse_gff_stream(gff_url), media_type='application/x-ndjson')


@app.post("/convert")
async def convert_endpoint(payload: dict, background: BackgroundTasks):
    """POST /convert {"gff_url": "https://..."}

    Kicks off conversion in background and returns the static URL to the sqlite file.
    """
    gff_url = payload.get("gff_url")
    if not gff_url:
        return JSONResponse({"error": "gff_url required"}, status_code=400)

    filename = f"db_{uuid.uuid4().hex}.sqlite"
    out_path = str(STATIC_DIR / filename)

    job_id = uuid.uuid4().hex
    conversion_jobs[job_id] = {"status": "pending", "sqlite_url": f"/static/{filename}"}

    # Run conversion in a thread to avoid blocking the event loop
    background.add_task(_do_convert, gff_url, out_path)

    return {"job_id": job_id, "sqlite_url": f"/static/{filename}", "status": "conversion_started"}


@app.get("/status/{job_id}")
async def status(job_id: str):
    info = conversion_jobs.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    return info
