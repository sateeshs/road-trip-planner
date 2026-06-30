#!/bin/bash
set -e
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
REPO="/home/yeteesh/__myworkarea/projects/genai/road-trip-planner"

echo "=== Step 1: Generate SQL dump ==="
python3 "$REPO/scripts/nps_sqlite_to_sql.py"

echo ""
echo "=== Step 2: Import into Cloudflare D1 ==="
npx wrangler d1 execute road-trip-nps \
  --file="$REPO/data/nps_places.sql" \
  --remote \
  --config="$REPO/mcp-servers/places-mcp/wrangler.toml"

echo ""
echo "=== Step 3: Verify row count ==="
npx wrangler d1 execute road-trip-nps \
  --remote \
  --config="$REPO/mcp-servers/places-mcp/wrangler.toml" \
  --command="SELECT fcat, COUNT(*) as n FROM nps_places GROUP BY fcat ORDER BY n DESC LIMIT 8"
