# Plan: Port TREK Free-Resource Patterns for Attractions, Hotels & Surroundings

## Context
The road-trip-planner uses Foursquare (paid, keyed) for attractions/surroundings and Amadeus (paid, keyed) for hotels, with OSM/Overpass as a free fallback. The Overpass fallback had two problems:
1. Single mirror — `overpass-api.de` goes down regularly
2. Basic OSM queries — used tilde regex operator on `node` only (misses ways/relations), thin tag coverage

TREK's `mapsService.ts` has a production-grade solution: 4-mirror `Promise.any()` racing, in-memory TTL cache, and precise separate-filter `nwr[]` queries. The goal is to bring the road-trip-planner's free fallback up to TREK's standard.

## What was already applied
The following changes were made to `lib/claude-tools.ts`:
- `overpassQuery()` rewritten: races 4 mirrors via `Promise.any()` + AbortController cleanup, checks `data.remark` (Overpass HTTP-200 timeout signal), stores results in a 5-min TTL / 500-entry FIFO cache
- `osmAttractions()` rewritten: uses `nwr["tag"="value"]` per filter (22 explicit tag filters), expanded to include aquariums, beaches, peaks, waterfalls, archaeological sites, arts centres
- `osmHotels()` rewritten: star-based price tier `STAR_PRICE[0..5]`, 11-field amenity extraction (wifi, parking, pool, restaurant, breakfast, bar, gym, sauna, AC, elevator, pets), 4-component address, room type derived from star rating, result cap raised to 12

## Remaining work

### 1. Update `explore_surroundings` OSM fallback (`lib/claude-tools.ts`)
The fallback inside the `explore_surroundings` tool still uses old-style queries:
```
node["leisure"~"park|..."]
node["sport"~"hiking|..."]
node["waterway"~"waterfall"]
```
These should be updated to use separate `nwr["tag"="value"]` filters (same TREK pattern), add `nwr["natural"="waterfall"]`, and bump timeout to 20s.

## Critical file
- `lib/claude-tools.ts` — only file that needs modification (explore_surroundings execute block ~lines 430-480)

## Verification
1. `npm run build` — TypeScript compile check (no API keys needed)
2. Start dev server, ask for a trip with outdoor activities (e.g. "Pictured Rocks") without Foursquare key set — should see OSM results for surroundings
3. Check server logs for "Overpass" — should not see single-mirror errors, should see cache hits on repeated requests
