import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request, Response, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
import mimetypes

from src.preprocessor import convert_gff_to_sqlite


app = FastAPI(title="GFF -> SQLite Service (Phase 1)")

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

# Custom static route with Range support is defined below; do not mount StaticFiles to /static


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
    convert_gff_to_sqlite(gff_url, out_path)


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

    # Run conversion in a thread to avoid blocking the event loop
    background.add_task(_do_convert, gff_url, out_path)

    # Return the path where the sqlite will be served (StaticFiles will handle Range headers)
    return {"sqlite_url": f"/static/{filename}", "status": "conversion_started"}
