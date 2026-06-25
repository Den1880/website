// Den 1880 — daily Google Reviews fetch -> Netlify Blobs cache.
// Data source: Google Places API (Place Details). The ONLY allowed pipe. No scraping.
// Env vars (set in Netlify dashboard, never committed):
//   GOOGLE_MAPS_API_KEY  — Maps Platform key with Places API enabled
//   GOOGLE_PLACE_ID      — Den 1880's Place ID (Google Place ID Finder)
// On any failure or empty result we KEEP the last good cache; we never write a fabricated value.
import { getStore } from "@netlify/blobs";

export const config = { schedule: "@daily" };

export default async () => {
  const store = getStore("reviews");
  const PLACE_ID = process.env.GOOGLE_PLACE_ID;
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (!PLACE_ID || !API_KEY) {
    console.warn("[reviews] Missing GOOGLE_PLACE_ID and/or GOOGLE_MAPS_API_KEY — skipping fetch, keeping last good cache.");
    return new Response("missing-config", { status: 200 });
  }

  // Minimal field list keeps cost down. user_ratings_total = true total; reviews = up to 5 (Google's cap).
  const fields = "rating,user_ratings_total,reviews";
  const url = "https://maps.googleapis.com/maps/api/place/details/json"
    + "?place_id=" + encodeURIComponent(PLACE_ID)
    + "&fields=" + fields
    + "&reviews_sort=newest"
    + "&key=" + API_KEY;

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== "OK" || !j.result) {
      throw new Error("Places status " + j.status + " " + (j.error_message || ""));
    }
    const res = j.result;
    const normalized = {
      ratingValue: typeof res.rating === "number" ? res.rating : null,
      reviewCount: typeof res.user_ratings_total === "number" ? res.user_ratings_total : 0,
      googleUrl: "https://search.google.com/local/reviews?placeid=" + encodeURIComponent(PLACE_ID),
      reviews: (res.reviews || []).map((rv) => ({
        author: rv.author_name || "Google user",
        rating: rv.rating || null,
        text: rv.text || "",
        relativeTime: rv.relative_time_description || "",
        date: rv.time ? new Date(rv.time * 1000).toISOString().slice(0, 10) : null,
        profilePhoto: rv.profile_photo_url || "",
        authorUrl: rv.author_url || ""
      })),
      fetchedAt: new Date().toISOString()
    };

    // Guard: do not overwrite a good cache with an empty/garbage response.
    if (normalized.ratingValue == null || normalized.reviews.length === 0) {
      console.warn("[reviews] API returned no rating/reviews — keeping last good cache.");
      return new Response("empty-result-kept-cache", { status: 200 });
    }

    await store.setJSON("google", normalized);
    console.log("[reviews] cached " + normalized.reviews.length + " reviews, total "
      + normalized.reviewCount + ", rating " + normalized.ratingValue);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[reviews] fetch failed, keeping last good cache:", e.message);
    return new Response("error-kept-cache", { status: 200 });
  }
};
