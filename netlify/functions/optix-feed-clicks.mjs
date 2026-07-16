// Optix -> Google Ads offline conversions, matched on Google Click ID (gclid).
//
// This is the companion to the /go/* edge function. That endpoint logs the gclid at the
// moment a visitor leaves den1880.co for the Optix booking app. This feed pulls recent
// Optix bookings and joins each one back to a logged click on (resource + time window),
// then emits a Google Ads offline-conversions CSV keyed by gclid.
//
// WHY gclid AND NOT EMAIL
// The existing /optix-feed endpoint uploads emails. It has reported "0 matched to a
// click" on every single run, and it always will: the visitor never types an email on
// den1880.co (the booking form lives on Optix's domain), so Google never associates the
// email with the ad click. gclid matching is exact and needs nothing from Optix.
//
// This endpoint does NOT replace /optix-feed. Both can run. Once this one is proven,
// /optix-feed is redundant and can be retired.
//
// Google Ads setup: Goals > Conversions > Uploads > Schedules > +
//   Source: HTTPS, URL: https://den1880.co/optix-feed-clicks
//   Data type: "Conversions from clicks" (Google Click ID), NOT customer data
//   Auth: FEED_USER / FEED_PASS
//
// Environment variables (shared with /optix-feed):
//   OPTIX_ORG_TOKEN  Data Bridge organization token (SECRET)
//   OPTIX_ORG_ID     defaults to "25734"
//   FEED_USER        Basic-auth username Google Ads sends
//   FEED_PASS        Basic-auth password Google Ads sends
//   WINDOW_DAYS      booking lookback, defaults to 21
//   JOIN_WINDOW_MIN  max minutes between click and booking, defaults to 120
//
// Diagnostics: append ?debug=1 (still behind Basic Auth) to see the raw resource shape
// the Optix API returns plus join statistics, without touching the CSV output. Use this
// to confirm the resource field names once OPTIX_ORG_TOKEN is set.

import { getStore } from "@netlify/blobs";
import { BY_RESOURCE_ID, BY_TITLE, normaliseTitle } from "../shared/optix-rooms.js";

const OPTIX_ENDPOINT = "https://api.optixapp.com/graphql";
const GCLID_MAX_AGE_DAYS = 90; // Google's offline import limit; prune the log past this.

