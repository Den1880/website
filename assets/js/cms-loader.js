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
 * Five field types:
 *   data-cms="field_name"          -- plain text, sets .textContent. Only use
 *                                      on an element with NO nested tags --
 *                                      textContent would silently strip them.
 *   data-cms-src="field_name"      -- an <img> (or other src-bearing tag),
 *                                      sets .src. Used for content photos
 *                                      uploaded through the Assets picker.
 *   data-cms-vimeo-id="field_name" -- a Vimeo background-embed <iframe>.
 *                                      Value must be digits only; swaps just
 *                                      the numeric video ID inside the
 *                                      existing src, so the page's own
 *                                      autoplay/loop/mute query params are
 *                                      never touched or guessed at.
 *   data-cms-md="field_name"       -- a headline (or similar) that needs an
 *                                      inline emphasis/highlight word or a
 *                                      line break -- exactly the case
 *                                      data-cms can't handle safely. Renders
 *                                      a constrained markdown-lite syntax to
 *                                      .innerHTML instead of plain text:
 *                                        *word*   -> <em>word</em>
 *                                        **word** -> <span class="ACCENT">word</span>
 *                                        \n       -> <br> (a literal newline
 *                                                     typed in the CMS's
 *                                                     multi-line text field)
 *                                      Raw text is HTML-escaped (&, <, >)
 *                                      before those substitutions run, so
 *                                      nothing else the editor types can
 *                                      inject markup. ACCENT defaults to
 *                                      "purple" (the site's gold/mustard
 *                                      highlight class) -- override per
 *                                      element with data-cms-md-accent="...".
 *                                      Give an inserted <br> a class (e.g.
 *                                      the homepage's responsive "dbrk"
 *                                      break) with data-cms-md-br-class="...".
 *   data-cms-bg="field_name"       -- a full-bleed hero photo painted with
 *                                      CSS `background`, not an <img> tag
 *                                      (page-hero/hero/contact-hero sections
 *                                      that layer a gradient scrim over a
 *                                      photo). Sets a `--cms-bg` custom
 *                                      property on the element to a
 *                                      `url("...")`; every such section's
 *                                      CSS reads its photo layer through
 *                                      `var(--cms-bg, url('/original.jpg'))`,
 *                                      so leaving the field untouched keeps
 *                                      the original photo (and, on pages with
 *                                      separate desktop/mobile crops, both
 *                                      breakpoints render identically to
 *                                      today). Uploading a replacement here
 *                                      swaps it at every breakpoint at once --
 *                                      there is only one field, not a
 *                                      desktop/mobile pair.
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

  function renderRichText(raw, accentClass, brClass) {
    var out = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    out = out.replace(/\*\*(.+?)\*\*/g, function (m, inner) {
      return '<span class="' + accentClass + '">' + inner + "</span>";
    });
    out = out.replace(/\*(.+?)\*/g, function (m, inner) {
      return "<em>" + inner + "</em>";
    });
    var brTag = brClass ? '<br class="' + brClass + '">' : "<br>";
    return out.split("\n").join(brTag);
  }

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

      document.querySelectorAll("[data-cms-md]").forEach(function (el) {
        var val = data[el.getAttribute("data-cms-md")];
        if (typeof val === "string" && val.trim() !== "") {
          var accentClass = el.getAttribute("data-cms-md-accent") || "purple";
          var brClass = el.getAttribute("data-cms-md-br-class") || "";
          el.innerHTML = renderRichText(val, accentClass, brClass);
        }
      });

      document.querySelectorAll("[data-cms-bg]").forEach(function (el) {
        var val = data[el.getAttribute("data-cms-bg")];
        if (typeof val === "string" && val.trim() !== "") {
          el.style.setProperty(
            "--cms-bg",
            'url("' + val.trim().replace(/"/g, '\\"') + '")'
          );
        }
      });
    })
    .catch(function () {
      /* fetch failed offline/blocked -- HTML's own content stands as-is */
    });
})();
