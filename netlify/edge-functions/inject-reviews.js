// Den 1880 — Google Reviews edge renderer.
// Reads the cached reviews (Netlify Blobs, written daily by fetch-google-reviews) and:
//   1) injects a real-HTML reviews section at the <!-- REVIEWS:SLOT --> placeholder
//   2) merges aggregateRating + review[] into the existing single LocalBusiness JSON-LD
// Zero Google calls per request (reads cache only). On empty cache:
//   - production: leaves the page unchanged (honest empty state, no schema)
//   - non-production (deploy-preview/branch): renders clearly-labelled SAMPLE data for design
//     review and does NOT inject any schema, so no fabricated rating can ever reach production.
import { getStore } from "@netlify/blobs";

export const config = { path: ["/", "/memberships"] };

// --- FIXTURE: sample data for DESIGN PREVIEW ONLY. Never used in production, never feeds schema. ---
const FIXTURE = {
  ratingValue: 4.9,
  reviewCount: 87,
  googleUrl: "#",
  reviews: [
    { author: "Sample Reviewer", rating: 5, text: "Sample review for layout preview only — this is placeholder text, not a real Google review. The real reviews replace this once the Place ID and API key are connected.", relativeTime: "a week ago", date: "2025-01-01", profilePhoto: "", authorUrl: "#" },
    { author: "Sample Reviewer", rating: 5, text: "Sample review for layout preview only. Beautiful space, friendly team, great amenities. Placeholder copy.", relativeTime: "2 weeks ago", date: "2025-01-01", profilePhoto: "", authorUrl: "#" },
    { author: "Sample Reviewer", rating: 4, text: "Sample review for layout preview only. Placeholder copy to show how a four-star card renders in the grid.", relativeTime: "a month ago", date: "2025-01-01", profilePhoto: "", authorUrl: "#" }
  ]
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function starsSVG(rating) {
  const full = Math.round(Number(rating) || 0);
  let out = '<span class="gr-stars" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    out += '<svg viewBox="0 0 20 20" class="gr-star ' + (i <= full ? "is-on" : "is-off") + '"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"/></svg>';
  }
  out += "</span>";
  return out;
}

function reviewCard(r) {
  const avatar = r.profilePhoto
    ? '<img class="gr-avatar" src="' + esc(r.profilePhoto) + '" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer">'
    : '<span class="gr-avatar gr-avatar--blank" aria-hidden="true">' + esc((r.author || "?").trim().charAt(0)) + '</span>';
  const meta = esc(r.relativeTime || r.date || "");
  return ''
    + '<figure class="gr-card">'
    + '<div class="gr-card-head">' + avatar
    + '<div><figcaption class="gr-author">' + esc(r.author) + '</figcaption>'
    + '<div class="gr-card-meta">' + starsSVG(r.rating) + (meta ? '<span class="gr-when">' + meta + '</span>' : '') + '</div></div></div>'
    + '<blockquote class="gr-text">' + esc(r.text) + '</blockquote>'
    + '</figure>';
}

