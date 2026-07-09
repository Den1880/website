// Optix -> Google Ads offline-conversions feed.
//
// Google Ads "scheduled uploads" (HTTPS source with Basic Auth) fetches this URL on
// its own schedule and imports the rows into the "Optix booking completed (offline)"
// conversion action. No browser session required: Optix is read via the organization
// token held in a Netlify environment variable.
//
// Required Netlify environment variables (Site settings -> Environment variables):
//   OPTIX_ORG_TOKEN  Data Bridge organization token (SECRET - treat like a bank password)
//   OPTIX_ORG_ID     Optix organization/venue id (defaults to "25734")
//   FEED_USER        Basic-auth username Google Ads will send
//   FEED_PASS        Basic-auth password Google Ads will send
//   WINDOW_DAYS      optional lookback window in days (defaults to 21)
//
// The response is a Google Ads offline-conversions CSV with unhashed emails; the
// scheduled-upload config must be set to "Unhashed customer data" so Google hashes
// them on ingest. The URL exposes customer emails, so it is protected by Basic Auth
// and must only ever be shared with the Google Ads scheduled upload.

const OPTIX_ENDPOINT = "https://api.optixapp.com/graphql";
const CONV_NAME = "Optix booking completed (offline)";

// Format a unix-seconds timestamp as ISO 8601 in America/Toronto with the correct
// DST-aware offset (-04:00 in summer, -05:00 in winter). Google rejects a space
// separator, so the "T" is required.
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

export default async (req) => {
  const user = process.env.FEED_USER;
  const pass = process.env.FEED_PASS;
  const auth = req.headers.get("authorization") || "";
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  if (!user || !pass || auth !== expected) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="optix-feed"' },
    });
  }

  const token = process.env.OPTIX_ORG_TOKEN;
  const orgId = process.env.OPTIX_ORG_ID || "25734";
  const windowDays = parseInt(process.env.WINDOW_DAYS || "21", 10);
  if (!token) return new Response("Missing OPTIX_ORG_TOKEN", { status: 500 });

  const query = `{ bookings(organization_id:"${orgId}", limit:200, order:CREATED_TIMESTAMP_DESC, include_approved:true, include_completed:true){ data { created_timestamp user{email} invoice_items{total} } } }`;

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

  const rows = (j.data && j.data.bookings && j.data.bookings.data) || [];
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowDays * 24 * 3600;
  const bad = /test|noreply|no-reply|example\.com/i;
  const staff = new Set(["andrew@athon.ca"]);

  const clean = rows
    .filter((b) => b.created_timestamp >= cutoff)
    .filter((b) => b.user && b.user.email && b.user.email.includes("@"))
    .filter((b) => !bad.test(b.user.email))
    .filter((b) => {
      const e = b.user.email.toLowerCase().trim();
      return !staff.has(e) && !e.includes("@den1880");
    })
    .sort((a, b) => a.created_timestamp - b.created_timestamp);

  const byEmail = {};
  for (const b of clean) {
    const e = b.user.email.toLowerCase().trim();
    if (!byEmail[e]) byEmail[e] = b;
  }

  const lines = ["Email,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
  for (const b of Object.values(byEmail)) {
    const val = (b.invoice_items || []).reduce((s, i) => s + (i.total || 0), 0);
    lines.push([b.user.email.trim(), CONV_NAME, torontoIso(b.created_timestamp), val.toFixed(2), "CAD"].join(","));
  }

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
  });
};

// Route this function at a clean path.
export const config = { path: "/optix-feed" };
