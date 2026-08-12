// Den 1880 — password gate for /preferred-vendors.
//
// WHY AN EDGE FUNCTION AND NOT A LITTLE BIT OF JAVASCRIPT
// A JS gate on the page itself ships the whole vendor sheet — names, emails, direct
// phone numbers — to every visitor and just hides it behind a click. View-source
// defeats it in three seconds. This runs before the static file is ever read, so an
// unauthenticated visitor receives the sign-in page and nothing else.
//
// HOW IT WORKS
// GET  — valid cookie? hand off to the static file. Otherwise render the sign-in page.
// POST — compare the submitted password, set the cookie, 303 back to the same URL.
//
// The cookie holds a SHA-256 of the password plus a fixed prefix, never the password
// itself, so a stolen cookie cannot be read back into the password. Changing
// VENDOR_PASS invalidates every cookie already out there, which is exactly what you
// want when a password gets passed around too widely.
//
// CHANGING THE PASSWORD: set VENDOR_PASS in Netlify → Site configuration →
// Environment variables. No deploy needed; edge functions read it per request. With
// the variable unset it falls back to "password", which is the placeholder Andrew
// asked for and should NOT survive first contact with a real client list.

export const config = { path: ["/preferred-vendors", "/preferred-vendors.html"] };

const COOKIE = "d1880_pv";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_PASS = "password";

async function tokenFor(pass) {
  const bytes = new TextEncoder().encode("den1880-preferred-vendors:" + pass);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// Constant-time-ish compare. Both sides are fixed-length hex digests, so this is
// mostly belt and braces, but string === on a secret-derived value is a bad habit.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function gatePage(failed) {
  const err = failed
    ? '<p class="err" role="alert">That password did not work. Check it and try again, or email ' +
      '<a href="mailto:events@den1880.co">events@den1880.co</a> and we will resend it.</p>'
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Preferred Vendors | Den 1880</title>
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Oswald:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Monschone';src:url('/assets/fonts/Monschone.woff2') format('woff2'),url('/assets/fonts/Monschone.ttf') format('truetype');font-weight:normal;font-style:normal;font-display:swap}
:root{--blue:#062241;--ink:#1B1C1C;--paper:#F2F1EA;--beige:#EFD3AE;--mustard:#D3A92A;--orange:#DF5526;--warn:#BB3F30}
*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100%}
body{background:var(--blue);color:#fff;font-family:'Inter',system-ui,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;min-height:100vh;min-height:100dvh;text-align:center}
a{color:inherit}
.mark{height:30px;width:auto;filter:brightness(0) invert(1);margin-bottom:38px}
.eyebrow{font-family:'Oswald',Impact,sans-serif;font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:500;color:var(--mustard);display:block;margin-bottom:16px}
h1{font-family:'Monschone',Georgia,serif;font-weight:400;text-transform:uppercase;font-size:clamp(30px,5vw,52px);line-height:1.05;letter-spacing:-0.02em;margin:0 0 18px;max-width:16ch}
h1 .accent{color:var(--mustard)}
p.lede{color:var(--beige);max-width:44ch;margin:0 0 32px;font-size:16px;line-height:1.7}
form{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:100%;max-width:440px}
label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
input[type=password]{flex:1 1 220px;background:transparent;border:1px solid rgba(239,211,174,.5);color:#fff;padding:13px 16px;font-family:'Inter',sans-serif;font-size:16px;border-radius:0}
input[type=password]::placeholder{color:rgba(239,211,174,.7)}
input[type=password]:focus{outline:2px solid var(--orange);outline-offset:2px;border-color:transparent}
button{background:var(--mustard);color:var(--ink);border:1px solid transparent;padding:13px 24px;border-radius:999px;font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:13px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
button:hover,button:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.err{color:#fff;background:var(--warn);max-width:440px;margin:20px auto 0;padding:12px 16px;font-size:14px;line-height:1.6;text-align:left}
.err a{color:#fff}
.foot{margin-top:44px;font-family:'Oswald',Impact,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(239,211,174,.75)}
.foot a{border-bottom:1px solid rgba(239,211,174,.4);padding-bottom:2px}
.foot a:hover{color:var(--orange);border-color:var(--orange)}
</style>
</head>
<body>
<img class="mark" src="/assets/den1880-logo-black.svg" alt="Den 1880">
<span class="eyebrow">Preferred vendor program</span>
<h1>This One&rsquo;s By <span class="accent">Invitation</span></h1>
<p class="lede">Our preferred vendor sheet lives behind a password. Enter yours and the full list opens up.</p>
<form method="POST" action="/preferred-vendors">
  <label for="pw">Password</label>
  <input id="pw" type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
  <button type="submit">View the sheet</button>
</form>
${err}
<div class="foot">Don&rsquo;t have it? <a href="mailto:events@den1880.co">Email events@den1880.co</a></div>
</body>
</html>`;
}

function htmlResponse(body, status, extraHeaders) {
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  };
  return new Response(body, { status, headers: { ...headers, ...(extraHeaders || {}) } });
}

export default async function handler(request, context) {
  const pass = Netlify.env.get("VENDOR_PASS") || DEFAULT_PASS;
  const expected = await tokenFor(pass);
  const url = new URL(request.url);

  if (request.method === "POST") {
    let submitted = "";
    try {
      const form = await request.formData();
      submitted = String(form.get("password") || "");
    } catch (_) {
      submitted = "";
    }
    if (safeEqual(await tokenFor(submitted), expected)) {
      return new Response(null, {
        status: 303,
        headers: {
          location: "/preferred-vendors",
          "cache-control": "no-store",
          "set-cookie":
            `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return htmlResponse(gatePage(true), 401);
  }

  if (safeEqual(readCookie(request, COOKIE), expected)) {
    // Authenticated. Serve the real page, but keep it out of shared caches and
    // out of the index — a gated page that gets crawled is not a gated page.
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-store");
    out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  }

  // .html twin normalises to the pretty URL so the form always posts to one path.
  if (url.pathname.endsWith(".html")) {
    return new Response(null, { status: 302, headers: { location: "/preferred-vendors" } });
  }
  return htmlResponse(gatePage(false), 200);
}
