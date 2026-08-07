/* Den 1880 -- shared content loader for the /admin text editor.
 * Include with a single <script src="/assets/js/cms-loader.js"></script>
 * near the bottom of any page's <body>. No other markup is needed beyond
 * data-cms="field_name" attributes on the elements that should be editable.
 *
 * On load, works out which content/<slug>.json belongs to the current page
 * from the URL path, fetches it, and drops each field's text into the
 * matching [data-cms] element. If the fetch fails for any reason (offline,
 * file missing, JSON malformed) it fails silently and the page just shows
 * whatever text is already sitting in the HTML -- nothing can go blank.
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
    })
    .catch(function () {
      /* fetch failed offline/blocked -- HTML's own text stands as-is */
    });
})();
