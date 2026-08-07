/* Den 1880 -- shared content loader for the /admin text editor.
 * Include with a single <script src="/assets/js/cms-loader.js"></script>
 * near the bottom of any page's <body>. No other markup is needed beyond
 * data-cms="field_name" attributes on the elements that should be editable.
 *
 * On load, works out which content/<slug>.json belongs to the current page
 * from the URL path, fetches it, and drops each field's value into the
 * matching element. If the fetch fails for any reason (offline, file
 * missing, JSON malformed) it fails silently and the page just shows
 * whatever is already sitting in the HTML -- nothing can go blank.
 *
 * Three field types:
 *   data-cms="field_name"          -- plain text, sets .textContent
 *   data-cms-src="field_name"      -- an <img> (or other src-bearing tag),
 *                                      sets .src. Used for content photos
 *                                      uploaded through the Assets picker.
 *   data-cms-vimeo-id="field_name" -- a Vimeo background-embed <iframe>.
 *                                      Value must be digits only; swaps just
 *                                      the numeric video ID inside the
 *                                      existing src, so the page's own
 *                                      autoplay/loop/mute query params are
 *                                      never touched or guessed at.
 *
 * Slug rule (must match how pages are named under content/):
 *   "/"                          -> "homepage"
 *   "/memberships" or ".../.html"-> "memberships"
 *   "/corporate/" or "/corporate"-> "corporate"        (folder index)
 *   "/corporate/team-office(.html)" -> "corporate-team-office"
 */
(function () {
  function pageSlug() {
    var p = window.location.pathname.replace(/^\/+|\/+$/g, "");
    if (p === "") return "homepage";
    if (p.toLowerCase().endsWith(".html")) p = p.slice(0, -5);
    if (p.toLowerCase().endsWith("/index")) p = p.slice(0, -6);
    return p.replace(/\//g, "-");
  }

  var slug = pageSlug();

  fetch("/content/" + slug + ".json", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (!data) return;

      document.querySelectorAll("[data-cms]").forEach(function (el) {
        var val = data[el.getAttribute("data-cms")];
        if (typeof val === "string" && val.trim() !== "") {
          el.textContent = val;
        }
      });

      document.querySelectorAll("[data-cms-src]").forEach(function (el) {
        var val = data[el.getAttribute("data-cms-src")];
        if (typeof val === "string" && val.trim() !== "") {
          el.src = val;
        }
      });

      document.querySelectorAll("[data-cms-vimeo-id]").forEach(function (el) {
        var val = data[el.getAttribute("data-cms-vimeo-id")];
        if (typeof val === "string" && /^\d+$/.test(val.trim())) {
          el.src = el.src.replace(/\/video\/\d+/, "/video/" + val.trim());
        }
      });
    })
    .catch(function () {
      /* fetch failed offline/blocked -- HTML's own content stands as-is */
    });
})();
