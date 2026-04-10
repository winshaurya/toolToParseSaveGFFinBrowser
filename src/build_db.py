#!/usr/bin/env python3
"""
build_db.py

Stream a (possibly gzipped) GFF file into an optimized SQLite database.

Features:
- Single-pass streaming parser (generators) for low memory usage
- Batch inserts with explicit `id` assignment for reliable feature->attribute joins
- Optional RTREE and FTS population
- Creates indexes after bulk load for fastest ingestion

Usage:
    python src/build_db.py -i input.gff[.gz] -o features.db --batch-size 50000 --with-rtree --with-fts --fast --overwrite

This script is intentionally conservative about SQLite compatibility: it avoids
using `GENERATED` columns and computes `length` / `value_norm` at insert time.
"""
from __future__ import annotations

import argparse
import gzip
import os
import sqlite3
import sys
import time
from typing import Dict, Iterable, IO, List, Optional, Sequence, Tuple


def open_maybe_gz(path: str, encoding: str = "utf-8") -> IO[str]:
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding=encoding)
    return open(path, "r", encoding=encoding)


def _to_float(s: str) -> Optional[float]:
    try:
        return float(s)
    except Exception:
        return None


def parse_attributes(attr_str: str) -> List[Tuple[str, str]]:
    """Parse the GFF attributes column into (key, value) pairs.

    Splits on `;` and takes the first `=` as the key/value separator. If a
    value contains commas we split those into separate attribute rows (common
    in many GFFs).
    """
    if not attr_str or attr_str == ".":
        return []
    parts = [p.strip() for p in attr_str.split(";") if p.strip()]
    pairs: List[Tuple[str, str]] = []
    for p in parts:
        if "=" in p:
            key, val = p.split("=", 1)
        elif " " in p:
            key, val = p.split(" ", 1)
        else:
            key, val = p, ""
        key = key.strip()
        val = val.strip().strip('"')
        if "," in val:
            for v in (v.strip() for v in val.split(",") if v.strip()):
                pairs.append((key, v))
        else:
            pairs.append((key, val))
    return pairs


def parse_gff_lines(fh: IO[str]) -> Iterable[Tuple[int, str, str, str, int, int, Optional[float], str, str, List[Tuple[str, str]], str]]:
    """Yield parsed GFF fields from file handle.

    Yields: (lineno, seqid, source, type, start, end, score, strand, phase, attributes_pairs, raw_attributes)
    """
    for lineno, raw in enumerate(fh, start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) < 9:
            # skip malformed/short lines
            continue
        seqid, source, typ, start_s, end_s, score_s, strand, phase, attr_str = cols[:9]
        try:
            start = int(start_s)
            end = int(end_s)
        except ValueError:
            continue
        if start > end:
            start, end = end, start
        score = None if score_s == "." else _to_float(score_s)
        attr_pairs = parse_attributes(attr_str)
        yield lineno, seqid, source, typ, start, end, score, strand, phase, attr_pairs, attr_str
def init_schema(conn: sqlite3.Connection) -> None:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")

        cur.execute(
                """
        CREATE TABLE IF NOT EXISTS seqnames (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
        """
        )

        cur.execute(
                """
        CREATE TABLE IF NOT EXISTS features (
            id INTEGER PRIMARY KEY,
            seqname_id INTEGER NOT NULL,
            source TEXT,
            type TEXT,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            length INTEGER,
            score REAL,
            strand TEXT,
            phase TEXT,
            gff_id TEXT,
            raw_attributes TEXT,
            gff_line INTEGER,
            FOREIGN KEY(seqname_id) REFERENCES seqnames(id) ON DELETE CASCADE
        );
        """
        )

        cur.execute(
                """
        CREATE TABLE IF NOT EXISTS attributes (
            id INTEGER PRIMARY KEY,
            feature_id INTEGER NOT NULL,
            key TEXT NOT NULL COLLATE NOCASE,
            value TEXT,
            value_norm TEXT,
            FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
        );
        """
        )

        # parent relationship table: many-to-many mapping of child -> parent feature ids
        cur.execute(
                """
        CREATE TABLE IF NOT EXISTS feature_parents (
            feature_id INTEGER NOT NULL,
            parent_feature_id INTEGER NOT NULL,
            FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_feature_id) REFERENCES features(id) ON DELETE CASCADE
        );
        """
        )

        conn.commit()


def get_or_create_seqname_id(conn: sqlite3.Connection, cache: Dict[str, int], seqname: str) -> int:
    if seqname in cache:
        return cache[seqname]
    cur = conn.execute("INSERT OR IGNORE INTO seqnames(name) VALUES (?)", (seqname,))
    row = conn.execute("SELECT id FROM seqnames WHERE name = ?", (seqname,)).fetchone()
    if not row:
        raise RuntimeError("Failed to insert/select seqname: %s" % seqname)
    seq_id = int(row[0])
    cache[seqname] = seq_id
    return seq_id