// Same DST-aware Toronto formatter as /optix-feed. Google rejects a space separator,
// so the "T" is required, and the offset must be real (-04:00 summer / -05:00 winter).
function torontoIso(unixSec) {
  const d = new Date(unixSec * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  const offMin = Math.round((asUTC - d.getTime()) / 60000);
  const sign = offMin >= 0 ? "+" : "-";
  const a = Math.abs(offMin);
  const oh = String(Math.floor(a / 60)).padStart(2, "0");
  const om = String(a % 60).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}${sign}${oh}:${om}`;
}

// Resolve an Optix booking's resource to one of our known rooms.
//
// ID ONLY. There is deliberately no title fallback.
//
// Titles cannot be trusted for attribution: Optix runs several near-identical names
// ("Theatre Meeting" vs "Theatre Event Booking"), so a title match can hand a booking the
// resourceId of a DIFFERENT room and credit it to the wrong click. Under-reporting is
// acceptable; mis-attributing revenue is not. If the id is absent or unknown, we return
// null and the booking is skipped — visible in ?debug=1 as noRoom, never as a silent
// wrong number.
export function resolveRoom(resource) {
  if (!resource) return null;
  const rid = resource.resource_id ?? resource.id ?? null;
  if (rid == null) return null;
  return BY_RESOURCE_ID[String(rid)] || null;
}

// Join bookings to logged clicks.
//
// Rules, deliberately conservative — under-report rather than mis-attribute:
//   - the click must be for the SAME room as the booking
//   - the click must come BEFORE the booking, within joinWindowMin
//   - a click is consumed by at most one booking
//   - if several candidate clicks carry DIFFERENT click ids, we cannot tell whose
//     booking this is, so we drop it entirely
//   - if several candidates share ONE click id it's the same person clicking twice
//     (click, browse, come back), which is normal — take their most recent click
export function joinBookingsToClicks(bookings, clicks, joinWindowMin) {
  const matched = [];
  const stats = { noRoom: 0, noCandidate: 0, ambiguous: 0, matched: 0 };
  const used = new Set();
  const windowSec = joinWindowMin * 60;

  // Oldest booking first, so an earlier booking claims its click before a later one.
  const ordered = [...bookings].sort((a, b) => a.created_timestamp - b.created_timestamp);

  for (const b of ordered) {
    if (!b.room || !b.room.resourceId) { stats.noRoom++; continue; }

    const cands = clicks.filter(
      (c) =>
        !used.has(c.key) &&
        c.resourceId === b.room.resourceId &&
        c.ts <= b.created_timestamp &&
        b.created_timestamp - c.ts <= windowSec
    );

    if (cands.length === 0) { stats.noCandidate++; continue; }

    const distinctIds = new Set(cands.map((c) => c.gclid || c.gbraid || c.wbraid));
    if (distinctIds.size > 1) { stats.ambiguous++; continue; }

    const click = cands.sort((x, y) => y.ts - x.ts)[0]; // last touch
    used.add(click.key);
    stats.matched++;
    matched.push({ booking: b, click });
  }

  return { matched, stats };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function loadClicks(store) {
  const { blobs } = await store.list();
  const out = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const staleBefore = nowSec - GCLID_MAX_AGE_DAYS * 24 * 3600;
  const stale = [];

  for (const b of blobs) {
    let rec;
    try {
      rec = await store.get(b.key, { type: "json" });
    } catch {
      continue;
    }
    if (!rec || !rec.ts) continue;
    if (rec.ts < staleBefore) { stale.push(b.key); continue; }
    out.push({ ...rec, key: b.key });
  }

  // Housekeeping: a gclid older than Google's 90-day window can never be uploaded.
  for (const key of stale) {
    try { await store.delete(key); } catch { /* best effort */ }
  }

  return out;
}

export default async (req) => {
  const user = process.env.FEED_USER;
  const pass = process.env.FEED_PASS;
  const token = process.env.OPTIX_ORG_TOKEN;
  const orgId = process.env.OPTIX_ORG_ID || "25734";
  const windowDays = parseInt(process.env.WINDOW_DAYS || "21", 10);
  const joinWindowMin = parseInt(process.env.JOIN_WINDOW_MIN || "120", 10);

  const auth = req.headers.get("authorization") || "";
  const expected = user && pass ? "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") : null;
  if (!expected || auth !== expected) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: "auth-failed",
        envConfigured: { FEED_USER: !!user, FEED_PASS: !!pass, OPTIX_ORG_TOKEN: !!token },
      }),
      { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
  if (!token) return new Response("Missing OPTIX_ORG_TOKEN", { status: 500 });

  const debug = new URL(req.url).searchParams.get("debug") === "1";

  // FIELD CHOICE: resource_id + name, never title.
  // Introspection of the Resource type reports hasTitle:false, yet `resource{ title }`
  // resolves fine — so `title` is DEPRECATED (introspection hides deprecated fields by
  // default). Depending on it meant depending on a field Optix can delete in any release,
  // and we'd only find out when attribution silently went to zero. `name` is the current
  // field; `resource_id` is what we actually match on.
  //
  // NOTE ON SCOPING ARGUMENTS
  // An organization token is already scoped to the org, so `bookings` does NOT accept
  // organization_id (it errors "Unknown argument ... Did you mean location_id?"). That
  // argument only exists for the session-token schema, which is what the July 2026
  // manual uploads used. Scope by location_id only if OPTIX_LOCATION_ID is set;
  // otherwise let the token's own scope apply.
  const locId = process.env.OPTIX_LOCATION_ID;
  const scopeArg = locId ? `location_id:"${locId}", ` : "";
  const query = `{ bookings(${scopeArg}limit:200, order:CREATED_TIMESTAMP_DESC, include_approved:true, include_completed:true){ data { created_timestamp resource{ resource_id name } invoice_items{total} } } }`;

  // ?debug=resource follows Booking.resource to its REAL type and lists that type's
  // fields. Introspecting a type literally named "Resource" was itself a guess: it has
  // `name` and no `title`, yet our query resolves `resource{ title }` fine — so the field
  // is a different type. Guessing field names is what caused the title mis-attribution
  // bug; this asks instead.
  if (new URL(req.url).searchParams.get("debug") === "resource") {
    const ask = async (query) => {
      const r = await fetch(OPTIX_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ query }),
      });
      return r.json();
    };
    try {
      // 1. What type is Booking.resource?
      const b = await ask(`{ __type(name:"Booking"){ fields{ name type{ name kind ofType{ name kind ofType{ name } } } } } }`);
      if (b.errors) return new Response(JSON.stringify({ ok: false, step: "Booking", errors: b.errors }, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
      const bf = ((b.data && b.data.__type && b.data.__type.fields) || []);
      const rf = bf.find((f) => f.name === "resource");
      const unwrap = (t) => (!t ? null : t.name || unwrap(t.ofType));
      const typeName = rf ? unwrap(rf.type) : null;
      if (!typeName) {
        return new Response(JSON.stringify({ ok: false, reason: "no resource field on Booking", bookingFields: bf.map((f) => f.name).sort() }, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // 2. What fields does THAT type actually have?
      const t2 = await ask(`{ __type(name:"${typeName}"){ fields{ name type{ name kind ofType{ name } } } } }`);
      const fields = ((t2.data && t2.data.__type && t2.data.__type.fields) || []).map((f) => f.name);
      return new Response(JSON.stringify({
        ok: true,
        bookingResourceTypeName: typeName,
        fieldsOnThatType: fields.sort(),
        idFieldCandidates: fields.filter((f) => /(^id$|_id$)/i.test(f)),
        hasTitle: fields.includes("title"),
        hasResourceId: fields.includes("resource_id"),
      }, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 502 });
    }
  }

  // ?debug=schema asks Optix which arguments `bookings` accepts for THIS token type.
  // Cheaper than guessing: the arg names differ between session and organization tokens.
  if (new URL(req.url).searchParams.get("debug") === "schema") {
    const introspect = `{ __type(name:"Query"){ fields{ name args{ name type{ name kind ofType{ name kind } } } } } }`;
    try {
      const r = await fetch(OPTIX_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ query: introspect }),
      });
      const s = await r.json();
      if (s.errors) return new Response(JSON.stringify({ ok: false, introspectionErrors: s.errors }, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
      const fields = ((s.data && s.data.__type && s.data.__type.fields) || []);
      const bookings = fields.find((f) => f.name === "bookings");
      return new Response(JSON.stringify({
        ok: true,
        tokenWorks: true,
        bookingsArgs: bookings ? bookings.args.map((a) => a.name) : null,
        bookingsArgDetail: bookings ? bookings.args : null,
        queryFieldsAvailable: fields.map((f) => f.name).sort(),
      }, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 502 });
    }
  }

  let j;
  try {
    const r = await fetch(OPTIX_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ query }),
    });
    j = await r.json();
  } catch (e) {
    return new Response("Optix fetch failed: " + e.message, { status: 502 });
  }
  if (j.errors) return new Response("Optix error: " + JSON.stringify(j.errors), { status: 502 });

  const raw = (j.data && j.data.bookings && j.data.bookings.data) || [];
  const cutoff = Math.floor(Date.now() / 1000) - windowDays * 24 * 3600;

  const bookings = raw
    .filter((b) => b.created_timestamp >= cutoff)
    .map((b) => ({
      created_timestamp: b.created_timestamp,
      value: (b.invoice_items || []).reduce((s, i) => s + (i.total || 0), 0),
      resourceTitle: (b.resource && b.resource.name) || null,
      room: resolveRoom(b.resource),
    }));

  let clicks = [];
  let clickErr = null;
  try {
    clicks = await loadClicks(getStore("go-clicks"));
  } catch (e) {
    clickErr = e.message;
  }

  const { matched, stats } = joinBookingsToClicks(bookings, clicks, joinWindowMin);

  if (debug) {
    return new Response(
      JSON.stringify(
        {
          ok: true,
          bookingsInWindow: bookings.length,
          clicksLogged: clicks.length,
          clickStoreError: clickErr,
          joinWindowMin,
          stats,
          // Confirms whether the resource titles Optix returns actually line up with
          // the map in netlify/shared/optix-rooms.js.
          resourceTitlesSeen: [...new Set(bookings.map((b) => b.resourceTitle))],
          // Rooms Optix knows about that our map does NOT. Non-empty here means the
          // join is silently skipping real bookings — treat it as a failure, not a note.
          roomsResolved: bookings.filter((b) => b.room).length,
          unmatchedTitles: [...new Set(bookings.filter((b) => !b.room).map((b) => b.resourceTitle))],
          sampleRows: matched.slice(0, 3).map((m) => ({
            room: m.booking.room.slug,
            conversionName: m.booking.room.conversionName,
            value: m.booking.value,
            time: torontoIso(m.booking.created_timestamp),
            gclidPresent: !!m.click.gclid,
          })),
        },
        null,
        2
      ),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  const lines = ["Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
  for (const m of matched) {
    // Only gclid uploads in this format. gbraid/wbraid use a different column and are
    // rare on Search traffic; they stay logged but unuploaded rather than risk a
    // malformed row rejecting the whole file.
    if (!m.click.gclid) continue;
    lines.push(
      [
        csvEscape(m.click.gclid),
        csvEscape(m.booking.room.conversionName),
        csvEscape(torontoIso(m.booking.created_timestamp)),
        m.booking.value.toFixed(2),
        "CAD",
      ].join(",")
    );
  }

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
  });
};

export const config = { path: "/optix-feed-clicks" };
