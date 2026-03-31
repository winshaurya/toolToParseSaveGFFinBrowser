from src.preprocessor import convert_gff_to_sqlite
import sqlite3
from pathlib import Path

gff_text = """##gff-version 3
chr1	source	gene	100	200	.	+	.	ID=gene0;Name=TestGene
chr1	source	mRNA	120	190	.	+	.	ID=mrna0;Parent=gene0
"""

gff_file = Path("static/demo_small.gff")
gff_file.parent.mkdir(exist_ok=True)
gff_file.write_text(gff_text)

out = "static/demo_small.sqlite"
print("Converting local demo gff to:", out)
convert_gff_to_sqlite(str(gff_file), out)

conn = sqlite3.connect(out)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cur.fetchall()
print("Tables in demo DB:", tables)

# sample query to show feature count
try:
    cur.execute("SELECT COUNT(*) FROM features")
    print("features count:", cur.fetchone())
except Exception as e:
    print("Couldn't query 'features' table directly:", e)

conn.close()