def bulk_insert(conn: sqlite3.Connection, feature_rows: Sequence[Tuple], attribute_rows: Sequence[Tuple]) -> None:
    cur = conn.cursor()
    if feature_rows:
        cur.executemany(
            "INSERT INTO features (id, seqname_id, source, type, start, end, length, score, strand, phase, gff_id, raw_attributes, gff_line) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            feature_rows,
        )
    if attribute_rows:
        cur.executemany(
            "INSERT INTO attributes (feature_id, key, value, value_norm) VALUES (?,?,?,?)",
            attribute_rows,
        )
    conn.commit()


def create_indexes(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("CREATE INDEX IF NOT EXISTS idx_features_seq_start_end ON features (seqname_id, start, end);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_features_seq_end_start ON features (seqname_id, end, start);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_features_seq_type_start_end ON features (seqname_id, type, start, end);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_features_cover_seq_start_end_type ON features (seqname_id, start, end, type);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_features_gff_id ON features (gff_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_attributes_key_value_feature ON attributes (key, value, feature_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_attributes_feature_key_value ON attributes (feature_id, key, value);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_attributes_key_value_norm_feature ON attributes (key, value_norm, feature_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_attributes_feature_id ON attributes (feature_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_feature_parents_feature ON feature_parents (feature_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_feature_parents_parent ON feature_parents (parent_feature_id);")
    conn.commit()


def populate_rtree(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS feature_intervals_rtree USING rtree(id, seqname_id_min, seqname_id_max, start_min, start_max);"
    )
    cur.execute(
        "INSERT INTO feature_intervals_rtree (id, seqname_id_min, seqname_id_max, start_min, start_max) SELECT id, seqname_id, seqname_id, start, end FROM features;"
    )
    # Triggers to keep rtree in sync for future updates
    cur.executescript(
        """
    CREATE TRIGGER IF NOT EXISTS feature_rtree_insert AFTER INSERT ON features
    BEGIN
      INSERT INTO feature_intervals_rtree (id, seqname_id_min, seqname_id_max, start_min, start_max)
        VALUES (new.id, new.seqname_id, new.seqname_id, new.start, new.end);
    END;

    CREATE TRIGGER IF NOT EXISTS feature_rtree_update AFTER UPDATE ON features
    BEGIN
      UPDATE feature_intervals_rtree
        SET seqname_id_min = new.seqname_id,
            seqname_id_max = new.seqname_id,
            start_min = new.start,
            start_max = new.end
      WHERE id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS feature_rtree_delete AFTER DELETE ON features
    BEGIN
      DELETE FROM feature_intervals_rtree WHERE id = old.id;
    END;
    """
    )
    conn.commit()


def populate_fts(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("CREATE VIRTUAL TABLE IF NOT EXISTS attributes_fts USING fts5(value, feature_id UNINDEXED, tokenize='unicode61');")
    cur.execute("INSERT INTO attributes_fts(rowid, value, feature_id) SELECT id, value, feature_id FROM attributes;")
    # FTS triggers
    cur.executescript(
        """
    CREATE TRIGGER IF NOT EXISTS attributes_ai AFTER INSERT ON attributes
    BEGIN
      INSERT INTO attributes_fts(rowid, value, feature_id) VALUES (new.id, new.value, new.feature_id);
    END;

    CREATE TRIGGER IF NOT EXISTS attributes_ad AFTER DELETE ON attributes
    BEGIN
      INSERT INTO attributes_fts(attributes_fts, rowid, value, feature_id) VALUES('delete', old.id, old.value, old.feature_id);
    END;

    CREATE TRIGGER IF NOT EXISTS attributes_au AFTER UPDATE ON attributes
    BEGIN
      INSERT INTO attributes_fts(attributes_fts, rowid, value, feature_id) VALUES('delete', old.id, old.value, old.feature_id);
      INSERT INTO attributes_fts(rowid, value, feature_id) VALUES (new.id, new.value, new.feature_id);
    END;
    """
    )
    conn.commit()


def build_database(
    input_path: str,
    output_path: str,
    batch_size: int = 10000,
    fast: bool = False,
    with_rtree: bool = False,
    with_fts: bool = False,
    encoding: str = "utf-8",
) -> None:
    if os.path.exists(output_path):
        raise FileExistsError(f"Output database already exists: {output_path}")

    conn = sqlite3.connect(output_path)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    if fast:
        # faster but less crash-safe during ingestion
        conn.execute("PRAGMA synchronous = OFF;")
    else:
        conn.execute("PRAGMA synchronous = NORMAL;")

    init_schema(conn)

    seq_cache: Dict[str, int] = {}
    features_batch: List[Tuple] = []
    attributes_batch: List[Tuple] = []
    pending_parent_pairs: List[Tuple[int, str]] = []
    gffid_to_id: Dict[str, int] = {}
    next_feature_id = 1
    total_features = 0
    total_attributes = 0
    t0 = time.time()

    with open_maybe_gz(input_path, encoding=encoding) as fh:
        for lineno, seqid, source, typ, start, end, score, strand, phase, attr_pairs, raw_attr in parse_gff_lines(fh):
            seqname_id = get_or_create_seqname_id(conn, seq_cache, seqid)
            length = end - start + 1

            # extract ID and Parent attributes for later resolution
            gff_id_val: Optional[str] = None
            for k, v in attr_pairs:
                lk = k.lower() if k else ""
                if lk == "id" and v:
                    gff_id_val = v
                elif lk == "parent" and v:
                    # record child feature numeric id -> parent gff id (resolve later)
                    pending_parent_pairs.append((next_feature_id, v))

            feature_row = (
                next_feature_id,
                seqname_id,
                source,
                typ,
                start,
                end,
                length,
                score,
                strand,
                phase,
                gff_id_val,
                raw_attr,
                lineno,
            )
            features_batch.append(feature_row)

            # map gff id to numeric id for fast resolution when possible
            if gff_id_val:
                gffid_to_id[gff_id_val] = next_feature_id

            for k, v in attr_pairs:
                value_norm = v.lower() if v else None
                attributes_batch.append((next_feature_id, k, v, value_norm))

            next_feature_id += 1
            total_features += 1
            total_attributes += len(attr_pairs)

            if len(features_batch) >= batch_size:
                bulk_insert(conn, features_batch, attributes_batch)
                features_batch.clear()
                attributes_batch.clear()
                elapsed = time.time() - t0
                print(f"Inserted {total_features} features ({total_attributes} attributes) in {elapsed:.1f}s")

    # final batch
    if features_batch or attributes_batch:
        bulk_insert(conn, features_batch, attributes_batch)

    # resolve Parent relationships: pending_parent_pairs contains (child_id, parent_gff_id)
    if pending_parent_pairs:
        print(f"Resolving {len(pending_parent_pairs)} parent links...")
        cur = conn.cursor()
        resolved = []
        for child_id, parent_gff in pending_parent_pairs:
            parent_id = gffid_to_id.get(parent_gff)
            if parent_id is None:
                row = conn.execute("SELECT id FROM features WHERE gff_id = ?", (parent_gff,)).fetchone()
                if row:
                    parent_id = int(row[0])
            if parent_id is not None:
                resolved.append((child_id, parent_id))
        if resolved:
            cur.executemany("INSERT INTO feature_parents (feature_id, parent_feature_id) VALUES (?,?)", resolved)
            conn.commit()

    print(f"Feature ingestion complete: {total_features} features, {total_attributes} attributes")

    # create indexes after bulk load
    print("Creating indexes...")
    create_indexes(conn)

    if with_rtree:
        print("Populating RTREE...")
        populate_rtree(conn)

    if with_fts:
        print("Populating FTS table...")
        populate_fts(conn)

    print("Running ANALYZE...")
    conn.execute("ANALYZE;")
    conn.commit()
    conn.close()


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Stream a GFF into an optimized SQLite DB")
    p.add_argument("-i", "--input", required=True, help="Input GFF/GFF.gz file")
    p.add_argument("-o", "--output", required=True, help="Output SQLite database (.db)")
    p.add_argument("--batch-size", type=int, default=20000, help="Batch size for inserts (default: 20000)")
    p.add_argument("--fast", action="store_true", help="Use faster PRAGMA settings (synchronous=OFF)")
    p.add_argument("--with-rtree", action="store_true", help="Populate RTREE interval index (requires rtree support)")
    p.add_argument("--with-fts", action="store_true", help="Populate FTS5 table for attribute search (requires fts5)")
    p.add_argument("--overwrite", action="store_true", help="Overwrite existing output database")
    p.add_argument("--encoding", default="utf-8", help="File encoding (default: utf-8)")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    if os.path.exists(args.output):
        if args.overwrite:
            os.remove(args.output)
        else:
            print(f"Error: output file exists: {args.output}\nUse --overwrite to replace.")
            sys.exit(1)

    start = time.time()
    build_database(
        input_path=args.input,
        output_path=args.output,
        batch_size=args.batch_size,
        fast=args.fast,
        with_rtree=args.with_rtree,
        with_fts=args.with_fts,
        encoding=args.encoding,
    )
    elapsed = time.time() - start
    print(f"Done. Total time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
