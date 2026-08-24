// Den 1880 — /go/* booking handoff. Logs the Google click id, then redirects to Optix.
//
// WHY THIS EXISTS
// Every booking CTA on den1880.co hands the visitor off to den1880.optixapp.com, a
// domain we cannot tag. The visitor never types an email on den1880.co, so Google ends
// up holding a click with no email while our offline uploads held an email with no
// click. Nothing joined, and every Optix upload reported "0 matched to a click".
// This endpoint captures the gclid at the moment of handoff so the feed can later
// match a booking back to the exact ad click. gclid matching is exact; email was never
// going to work here.
//
// FAIL-OPEN CONTRACT — read before changing anything below.
// This code sits between customers and the booking system. The redirect MUST fire even
// if Blobs is down, the write throws, or the log is slow. Every failure path ends in a
// redirect. The worst acceptable outcome is losing attribution on one click. A lost
// booking is never acceptable. That is why the log is wrapped in try/catch AND raced
// against a timeout, and why nothing between here and the Response can throw.
//
// SEO: /go/ is disallowed in robots.txt, the CTAs are rel="nofollow", and this response
// carries X-Robots-Tag: noindex. It is a 302 (temporary handoff), never a 301 — a 301
// would tell Google the URL permanently lives on optixapp.com.

import { getStore } from "@netlify/blobs";
import { DEST, FALLBACK_URL } from "../shared/optix-rooms.js";

export const config = { path: "/go/*" };

// Hard cap on how long logging may delay a customer's redirect.
const LOG_TIMEOUT_MS = 400;

// Google click id params. gclid covers Search (effectively all of Den's spend today).
// gbraid/wbraid appear on iOS privacy-restricted traffic; we log them for completeness
// but the feed currently only uploads gclid rows.
const CLICK_PARAMS = ["gclid", "gbraid", "wbraid"];

// Only the production hostname may write to the click store. Deploy previews and
// branch deploys run this exact code on *.netlify.app, and a click logged from one is
// indistinguishable from a real one afterwards — it has a real-looking gclid, a real
// slug and a real timestamp, so it silently inflates the store and skews click-age
// stats. Anything not on this list still redirects; it just does not log.
const PROD_HOSTS = new Set(["den1880.co", "www.den1880.co"]);

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

function redirect(target) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export default async (request) => {
  let target = FALLBACK_URL;

  try {
    const url = new URL(request.url);
    const slug = url.pathname
      .replace(/^\/go\/?/, "")
      .replace(/\/+$/, "")
      .toLowerCase();

    const dest = Object.prototype.hasOwnProperty.call(DEST, slug) ? DEST[slug] : null;
    if (dest) target = dest.url;

    // Carry any click id the visitor arrived with straight through to the log.
    // Prefer the live URL param, fall back to the cookie set on landing.
    const ids = {};
    for (const p of CLICK_PARAMS) {
      ids[p] = url.searchParams.get(p) || readCookie(request, "_den_" + p) || "";
    }

    // Only log clicks that carry an ad click id. An organic visitor can never be
    // uploaded as an offline conversion, so logging them would just grow the store.
    // And only from production — see PROD_HOSTS above.
    const isProd = PROD_HOSTS.has(url.hostname.toLowerCase());
    if (isProd && (ids.gclid || ids.gbraid || ids.wbraid)) {
      const record = {
        ts: Math.floor(Date.now() / 1000),
        slug,
        resourceId: dest ? dest.resourceId : null,
        gclid: ids.gclid,
        gbraid: ids.gbraid,
        wbraid: ids.wbraid,
      };
      const key = `${record.ts}-${Math.random().toString(36).slice(2, 8)}`;

      // Race the write against a timeout so a slow Blobs call can't stall a booking.
      await Promise.race([
        getStore("go-clicks").setJSON(key, record),
        new Promise((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS)),
      ]);
    }
  } catch {
    // Attribution is expendable. The booking is not. Swallow and redirect.
  }

  return redirect(target);
};