function sectionHTML(data, sample) {
  const rating = Number(data.ratingValue).toFixed(1);
  const cards = data.reviews.slice(0, 5).map(reviewCard).join("");
  const sampleBadge = sample
    ? '<p class="gr-sample" role="note">Sample data — preview only. Live Google reviews appear once the Place ID &amp; API key are connected.</p>'
    : '';
  const reviewWord = data.reviewCount === 1 ? "review" : "reviews";
  return ''
+ '<style>'
+ '.gr-reviews{background:var(--paper,#F7F4EE);padding:72px 24px;border-top:1px solid var(--line,#E6E1D6)}'
+ '.gr-inner{max-width:1100px;margin:0 auto}'
+ '.gr-head{text-align:center;margin-bottom:34px}'
+ '.gr-eyebrow{display:inline-block;font-family:"Space Grotesk",sans-serif;font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--muted,#6F6A60);margin-bottom:12px}'
+ '.gr-head h2{font-family:"Playfair Display",Georgia,serif;font-weight:600;font-size:clamp(26px,3.2vw,38px);line-height:1.12;color:var(--ink,#0E0E0E);margin:0}'
+ '.gr-score{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px;flex-wrap:wrap}'
+ '.gr-score-num{font-family:"Playfair Display",Georgia,serif;font-size:34px;font-weight:600;color:var(--ink,#0E0E0E);line-height:1}'
+ '.gr-stars{display:inline-flex;gap:2px}'
+ '.gr-star{width:20px;height:20px;display:block}'
+ '.gr-star.is-on{fill:#E3A521}.gr-star.is-off{fill:#D8D2C6}'
+ '.gr-count{font-family:"Inter",sans-serif;font-size:14px;color:var(--muted,#6F6A60)}'
+ '.gr-count a{color:var(--plum,#6B4E8E);font-weight:600;text-decoration:none}'
+ '.gr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}'
+ '@media(max-width:900px){.gr-grid{grid-template-columns:1fr}}'
+ '.gr-card{background:#fff;border:1px solid var(--line,#E6E1D6);border-radius:14px;padding:24px;margin:0;box-shadow:0 1px 2px rgba(14,14,14,.04),0 8px 32px rgba(14,14,14,.06)}'
+ '.gr-card-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}'
+ '.gr-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--line,#E6E1D6)}'
+ '.gr-avatar--blank{display:inline-flex;align-items:center;justify-content:center;font-family:"Playfair Display",serif;font-size:18px;color:#fff;background:var(--plum,#6B4E8E)}'
+ '.gr-author{font-family:"Inter",sans-serif;font-weight:600;font-size:15px;color:var(--ink,#0E0E0E)}'
+ '.gr-card-meta{display:flex;align-items:center;gap:8px;margin-top:3px}'
+ '.gr-card-meta .gr-star{width:15px;height:15px}'
+ '.gr-when{font-family:"Inter",sans-serif;font-size:12px;color:var(--muted,#6F6A60)}'
+ '.gr-text{font-family:"Inter",sans-serif;font-size:15px;line-height:1.6;color:var(--ink-2,#2A2A2A);margin:0;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}'
+ '.gr-attr{text-align:center;margin-top:28px;font-family:"Inter",sans-serif;font-size:12.5px;color:var(--muted,#6F6A60)}'
+ '.gr-attr a{color:var(--plum,#6B4E8E);text-decoration:none;font-weight:600}'
+ '.gr-sample{text-align:center;font-family:"Inter",sans-serif;font-size:12px;color:#9a7b00;background:#fff7df;border:1px solid #f0e2a8;border-radius:999px;padding:7px 14px;display:inline-block;margin:0 auto 22px}'
+ '</style>'
+ '<section class="gr-reviews" aria-labelledby="gr-h2">'
+ '<div class="gr-inner">'
+ (sample ? '<div style="text-align:center">' + sampleBadge + '</div>' : '')
+ '<div class="gr-head">'
+ '<span class="gr-eyebrow">Reviews</span>'
+ '<h2 id="gr-h2">What people say about Den 1880</h2>'
+ '<div class="gr-score">'
+ '<span class="gr-score-num">' + esc(rating) + '</span>'
+ starsSVG(data.ratingValue)
+ '<span class="gr-count">' + esc(String(data.reviewCount)) + ' Google ' + reviewWord
+ (data.googleUrl && data.googleUrl !== "#" ? ' · <a href="' + esc(data.googleUrl) + '" target="_blank" rel="noopener">Read on Google</a>' : '')
+ '</span></div></div>'
+ '<div class="gr-grid">' + cards + '</div>'
+ '<p class="gr-attr">Reviews from Google'
+ (data.googleUrl && data.googleUrl !== "#" ? ' · <a href="' + esc(data.googleUrl) + '" target="_blank" rel="noopener">See all reviews on Google</a>' : '')
+ '</p>'
+ '</div></section>';
}

function mergeSchema(html, data) {
  return html.replace(
    /(<!-- SEO:LocalBusiness -->\s*<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
    (m, pre, json, post) => {
      try {
        const obj = JSON.parse(json.trim());
        obj.aggregateRating = {
          "@type": "AggregateRating",
          ratingValue: String(data.ratingValue),
          reviewCount: String(data.reviewCount),
          bestRating: "5",
          worstRating: "1"
        };
        obj.review = data.reviews.slice(0, 5).map((r) => {
          const rev = {
            "@type": "Review",
            author: { "@type": "Person", name: r.author },
            reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5", worstRating: "1" },
            reviewBody: r.text
          };
          if (r.date) rev.datePublished = r.date;
          return rev;
        });
        return pre + JSON.stringify(obj) + post;
      } catch (e) {
        return m;
      }
    }
  );
}

export default async (request, context) => {
  const res = await context.next();
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/html")) return res;

  let html = await res.text();
  if (!html.includes("<!-- REVIEWS:SLOT -->")) return new Response(html, res);

  let data = null;
  try {
    const store = getStore("reviews");
    data = await store.get("google", { type: "json" });
  } catch (_) { data = null; }

  const isProd = (Deno.env.get("CONTEXT") || "production") === "production";
  let sample = false;

  if (!data || !Array.isArray(data.reviews) || data.reviews.length === 0) {
    if (!isProd) { data = FIXTURE; sample = true; }
    else { return new Response(html.replace("<!-- REVIEWS:SLOT -->", ""), res); }
  }

  html = html.replace("<!-- REVIEWS:SLOT -->", sectionHTML(data, sample));
  if (!sample) html = mergeSchema(html, data);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, headers });
};
