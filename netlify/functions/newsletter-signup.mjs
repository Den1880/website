// Den 1880 -- newsletter signup relay.
//
// /contact used to POST straight from the browser to the Apps Script web app
// that logs subscribers, which put the /exec URL *and its ?key=* in public page
// source. This function holds that URL server-side instead; the page only ever
// sees the same-origin path /api/newsletter-signup.
//
// Required Netlify environment variable (Site configuration -> Environment
// variables, never committed):
//   NEWSLETTER_ENDPOINT  the full Apps Script /exec URL including ?key=...
//
// Netlify Forms still captures every newsletter submission independently of
// this relay, so a missing/failed relay never loses a signup -- it just does
// not reach the Google Sheet or the notification email.

const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("method-not-allowed", { status: 405, headers: HEADERS });
  }

  let email = "";
  let referrer = "";
  try {
    // The page sends JSON via sendBeacon (as a text/plain Blob) or fetch.
    const payload = JSON.parse(await req.text());
    email = String(payload?.data?.email ?? payload?.email ?? "").trim().toLowerCase();
    referrer = String(payload?.data?.referrer ?? payload?.referrer ?? "").trim().slice(0, 500);
  } catch {
    return new Response("bad-request", { status: 400, headers: HEADERS });
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return new Response("invalid-email", { status: 400, headers: HEADERS });
  }

  const endpoint = process.env.NEWSLETTER_ENDPOINT;
  if (!endpoint) {
    console.warn("[newsletter-signup] NEWSLETTER_ENDPOINT is not set; signup kept by Netlify Forms only.");
    return new Response("not-configured", { status: 200, headers: HEADERS });
  }

  try {
    // Apps Script answers POSTs with a 302 to a googleusercontent URL; follow it
    // so the script actually runs, but we do not need to read the body.
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ form_name: "newsletter", data: { email, referrer } }),
      redirect: "follow",
    });
    if (!res.ok) console.warn("[newsletter-signup] Apps Script responded", res.status);
  } catch (err) {
    console.warn("[newsletter-signup] relay failed:", err?.message || err);
  }

  return new Response("ok", { status: 200, headers: HEADERS });
};

export const config = { path: "/api/newsletter-signup" };
