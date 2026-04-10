from src.preprocessor import convert_gff_to_sqlite
import sqlite3
import time
import argparse
import sys


def main():
    p = argparse.ArgumentParser(description="Remote GFF conversion runner")
    p.add_argument("--gff-url", required=True, help="Remote GFF URL to convert")
    p.add_argument("--out", required=True, help="Output sqlite path (e.g. static/annotations.sqlite)")
    p.add_argument("--batch-size", type=int, default=20000)
    p.add_argument("--fast", action="store_true")
    p.add_argument("--with-rtree", action="store_true")
    p.add_argument("--with-fts", action="store_true")
    args = p.parse_args()

    start = time.time()
    print("Starting conversion for:", args.gff_url)
    try:
        path = convert_gff_to_sqlite(
            args.gff_url,
            args.out,
            batch_size=args.batch_size,
            fast=args.fast,
            with_rtree=args.with_rtree,
            with_fts=args.with_fts,
        )
    except Exception as e:
        print("Conversion failed:", e, file=sys.stderr)
        sys.exit(1)

    print("Wrote:", path)
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cur.fetchall()
        print("Found tables:", tables[:50])
        conn.close()
    except Exception as e:
        print("Warning: could not inspect resulting DB:", e)
    print("Elapsed:", time.time() - start)


if __name__ == "__main__":
    main()
