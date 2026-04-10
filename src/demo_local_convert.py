#!/usr/bin/env python3
"""
Utility wrapper to convert a local GFF/GFF3 file to a SQLite database.
This script intentionally does not create demo files; it requires explicit
input and output paths and forwards options to `convert_gff_to_sqlite`.
"""
from src.preprocessor import convert_gff_to_sqlite
import argparse
import sys


def main():
    p = argparse.ArgumentParser(description="Convert a local GFF/GFF3 file to SQLite")
    p.add_argument("gff", help="Path to local GFF/GFF3 file")
    p.add_argument("out", help="Output sqlite path (e.g. static/mydb.sqlite)")
    p.add_argument("--batch-size", type=int, default=20000, help="Batch size for inserts")
    p.add_argument("--fast", action="store_true", help="Use faster PRAGMA settings")
    p.add_argument("--with-rtree", action="store_true", help="Populate RTREE index")
    p.add_argument("--with-fts", action="store_true", help="Populate FTS5 index")
    p.add_argument("--encoding", default="utf-8", help="File encoding")
    args = p.parse_args()

    try:
        out_path = convert_gff_to_sqlite(
            args.gff,
            args.out,
            batch_size=args.batch_size,
            fast=args.fast,
            with_rtree=args.with_rtree,
            with_fts=args.with_fts,
            encoding=args.encoding,
        )
        print("Wrote:", out_path)
    except Exception as e:
        print("Conversion failed:", e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
