import os
import shutil
import tempfile
import uuid
from pathlib import Path

import gffutils


def convert_gff_to_sqlite(gff_input: str, sqlite_path: str) -> str:
    """Convert a local or remote GFF3 to a SQLite DB using gffutils.

    gff_input: local path or URL
    sqlite_path: destination sqlite file path
    Returns the sqlite_path on success.
    """
    Path(os.path.dirname(sqlite_path)).mkdir(parents=True, exist_ok=True)

    # If input is a URL, download to a temp file first with retries/backoff
    if gff_input.startswith("http://") or gff_input.startswith("https://"):
        import httpx
        import time

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".gff")
        os.close(tmp_fd)

        max_attempts = 5
        backoff = 1.0
        for attempt in range(1, max_attempts + 1):
            try:
                with httpx.stream("GET", gff_input, follow_redirects=True, timeout=60.0) as r:
                    r.raise_for_status()
                    with open(tmp_path, "wb") as out_f:
                        for chunk in r.iter_bytes():
                            if chunk:
                                out_f.write(chunk)
                # success
                break
            except Exception as e:
                if attempt == max_attempts:
                    # re-raise the last exception
                    raise
                time.sleep(backoff)
                backoff *= 2
    else:
        tmp_path = gff_input

    # gffutils.create_db will create a sqlite DB optimized for querying
    try:
        # If sqlite exists, remove it to force recreation
        if os.path.exists(sqlite_path):
            os.remove(sqlite_path)

        gffutils.create_db(
            data=tmp_path,
            dbfn=sqlite_path,
            force=True,
            keep_order=True,
            disable_infer_transcripts=True,
        )

    finally:
        # If we downloaded to a temp file but conversion failed, cleanup
        # Note: we cannot remove the temp file here unconditionally because gffutils needs it during create_db
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
