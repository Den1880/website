# Google Reviews feed

Adds a real-HTML Google Reviews section to the homepage and `/memberships`, and merges
`aggregateRating` + `review` into the existing `LocalBusiness` JSON-LD — from one cached
source so the on-page numbers and the schema numbers always match.

## How it works
1. **`netlify/functions/fetch-google-reviews.mjs`** — a scheduled function (runs `@daily`).
   Calls the Google Places API -> Place Details endpoint for Den 1880's Place ID, requesting
   only `rating`, `user_ratings_total`, and `reviews` (Google returns at most 5 reviews — a hard
   API limit). It normalizes the response and writes it to a Netlify Blob (`store "reviews"`,
   `key "google"`). On any error or empty result it keeps the last good cache and never writes a
   fabricated value.
2. **`netlify/edge-functions/inject-reviews.js`** — an edge function on `/` and `/memberships`.
   Each request reads the cached Blob (no Google call per request) and (a) injects the reviews
   section as real HTML at the `<!-- REVIEWS:SLOT -->` placeholder, and (b) merges
   `aggregateRating` + `review[]` into the single `<!-- SEO:LocalBusiness -->` block.

Pages never block on a live Google call.

## Refresh cadence
Daily (`export const config = { schedule: "@daily" }`). Google allows caching Place Details
content up to 30 days; daily refresh is well within that.

## Required environment variables (set in Netlify, never committed)
Netlify dashboard -> Site settings -> Environment variables:
- `GOOGLE_MAPS_API_KEY` — Google Maps Platform key with the Places API enabled (restrict it).
- `GOOGLE_PLACE_ID` — Den 1880's Place ID (Google Place ID Finder).

Until both are set, production renders no reviews section and no review schema (honest empty
state). Deploy previews show clearly-labelled SAMPLE data for design only; sample data never
feeds schema and never reaches production (gated on Netlify's CONTEXT env).

## Cost (free tier)
~30 Place Details calls/month, a few cents each — well inside the Maps Platform free credit.

## Changing how many reviews show
Google returns max 5. Adjust the two `.slice(0, 5)` calls in the edge function (display + schema)
and keep them equal so on-page and schema counts match.

## Attribution
Section shows "Reviews from Google" and links to the listing, per Places API policy.
