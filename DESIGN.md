# Road Trip Planner — Design Plan

## Vision
A chat-first road trip planning app where a Claude AI agent helps users plan US road trips,
suggests popular attractions at each stop, and helps find and book hotels with deals.
No accounts, no saved data — session only.

## Architecture

### Tech Stack
| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Vercel-native, streaming API routes |
| AI | Claude claude-sonnet-4-6 via Vercel AI SDK | Tool use, streaming |
| Places API | Foursquare Places API (100K req/month free) | Rich attraction data |
| Hotel Search | Amadeus for Developers (10K calls/month free) | Search + availability + deep-link booking |
| Maps | Leaflet + OpenStreetMap | Free, no cost |
| Styling | Tailwind CSS + shadcn/ui | Fast UI |
| CI/CD | GitHub Actions → Vercel | Auto-deploy |
| State | React state only (session) | No DB needed |

### Agent Tools
1. suggest_route_stops(origin, destination, num_days, interests) → stop cities with drive times
2. search_attractions(city, categories, limit) → Foursquare API
3. search_hotels(city, check_in, check_out, adults) → Amadeus Hotel Search
4. check_hotel_availability(hotel_id, check_in, check_out) → Amadeus Hotel Offers
5. build_booking_url(offer_id, guests) → deep-link URL to complete payment on hotel site

### User Flow
1. User chats: "Road trip Chicago to Nashville, July 4-10, family of 4"
2. Agent suggests stops with driving times
3. Map updates with route and pins
4. For each stop: top attractions + top 3 hotels with pricing
5. User selects hotel → agent shows availability + room details
6. User clicks "Review & Pay" → redirected to hotel booking page
7. User returns, continues planning next stop

### Booking Model
Hotels are booked via deep-link redirect to Amadeus partner sites.
No payment processing in-app — user completes payment externally.

## API Setup

### Amadeus for Developers
- Sign up: https://developers.amadeus.com/
- Free sandbox: 10,000 API calls/month
- Endpoints used:
  - GET /v1/reference-data/locations/hotels/by-city
  - GET /v2/shopping/hotel-offers
  - POST /v1/booking/hotel-bookings (sandbox)
- Env vars: AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET

### Foursquare Places API
- Sign up: https://foursquare.com/developers/
- Free tier: 100,000 requests/month
- Endpoints used:
  - GET /v3/places/search
  - GET /v3/places/{fsq_id}
- Env var: FOURSQUARE_API_KEY

### Anthropic Claude API
- Sign up: https://console.anthropic.com/
- Model: claude-sonnet-4-6
- Used via Vercel AI SDK with tool use + streaming
- Env var: ANTHROPIC_API_KEY

## Deployment

### Environment Variables (set in Vercel Dashboard)
- ANTHROPIC_API_KEY
- AMADEUS_CLIENT_ID
- AMADEUS_CLIENT_SECRET
- FOURSQUARE_API_KEY

### GitHub Actions
- ci.yml: On PR → lint + type-check
- deploy.yml: On push to main → deploy to Vercel production

### GitHub Secrets needed
- VERCEL_TOKEN
- VERCEL_ORG_ID
- VERCEL_PROJECT_ID
- ANTHROPIC_API_KEY
- AMADEUS_CLIENT_ID
- AMADEUS_CLIENT_SECRET
- FOURSQUARE_API_KEY

## Code Reuse from TREK
- MapView component (Leaflet, markers, polylines) — adapted for Next.js
- Modal, Spinner, Toast shared components — copied directly
- Tailwind config and CSS reset
- TypeScript patterns and Zod-style type definitions
- POI category icons and color system
