import os
import tempfile
from pathlib import Path
from typing import Optional

from .build_db import build_database


def convert_gff_to_sqlite(
    gff_input: str,
    sqlite_path: str,
    batch_size: int = 20000,
    fast: bool = False,
    with_rtree: bool = False,
    with_fts: bool = False,
    encoding: str = "utf-8",
) -> str:
    """Convert a local or remote GFF3 to a deterministic SQLite DB using the project's
    streaming `build_database` pipeline.

    Keeps the previous behavior of downloading remote GFFs to a temporary file,
    then calls `build_database` to create a canonical `features`/`attributes` schema.
    """
    Path(os.path.dirname(sqlite_path)).mkdir(parents=True, exist_ok=True)

    downloaded_tmp: Optional[str] = None
    if gff_input.startswith(("http://", "https://", "ftp://", "ftps://")):
        import time
        import urllib.request
        import urllib.parse
        import shutil
        import httpx
        import zlib

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".gff")
        os.close(tmp_fd)
        downloaded_tmp = tmp_path

        max_attempts = 5
        backoff = 1.0
        # support FTP/FTPS via urllib (falls back to HTTP variants) and
        # support HTTPS with optional insecure fallback when TLS verification fails
        for attempt in range(1, max_attempts + 1):
            try:
                parsed = urllib.parse.urlparse(gff_input)
                scheme = (parsed.scheme or "").lower()

                # FTP-style access using urllib.request which supports ftp:// URLs
                if scheme in ("ftp", "ftps"):
                    with urllib.request.urlopen(gff_input, timeout=60) as resp:
                        with open(tmp_path, "wb") as out_f:
                            shutil.copyfileobj(resp, out_f)

                    # detect gzip by magic
                    with open(tmp_path, "rb") as fcheck:
                        head = fcheck.read(2)
                        if head == b"\x1f\x8b" and not tmp_path.endswith('.gz'):
                            gz_path = tmp_path + ".gz"
                            try:
                                os.replace(tmp_path, gz_path)
                                downloaded_tmp = gz_path
                                input_path = gz_path
                            except Exception:
                                input_path = tmp_path
                        else:
                            input_path = tmp_path

                    break

                # HTTP/HTTPS handling
                is_gzip = False
                # attempt normal TLS-verified request first
                try_urls = [gff_input]
                # if initial is https, allow trying http fallback as well
                if gff_input.startswith('https://'):
                    try_urls.append('http://' + gff_input[len('https://'):])

                success = False
                for url_try in try_urls:
                    try:
                        with httpx.stream("GET", url_try, follow_redirects=True, timeout=60.0) as r:
                            r.raise_for_status()
                            content_encoding = (r.headers.get("content-encoding") or "").lower()
                            url_path = r.url.path or ""
                            if "gzip" in content_encoding or url_path.endswith(".gz") or url_path.endswith(".gff.gz"):
                                is_gzip = True

                            first = True
                            with open(tmp_path, "wb") as out_f:
                                for chunk in r.iter_bytes():
                                    if not chunk:
                                        continue
                                    if first:
                                        first = False
                                        try:
                                            if chunk[:2] == b"\x1f\x8b":
                                                is_gzip = True
                                        except Exception:
                                            pass
                                    out_f.write(chunk)

                        # rename if gzip
                        if is_gzip and not tmp_path.endswith(".gz"):
                            gz_path = tmp_path + ".gz"
                            try:
                                os.replace(tmp_path, gz_path)
                                downloaded_tmp = gz_path
                                input_path = gz_path
                            except Exception:
                                input_path = tmp_path
                        else:
                            input_path = tmp_path

                        success = True
                        break
                    except httpx.ConnectError as ce:
                        msg = str(ce).lower()
                        # TLS/hostname issues: try insecure fallback once
                        if ("certificate verify failed" in msg or "ssl" in msg or "hostname" in msg) and url_try.startswith('https://'):
                            try:
                                with httpx.stream("GET", url_try, follow_redirects=True, timeout=60.0, verify=False) as r:
                                    r.raise_for_status()
                                    content_encoding = (r.headers.get("content-encoding") or "").lower()
                                    url_path = r.url.path or ""
                                    if "gzip" in content_encoding or url_path.endswith(".gz") or url_path.endswith(".gff.gz"):
                                        is_gzip = True
                                    first = True
                                    with open(tmp_path, "wb") as out_f:
                                        for chunk in r.iter_bytes():
                                            if not chunk:
                                                continue
                                            if first:
                                                first = False
                                                try:
                                                    if chunk[:2] == b"\x1f\x8b":
                                                        is_gzip = True
                                                except Exception:
                                                    pass
                                            out_f.write(chunk)

                                if is_gzip and not tmp_path.endswith(".gz"):
                                    gz_path = tmp_path + ".gz"
                                    try:
                                        os.replace(tmp_path, gz_path)
                                        downloaded_tmp = gz_path
                                        input_path = gz_path
                                    except Exception:
                                        input_path = tmp_path
                                else:
                                    input_path = tmp_path

                                success = True
                                break
                            except Exception:
                                # fall through to retry logic
                                pass
                        # otherwise fall through and try next url_try
                    except Exception:
                        # try next fallback (http) or retry
                        pass

                if not success:
                    # final error if none of the attempts worked
                    raise RuntimeError(f"Failed to download GFF from {gff_input}")

                break
            except Exception:
                if attempt == max_attempts:
                    raise
                time.sleep(backoff)
                backoff *= 2
    else:
        input_path = gff_input

    try:
        if os.path.exists(sqlite_path):
            os.remove(sqlite_path)

        build_database(
            input_path=input_path,
            output_path=sqlite_path,
            batch_size=batch_size,
            fast=fast,
            with_rtree=with_rtree,
            with_fts=with_fts,
            encoding=encoding,
        )
    finally:
        if downloaded_tmp and os.path.exists(downloaded_tmp):
            try:
                os.remove(downloaded_tmp)
            except Exception:
                pass

    return sqlite_path


def cli():
    import argparse

    p = argparse.ArgumentParser(description="Convert GFF3 to SQLite (gffutils DB)")
    p.add_argument("gff", help="Local or remote GFF3 path or URL")
    p.add_argument("out", help="Output sqlite path")
    args = p.parse_args()
    out = convert_gff_to_sqlite(args.gff, args.out)
    print("Wrote:", out)


if __name__ == "__main__":
    cli()
