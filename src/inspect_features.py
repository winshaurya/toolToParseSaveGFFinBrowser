import sqlite3

DB = 'static/demo_small.sqlite'
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info('features')")
cols = cur.fetchall()
print('features columns:')
for c in cols:
    print(c)
conn.close()
