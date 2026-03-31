import os
import sqlite3
import tempfile

from src.preprocessor import convert_gff_to_sqlite


def test_convert_simple_gff(tmp_path):
    gff_text = """##gff-version 3
chr1	source	gene	100	200	.	+	.	ID=gene0;Name=TestGene
"""
    gff_file = tmp_path / "small.gff"
    gff_file.write_text(gff_text)

    out_db = str(tmp_path / "out.sqlite")
    result = convert_gff_to_sqlite(str(gff_file), out_db)

    assert os.path.exists(result)

    # basic sanity: sqlite file should contain at least one table
    conn = sqlite3.connect(result)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cur.fetchall()
    conn.close()
    assert len(tables) >= 1
