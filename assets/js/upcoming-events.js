/* Den 1880 -- "Upcoming at Den" event list renderer.
 *
 * Reads the "events" list from /content/upcoming.json (edited in /admin under
 * Site Pages > Upcoming at Den), drops any event whose day has already passed,
 * sorts the rest soonest-first and draws them into #events-list. Also rewrites
 * the schema.org Event data in <script id="events-ld"> so Google sees the same
 * list visitors do.
 *
 * The HTML ships with the list as it stood when the page was last built, so
 * if this fetch fails the page still shows real events rather than going blank.
 *
 * Dates are typed in /admin as local Waterloo time ("2026-11-10T17:00") and are
 * read as plain numbers, never through Date's UTC parsing, so a visitor in
 * another time zone sees the same day and time printed on the poster.
 */
(function () {
  var list = document.getElementById("events-list");
  if (!list) return;

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseStart(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || "").trim());
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] == null ? null : +m[4], mi: m[5] == null ? 0 : +m[5] };
  }

  function clock(h, mi) {
    var ap = h >= 12 ? "pm" : "am", hh = h % 12 || 12;
    return hh + ":" + (mi < 10 ? "0" : "") + mi + " " + ap;
  }

  function dayKey(p) { return p.y * 10000 + p.mo * 100 + p.d; }

  function todayKey() {
    var n = new Date();
    return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
  }

  function safeUrl(u) {
    u = String(u || "").trim();
    return /^(https?:\/\/|\/)/i.test(u) ? u : "";
  }

  function card(ev, p) {
    var wd = DAYS[new Date(p.y, p.mo - 1, p.d).getDay()];
    var when = wd + ", " + MONTHS[p.mo - 1] + " " + p.d;
    var time = p.h == null ? "" : clock(p.h, p.mi);
    if (time && ev.end_time) time += " &#8211; " + esc(ev.end_time);
    var link = safeUrl(ev.link);
    var ext = /^https?:/i.test(link) && !/^https?:\/\/(www\.)?den1880\.co/i.test(link);
    var img = safeUrl(ev.image);
    var h = '<article class="ev-card">';
    if (img) {
      h += '<div class="ev-media"><img src="' + esc(img) + '" alt="' + esc(ev.image_alt || ev.title) + '" loading="lazy"></div>';
    }
    h += '<div class="ev-body">';
    h += '<div class="ev-date" aria-hidden="true"><span class="ev-mon">' + MONTHS[p.mo - 1] + '</span><span class="ev-day">' + p.d + '</span><span class="ev-wd">' + wd + '</span></div>';
    h += '<div class="ev-main">';
    if (ev.audience) h += '<span class="ev-tag">' + esc(ev.audience) + '</span>';
    h += '<h2>' + esc(ev.title) + '</h2>';
    h += '<p class="ev-when">' + when + (time ? " &#183; " + time : "") + '</p>';
    var facts = [];
    if (ev.location) facts.push(esc(ev.location));
    if (ev.price) facts.push(esc(ev.price));
    if (facts.length) h += '<p class="ev-facts">' + facts.join(" &#183; ") + '</p>';
    if (ev.description) h += '<p class="ev-desc">' + esc(ev.description).split("\n").join("<br>") + '</p>';
    if (link) {
      h += '<a class="btn ev-btn" href="' + esc(link) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + '>' + esc(ev.link_label || "Get tickets") + (ext ? " &#8599;" : "") + '</a>';
    }
    h += '</div></div></article>';
    return h;
  }

  function ld(ev, p) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var o = {
      "@type": "Event",
      "name": ev.title,
      "startDate": p.y + "-" + pad(p.mo) + "-" + pad(p.d) + (p.h == null ? "" : "T" + pad(p.h) + ":" + pad(p.mi)),
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "Place", "name": "Den 1880", "address": { "@type": "PostalAddress", "streetAddress": "14 Erb St. West", "addressLocality": "Waterloo", "addressRegion": "ON", "postalCode": "N2L 1S7", "addressCountry": "CA" } },
      "organizer": { "@type": "Organization", "name": "Den 1880", "url": "https://den1880.co/" }
    };
    if (ev.description) o.description = ev.description;
    var img = safeUrl(ev.image);
    if (img) o.image = img.charAt(0) === "/" ? "https://den1880.co" + img : img;
    var link = safeUrl(ev.link);
    if (link) {
      var m = /\$\s*(\d+(?:\.\d{1,2})?)/.exec(ev.price || "");
      o.offers = { "@type": "Offer", "url": link.charAt(0) === "/" ? "https://den1880.co" + link : link, "priceCurrency": "CAD", "availability": "https://schema.org/InStock" };
      if (m) o.offers.price = m[1];
      else if (/free/i.test(ev.price || "")) o.offers.price = "0";
    }
    return o;
  }

  function render(events) {
    var today = todayKey();
    var rows = (events || [])
      .map(function (ev) { return { ev: ev, p: parseStart(ev && ev.start) }; })
      .filter(function (r) { return r.ev && r.ev.title && r.p && dayKey(r.p) >= today; })
      .sort(function (a, b) {
        return (dayKey(a.p) - dayKey(b.p)) || (((a.p.h || 0) * 60 + a.p.mi) - ((b.p.h || 0) * 60 + b.p.mi));
      });
    var empty = document.getElementById("events-empty");
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
    } else {
      list.innerHTML = rows.map(function (r) { return card(r.ev, r.p); }).join("");
      if (empty) empty.hidden = true;
    }
    var s = document.getElementById("events-ld");
    if (s) {
      s.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": rows.map(function (r) { return ld(r.ev, r.p); }) });
    }
  }

  // Expose for the build step and tests; harmless on the live page.
  window.DenUpcoming = { render: render, card: card, ld: ld, parseStart: parseStart };

  fetch("/content/upcoming.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data && Array.isArray(data.events)) render(data.events); })
    .catch(function () { /* keep the events baked into the HTML */ });
})();
