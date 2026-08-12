// Den 1880 — single source of truth for Optix booking destinations.
//
// Imported by BOTH:
//   netlify/edge-functions/go.js        (the /go/* redirect that logs the click)
//   netlify/functions/optix-feed-clicks.mjs (the feed that joins bookings back to clicks)
//
// Keep this map in sync with the booking CTAs on meeting-rooms.html and
// the-vault-podcast-studio.html. If a slug here has no matching CTA (or vice versa)
// the click is simply never logged/joined — it fails quiet, not loud.
//
// TITLES ARE NOT GUESSES. Each `title` below is the exact resource name Optix returns
// (verified against ?debug=1 resourceTitlesSeen on 2026-07-16). Do not "clean them up":
// "The Vault Podcast Studio" is not "The Vault", and "Theatre Event Booking" is not
// "The Theatre". An earlier version guessed these and the join silently matched nothing
// on 15 of 23 bookings while reporting ok:true. resolveRoom now matches on resource_id
// ONLY — titles are diagnostics, never attribution.
//
// WHY TITLES ARE NOT SAFE FOR ATTRIBUTION (learned the hard way, 2026-07-16):
// Optix has several similarly-named resources. 634941 is "Theatre Meeting"; there is a
// SEPARATE "Theatre Event Booking". An earlier version paired resourceId 634941 with the
// title "Theatre Event Booking", so a booking of one room would have resolved by title
// and been credited to a click on the other. Wrong room, wrong revenue, silently.
// Every title below was then verified against that resource's own live booking page.
//
// resourceId: the Optix resource this click is *for*. A click with no resourceId
// (e.g. the generic "Book a Room" button) is still logged for funnel visibility but
// is NEVER joined to a booking — we can't tell which room it became, and guessing
// would mis-attribute revenue.
//
// conversionName: the Google Ads offline conversion action the booking uploads into.
// Rooms are grouped by margin/product family so spend can be dialled per family.

export const OPTIX_BASE = "https://den1880.optixapp.com";

// Fallback when a slug is unknown. Never dead-end a customer mid-booking.
export const FALLBACK_URL = `${OPTIX_BASE}/book/`;

export const CONV_VAULT = "Vault booking (offline)";
export const CONV_MEETING = "Meeting room booking (offline)";
export const CONV_EVENT_SPACE = "Event space booking (offline)";

export const DEST = {
  // --- The Vault podcast studio ---
  vault: {
    url: `${OPTIX_BASE}/book/resource/619270`,
    resourceId: "619270",
    title: "The Vault Podcast Studio",
    conversionName: CONV_VAULT,
  },
  "day-pass": {
    // Single Day Pass, $45 (Optix product 48328, verified in the live signup
    // flow 2026-08-12 -- the deep link preselects the pass and jumps straight
    // to "Your details"). Sold via signup, not a resource booking, so no
    // resourceId and it never joins -- logged for funnel visibility only.
    // Sibling product for reference: 4 Pack of Day Passes = 53350.
    url: `${OPTIX_BASE}/signup/?location=27903&products=48328`,
    resourceId: null,
    title: "Single Day Pass",
    conversionName: null,
  },

  "podcast-bundle": {
    // 10-hour bundle, $760 flat (Optix product 48415). Sold via signup, not a resource
    // booking, so it has no resourceId and never joins. Logged for funnel visibility.
    url: `${OPTIX_BASE}/signup/?location=27903&products=48415`,
    resourceId: null,
    title: "Podcast Bundle",
    conversionName: CONV_VAULT,
  },

  // --- Meeting rooms ---
  grand: {
    url: `${OPTIX_BASE}/book/resource/619268`,
    resourceId: "619268",
    title: "The Grand Boardroom",
    conversionName: CONV_MEETING,
  },
  "olive-laurel": {
    url: `${OPTIX_BASE}/book/resource/619267`,
    resourceId: "619267",
    title: "Olive & Laurel",
    conversionName: CONV_MEETING,
  },
  oak: {
    url: `${OPTIX_BASE}/book/resource/619264`,
    resourceId: "619264",
    title: "The Oak",
    conversionName: CONV_MEETING,
  },
  dominion: {
    url: `${OPTIX_BASE}/book/resource/619269`,
    resourceId: "619269",
    title: "The Dominion",
    conversionName: CONV_MEETING,
  },
  olive: {
    url: `${OPTIX_BASE}/book/resource/619265`,
    resourceId: "619265",
    title: "The Olive",
    conversionName: CONV_MEETING,
  },
  laurel: {
    url: `${OPTIX_BASE}/book/resource/619266`,
    resourceId: "619266",
    title: "The Laurel",
    conversionName: CONV_MEETING,
  },

  // --- Larger event spaces bookable by the hour ---
  theatre: {
    url: `${OPTIX_BASE}/book/resource/634941`,
    resourceId: "634941",
    title: "Theatre Meeting",
    conversionName: CONV_EVENT_SPACE,
  },
  library: {
    url: `${OPTIX_BASE}/book/resource/634942`,
    resourceId: "634942",
    title: "Library Meeting",
    conversionName: CONV_EVENT_SPACE,
  },

  // --- Generic booking entry point (no specific room) ---
  book: {
    url: `${OPTIX_BASE}/book/`,
    resourceId: null,
    title: null,
    conversionName: null,
  },
};

// resourceId -> slug entry, for the feed's join.
export const BY_RESOURCE_ID = Object.fromEntries(
  Object.entries(DEST)
    .filter(([, d]) => d.resourceId)
    .map(([slug, d]) => [d.resourceId, { slug, ...d }])
);

// Normalised title -> entry. Fallback for the join when the Optix API doesn't
// expose a resource id and we only get the resource's display title.
export const BY_TITLE = Object.fromEntries(
  Object.entries(DEST)
    .filter(([, d]) => d.resourceId && d.title)
    .map(([slug, d]) => [normaliseTitle(d.title), { slug, ...d }])
);

export function normaliseTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}
