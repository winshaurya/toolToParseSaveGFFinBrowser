from src.preprocessor import convert_gff_to_sqlite
import sqlite3
import time

GFF_URL = "https://ftp.ebi.ac.uk/pub/databases/mett/annotations/v1_2024-04-15/BU_ATCC8492/functional_annotation/merged_gff/BU_ATCC8492_annotations.gff"
OUT = "static/BU_ATCC8492_annotations.sqlite"

def main():
    start = time.time()
    print("Starting conversion for:", GFF_URL)
    path = convert_gff_to_sqlite(GFF_URL, OUT)
    print("Wrote:", path)
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cur.fetchall()
    print("Found tables:", tables[:50])
    conn.close()
    print("Elapsed:", time.time() - start)

if __name__ == '__main__':
    main()
