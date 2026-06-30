#!/usr/bin/env python3
"""
Dump data/nps_places.db to data/nps_places.sql for wrangler d1 execute.
Splits into batches of 500 rows to stay within D1 request limits.
"""
import sqlite3, os

DB  = os.path.join(os.path.dirname(__file__), '../data/nps_places.db')
OUT = os.path.join(os.path.dirname(__file__), '../data/nps_places.sql')

conn = sqlite3.connect(DB)
cur  = conn.cursor()

rows = cur.execute('SELECT id, name, park_code, fcat, lat, lng FROM nps_places').fetchall()
print(f'Exporting {len(rows):,} rows...')

with open(OUT, 'w') as f:
    # Schema
    f.write('DROP TABLE IF EXISTS nps_places;\n')
    f.write('''CREATE TABLE nps_places (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  park_code TEXT NOT NULL,
  fcat      TEXT NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL
);\n''')
    f.write('CREATE INDEX idx_bbox      ON nps_places(lat, lng);\n')
    f.write('CREATE INDEX idx_park_fcat ON nps_places(park_code, fcat);\n')

    # Data in batches
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        values = ',\n  '.join(
            f"({repr(r[0])},{repr(r[1])},{repr(r[2])},{repr(r[3])},{r[4]},{r[5]})"
            for r in batch
        )
        f.write(f'INSERT INTO nps_places VALUES\n  {values};\n')
        print(f'  Written rows {i+1}–{i+len(batch)}')

conn.close()
size_kb = os.path.getsize(OUT) / 1024
print(f'\nOutput: {OUT} ({size_kb:.0f} KB)')
print(f'Run: npx wrangler d1 execute road-trip-nps --file=data/nps_places.sql --remote --config mcp-servers/places-mcp/wrangler.toml')
