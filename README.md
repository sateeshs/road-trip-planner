# Road Trip Planner

A chat-first AI road trip planner for US domestic travel. Chat with Claude to plan your route, discover attractions, and find hotel deals.

## Features
- AI-powered road trip planning via Claude claude-sonnet-4-6
- Interactive map with route visualization (Leaflet + OpenStreetMap)
- Attraction discovery via Foursquare Places API
- Hotel search and availability via Amadeus API
- Hotel booking via deep-link redirect (no payment processing in-app)
- Session-only — no accounts, no data saved

## Setup

### 1. Clone and install
```bash
git clone <your-repo-url>
cd road-trip-planner
npm install
```

### 2. Get API keys
- **Anthropic**: https://console.anthropic.com/ → API keys
- **Amadeus**: https://developers.amadeus.com/ → My Apps → Create new app (free sandbox)
- **Foursquare**: https://foursquare.com/developers/ → Projects → Create project

### 3. Set environment variables
```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

### 4. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel

### One-click deploy
1. Push this repo to GitHub
2. Import to Vercel: https://vercel.com/new
3. Add environment variables in Vercel Dashboard
4. Deploy

### GitHub Actions (automated)
Add these secrets to your GitHub repo (Settings → Secrets → Actions):
- `VERCEL_TOKEN` — from https://vercel.com/account/tokens
- `VERCEL_ORG_ID` — from `.vercel/project.json` after `vercel link`
- `VERCEL_PROJECT_ID` — from `.vercel/project.json` after `vercel link`
- `ANTHROPIC_API_KEY`
- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- `FOURSQUARE_API_KEY`

## Architecture
See [DESIGN.md](./DESIGN.md) for the full design plan.

## Code Attribution
Map component adapted from [TREK](https://github.com/mauriceboe/trek) (AGPL-3.0).
Shared UI components (Modal, Spinner, Toast) adapted from TREK.
