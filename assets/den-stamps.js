/* ==========================================================================
   Den 1880 stamp layer (den-stamps.js)
   Renders passport-stamp clusters over page sections from a plain config
   object, lets you toggle any cluster or stamp on and off, and ships a
   drag-to-place editor you turn on with ?stamps=edit.

   Load order:
     <link rel="stylesheet" href="/assets/den-stamps.css">
     <script src="/assets/den-stamps-config.js"></script>   <!-- sets window.DEN_STAMPS -->
     <script src="/assets/den-stamps.js" defer></script>

   URL switches:
     ?stamps=off          hide every stamp (screenshot a clean page)
     ?stamps=on           force on, ignore any saved toggles
     ?stamps=solo:hero    show only the cluster with id "hero"
     ?stamps=edit         drag editor + live lint + Export

   Console API: DenStamps.list() .on(id) .off(id) .toggle(id) .lint() .export()
   ========================================================================== */

(function (window, document) {
  'use strict';

  /* ---------- The 14 official colours ---------------------------------- */

  var PALETTE = {
    Green: '#16331A', White: '#FFFFFF', Beige: '#EFD3AE', Gold: '#C3996B',
    Black: '#1B1C1C', Orange: '#DF5526', Mustard: '#D3A92A', Purple: '#652D90',
    Blue: '#062241', Teal: '#00927C', Red: '#BB3F30', Lime: '#8BC53F',
    Brown: '#68391F', Neon: '#EDFF00'
  };

  var COLOR_NAMES = Object.keys(PALETTE);

  /* Marks that are allowed to be stamps, with true aspect ratio (w/h) so a
     width in vw always yields the right height. kind drives the grammar:
       line   thin outline, carries almost no ink, can go giant and loud
       solid  filled letterform, counts as ink
       badge  filled circle or multi-colour star, the cluster's anchor
     Families NOT here (full lockup, DEN, 1880) are identity marks, not stamps. */
  var MARKS = {
    'lion-outline': { ratio: 1, kind: 'line', colored: true,
      file: function (c) { return 'DEN1880_Logo_Lion_Outline_' + c + '.svg'; } },
    '88-oval': { ratio: 381.09 / 577.16, kind: 'line', colored: true,
      file: function (c) { return 'DEN1880_Logo_88_Oval_' + c + '.svg'; } },
    '88-icon': { ratio: 231.45 / 205.42, kind: 'solid', colored: true,
      file: function (c) { return 'DEN1880_Logo_88_' + c + '.svg'; } },
    'combo-circle': { ratio: 1, kind: 'badge', colored: false,
      file: function (c, n) { return 'DEN1880_Logo_Lion_Combo' + n + '_Circle.svg'; } },
    'combo-star': { ratio: 1, kind: 'badge', colored: false,
      file: function (c, n) { return 'DEN1880_Logo_Lion_Combo' + n + '.svg'; } }
  };

  /* Ground colour of each shipped combo badge, so we can warn when a badge
     disappears into the field behind it. */
  var COMBO_GROUND = {
    1: 'Beige', 2: 'Purple', 3: 'Mustard', 4: 'Orange', 5: 'Mustard', 6: 'Orange',
    7: 'Blue', 8: 'Red', 9: 'Brown', 10: 'Purple', 11: 'Mustard', 12: 'Beige'
  };

  /* Watermark mode: loud field -> the official colour a tone-on-tone stamp
     takes on it. Never invents a shade; always lands inside the 14. */
  var WATERMARK_PAIRS = {
    Orange: 'Brown', Mustard: 'Brown', Purple: 'Blue', Neon: 'Lime',
    Green: 'Black', Blue: 'Black', Red: 'Brown', Teal: 'Green',
    Lime: 'Green', Brown: 'Black', Gold: 'Brown', Beige: 'Gold',
    Black: 'Green', White: 'Beige'
  };

  var LIGHT_GROUNDS = ['White', 'Beige', 'Cream', 'Gold', 'Photo'];

  var STORE_KEY = 'den-stamps:overrides';
  var DEFAULTS = {
    assetBase: '/assets/stamps/',
    z: 2,
    mobileBreakpoint: 768,
    mobile: { maxStamps: 2, scale: 0.62, hide: 'auto' }
  };

  /* ---------- Small helpers ------------------------------------------- */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function round(n, p) { var f = Math.pow(10, p || 2); return Math.round(n * f) / f; }

  function param() {
    var m = /[?&]stamps=([^&]*)/.exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function readOverrides() {
    try { return JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function writeOverrides(o) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(o)); }
    catch (e) { /* private mode, so toggles just won't persist */ }
  }

  /* ---------- State ---------------------------------------------------- */

  var cfg = null;          // normalised config
  var mode = param();      // '', 'off', 'on', 'edit', 'solo:<id>'
  var overrides = {};      // { "clusterId": false, "clusterId/2": false }
  var nodes = {};          // clusterId -> { cluster, el, stamps:[{stamp, el}] }
  var editor = null;

  /* ---------- Normalise ------------------------------------------------ */

  function normalise(raw) {
    var out = {
      assetBase: raw.assetBase || DEFAULTS.assetBase,
      z: isNum(raw.z) ? raw.z : DEFAULTS.z,
      mobileBreakpoint: isNum(raw.mobileBreakpoint) ? raw.mobileBreakpoint : DEFAULTS.mobileBreakpoint,
      mobile: Object.assign({}, DEFAULTS.mobile, raw.mobile || {}),
      clusters: []
    };
    if (out.assetBase.slice(-1) !== '/') out.assetBase += '/';

    (raw.clusters || []).forEach(function (c, ci) {
      var cluster = {
        id: c.id || ('cluster-' + (ci + 1)),
        anchor: c.anchor,
        on: c.on !== false,
        ground: c.ground || 'White',
        watermark: c.watermark === true,
        crop: c.crop === true || c.watermark === true,
        z: isNum(c.z) ? c.z : (c.watermark ? 0 : out.z),
        opacity: isNum(c.opacity) ? c.opacity : (c.watermark ? 0.15 : 1),
        mobile: Object.assign({}, out.mobile, c.mobile || {}),
        note: c.note || '',
        stamps: []
      };
      (c.stamps || []).forEach(function (s, si) {
        cluster.stamps.push({
          i: si,
          mark: s.mark,
          combo: isNum(s.combo) ? s.combo : null,
          color: s.color || null,
          w: isNum(s.w) ? s.w : 12,
          wUnit: s.wUnit || 'vw',
          x: isNum(s.x) ? s.x : 50,
          y: isNum(s.y) ? s.y : 50,
          rot: isNum(s.rot) ? s.rot : 0,
          on: s.on !== false,
          mobileHide: s.mobileHide === true,
          mobileX: isNum(s.mobileX) ? s.mobileX : null,
          mobileY: isNum(s.mobileY) ? s.mobileY : null,
          mobileW: isNum(s.mobileW) ? s.mobileW : null
        });
      });
      out.clusters.push(cluster);
    });
    return out;
  }

  /* ---------- Resolve one stamp to a URL ------------------------------- */

  function srcFor(stamp) {
    var m = MARKS[stamp.mark];
    if (!m) return null;
    var color = stamp.color;
    if (m.colored && (!color || !PALETTE[color])) color = 'Black';
    var n = stamp.combo;
    if (!m.colored && (!isNum(n) || n < 1 || n > 12)) n = 1;
    return cfg.assetBase + m.file(color, n);
  }

  function effectiveMobileWidth(cluster, s) {
    var w = s.mobileW !== null ? s.mobileW : s.w * cluster.mobile.scale;
    return s.wUnit === 'vw' ? w : w * 0.5;   // rough parity for % and px units
  }

  function ratioFor(stamp) {
    var m = MARKS[stamp.mark];
    return m ? m.ratio : 1;
  }

  /* ---------- Toggle state -------------------------------------------- */

  function key(clusterId, i) { return i == null ? clusterId : clusterId + '/' + i; }

  function isOn(cluster, stamp) {
    if (mode === 'off') return false;
    if (mode.indexOf('solo:') === 0 && cluster.id !== mode.slice(5)) return false;

    var ck = key(cluster.id);
    var clusterOn = (mode === 'on') ? true
      : (ck in overrides ? overrides[ck] : cluster.on);
    if (!clusterOn) return false;
    if (!stamp) return true;

    var sk = key(cluster.id, stamp.i);
    return (mode === 'on') ? true : (sk in overrides ? overrides[sk] : stamp.on);
  }

  /* ---------- Render --------------------------------------------------- */

  function isMobile() {
    return window.innerWidth < cfg.mobileBreakpoint;
  }

  function build() {
    Object.keys(nodes).forEach(function (id) {
      var n = nodes[id];
      if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
    });
    nodes = {};

    cfg.clusters.forEach(function (cluster) {
      var anchor = cluster.anchor ? document.querySelector(cluster.anchor) : null;
      if (!anchor) {
        if (mode === 'edit') {
          console.warn('[DenStamps] cluster "' + cluster.id + '": no element matches ' + cluster.anchor);
        }
        return;
      }
      anchor.classList.add('den-stamp-anchor');

      var el = document.createElement('div');
      el.className = 'den-stamp-cluster';
      el.setAttribute('data-den-cluster', cluster.id);
      el.setAttribute('data-crop', cluster.crop ? 'true' : 'false');
      el.setAttribute('aria-hidden', 'true');
      el.style.zIndex = String(cluster.z);
      if (cluster.opacity !== 1) el.style.opacity = String(cluster.opacity);

      var record = { cluster: cluster, el: el, anchor: anchor, stamps: [] };

      cluster.stamps.forEach(function (stamp) {
        var img = document.createElement('img');
        img.className = 'den-stamp';
        img.setAttribute('data-den-stamp', cluster.id + '/' + stamp.i);
        img.setAttribute('alt', '');
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        /* Not loading="lazy": these are 2-6KB SVGs and lazy-loading them means a
           below-fold cluster pops in mid-scroll, and does not render at all in a
           full-page screenshot. fetchpriority keeps them off the critical path. */
        img.setAttribute('fetchpriority', 'low');
        img.decoding = 'async';
        record.stamps.push({ stamp: stamp, el: img });
        el.appendChild(img);
      });

      anchor.appendChild(el);
      nodes[cluster.id] = record;
    });

    paint();
  }

  function paint() {
    var mob = isMobile();

    Object.keys(nodes).forEach(function (id) {
      var rec = nodes[id];
      var cluster = rec.cluster;
      var clusterVisible = isOn(cluster, null);

      /* Mobile policy. 'auto' is the default: a phone-width section has no empty
         half, so a decorative edge cluster lands on the copy. Hide those, keep
         watermarks (they sit behind text and full-bleed, which still works), and
         keep any cluster whose stamps carry mobileX/mobileY placements. */
      if (mob) {
        var placed = cluster.stamps.some(function (s) {
          return s.mobileX !== null || s.mobileY !== null;
        });
        var hide = cluster.mobile.hide;
        if (hide === 'auto') hide = !cluster.watermark && !placed;
        if (hide) clusterVisible = false;
      }
      rec.el.hidden = !clusterVisible && mode !== 'edit';
      rec.el.style.zIndex = String(cluster.z);

      /* On small screens keep only the biggest N stamps. A three-stamp cluster
         crowds a phone. Rank by the width each stamp will actually have on
         mobile (mobileW wins over w), and never spend the budget on a stamp
         already excluded by mobileHide. */
      var keepSet;
      if (mob) {
        var candidates = rec.stamps.filter(function (r) { return !r.stamp.mobileHide; });
        candidates.sort(function (a, b) {
          return effectiveMobileWidth(cluster, b.stamp) - effectiveMobileWidth(cluster, a.stamp);
        });
        keepSet = candidates.slice(0, Math.max(1, cluster.mobile.maxStamps))
                            .map(function (r) { return r.stamp.i; });
      } else {
        keepSet = rec.stamps.map(function (r) { return r.stamp.i; });
      }

      rec.stamps.forEach(function (r) {
        var s = r.stamp;
        var visible = clusterVisible && isOn(cluster, s);
        if (mob && (s.mobileHide || keepSet.indexOf(s.i) === -1)) visible = false;

        var wanted = srcFor(s);
        if (wanted && r.el.getAttribute('src') !== wanted) r.el.setAttribute('src', wanted);

        var w, px, py;
        if (mob) {
          w = s.mobileW !== null ? s.mobileW : s.w * cluster.mobile.scale;
          px = s.mobileX !== null ? s.mobileX : s.x;
          py = s.mobileY !== null ? s.mobileY : s.y;
        } else {
          w = s.w; px = s.x; py = s.y;
        }
        r.el.style.width = w + (s.wUnit === 'px' ? 'px' : s.wUnit === '%' ? '%' : 'vw');
        r.el.style.aspectRatio = String(ratioFor(s));
        r.el.style.left = px + '%';
        r.el.style.top = py + '%';
        r.el.style.transform = 'translate(-50%, -50%) rotate(' + s.rot + 'deg)';

        if (mode === 'edit') {
          r.el.hidden = false;
          r.el.setAttribute('data-off', visible ? 'false' : 'true');
        } else {
          r.el.hidden = !visible;
          r.el.removeAttribute('data-off');
        }
      });
    });

    if (editor) editor.refresh();
  }

  /* ---------- Lint ----------------------------------------------------- */

  /* Scores a cluster against the Den stamp-cluster grammar. Returns a list of
     { level: 'pass'|'flag'|'fail', msg }. Same rules the Python linter uses. */
  function lintCluster(cluster) {
    var out = [];
    var live = cluster.stamps.filter(function (s) { return isOn(cluster, s); });
    var n = live.length;

    if (n < 2) out.push({ level: 'fail', msg: 'only ' + n + ' stamp on: clusters are 2 or 3, never one' });
    else if (n > 3) out.push({ level: 'fail', msg: n + ' stamps on: 3 is the ceiling' });
    else out.push({ level: 'pass', msg: n + ' stamps' });

    var inked = live.filter(function (s) {
      var m = MARKS[s.mark];
      return m && m.kind !== 'line';
    });
    if (inked.length === 0) out.push({ level: 'fail', msg: 'no filled anchor. Exactly one stamp must be a combo badge or solid mark' });
    else if (inked.length > 1) out.push({ level: 'fail', msg: inked.length + ' filled stamps. Only one may carry ink' });
    else out.push({ level: 'pass', msg: 'one filled anchor (' + inked[0].mark + ')' });

    var flat = live.filter(function (s) { return Math.abs(s.rot) < 8; });
    if (flat.length) out.push({ level: 'fail', msg: flat.length + ' stamp(s) sitting square: tilt every one 10–25°' });
    var steep = live.filter(function (s) { return Math.abs(s.rot) > 28; });
    if (steep.length) out.push({ level: 'flag', msg: steep.length + ' stamp(s) tilted past 28°. Reads as a mistake, not a stamp' });

    var byX = live.slice().sort(function (a, b) { return a.x - b.x; });
    var sameLean = 0;
    for (var i = 1; i < byX.length; i++) {
      if (byX[i].rot * byX[i - 1].rot > 0) sameLean++;
    }
    if (sameLean) out.push({ level: 'flag', msg: 'neighbours leaning the same way. Alternate the tilt direction' });

    var ws = live.map(function (s) { return s.w; }).sort(function (a, b) { return b - a; });
    if (ws.length >= 2) {
      var r1 = ws[1] / ws[0];
      if (r1 > 0.8) out.push({ level: 'flag', msg: 'echo stamp is ' + Math.round(r1 * 100) + '% of the shout. Step it down to ~65%' });
      if (ws.length === 3) {
        var r2 = ws[2] / ws[1];
        if (r2 > 0.75) out.push({ level: 'flag', msg: 'dot stamp is ' + Math.round(r2 * 100) + '% of the echo. Step it down to ~50%' });
      }
    }

    var giant = ws[0] || 0;
    if (!cluster.watermark && giant < 13) out.push({ level: 'flag', msg: 'biggest stamp is only ' + giant + 'vw. The shout wants 15-22vw' });
    if (!cluster.watermark && giant > 28) out.push({ level: 'flag', msg: 'biggest stamp is ' + giant + 'vw. Past a quarter of the page it stops reading as a stamp' });

    var crosses = live.some(function (s) {
      var halfY = (s.w / ratioFor(s)) / 2;
      return s.x - s.w / 2 < 2 || s.x + s.w / 2 > 98 || s.y - halfY < 2 || s.y + halfY > 98;
    });
    if (!crosses) out.push({ level: 'flag', msg: 'cluster sits fully inside the section: push one stamp across an edge' });

    var overlap = false;
    for (var a = 0; a < live.length && !overlap; a++) {
      for (var b = a + 1; b < live.length; b++) {
        var dx = Math.abs(live[a].x - live[b].x);
        var dy = Math.abs(live[a].y - live[b].y);
        if (dx < (live[a].w + live[b].w) / 2 && dy < 40) { overlap = true; break; }
      }
    }
    /* Watermarks are exempt: giant marks cropped at opposite band edges are the
       point there, and forcing them to touch would make one mud. */
    if (!overlap && live.length >= 2 && !cluster.watermark) {
      out.push({ level: 'flag', msg: 'no two stamps overlap. Let them touch' });
    }

    var lightGround = LIGHT_GROUNDS.indexOf(cluster.ground) !== -1;
    var colors = live.filter(function (s) { return MARKS[s.mark] && MARKS[s.mark].colored; })
                     .map(function (s) { return s.color; });
    var bad = colors.filter(function (c) { return !PALETTE[c]; });
    if (bad.length) out.push({ level: 'fail', msg: 'off-palette colour: ' + bad.join(', ') });

    if (cluster.watermark) {
      var want = WATERMARK_PAIRS[cluster.ground];
      var wrong = colors.filter(function (c) { return c !== want; });
      if (want && wrong.length) {
        out.push({ level: 'flag', msg: 'watermark on ' + cluster.ground + ' wants every stamp in ' + want + '. Found ' + wrong.join(', ') });
      }
      if (!cluster.crop) out.push({ level: 'flag', msg: 'watermark cluster should be cropped by the band edges (crop: true)' });
    } else if (lightGround) {
      var dupes = colors.filter(function (c, i) { return colors.indexOf(c) !== i; });
      if (dupes.length) out.push({ level: 'flag', msg: 'repeat colour on a light ground: ' + dupes.join(', ') + '. Give each stamp its own accent' });
    }

    live.forEach(function (s) {
      if (s.mark.indexOf('combo') === 0 && COMBO_GROUND[s.combo] === cluster.ground) {
        out.push({ level: 'flag', msg: 'Combo' + s.combo + ' badge ground is ' + cluster.ground + ', the same as the field, so the badge will vanish' });
      }
    });

    return out;
  }

  function lintAll() {
    var report = { clusters: {}, page: [] };
    var liveClusters = cfg.clusters.filter(function (c) { return isOn(c, null); });
    cfg.clusters.forEach(function (c) {
      /* A cluster you deliberately switched off isn't broken. Don't score it. */
      report.clusters[c.id] = isOn(c, null)
        ? lintCluster(c)
        : [{ level: 'pass', msg: 'off' }];
    });

    if (liveClusters.length > 5) {
      report.page.push({ level: 'flag', msg: liveClusters.length + ' clusters on the page, 2 to 4 is the rhythm' });
    }
    var seen = {};
    liveClusters.forEach(function (c) {
      if (seen[c.anchor]) report.page.push({ level: 'fail', msg: 'two clusters share anchor ' + c.anchor + '. One per section' });
      seen[c.anchor] = true;
    });
    return report;
  }

  function printLint() {
    var r = lintAll();
    Object.keys(r.clusters).forEach(function (id) {
      var items = r.clusters[id];
      var worst = items.some(function (i) { return i.level === 'fail'; }) ? 'FAIL'
        : items.some(function (i) { return i.level === 'flag'; }) ? 'FLAG' : 'PASS';
      console.log('%c' + worst + '  ' + id,
        'font-weight:bold;color:' + (worst === 'FAIL' ? '#c00' : worst === 'FLAG' ? '#b58900' : '#2a8'));
      items.forEach(function (i) { if (i.level !== 'pass') console.log('   ' + i.level + ': ' + i.msg); });
    });
    r.page.forEach(function (i) { console.log('PAGE  ' + i.level + ': ' + i.msg); });
    return r;
  }

  /* ---------- Export --------------------------------------------------- */

  function exportConfig() {
    var out = {
      assetBase: cfg.assetBase,
      mobileBreakpoint: cfg.mobileBreakpoint,
      clusters: cfg.clusters.map(function (c) {
        var o = {
          id: c.id,
          anchor: c.anchor,
          on: isOn(c, null) || (key(c.id) in overrides ? overrides[key(c.id)] : c.on),
          ground: c.ground
        };
        if (c.watermark) o.watermark = true;
        if (c.crop && !c.watermark) o.crop = true;
        if (c.opacity !== 1 && !c.watermark) o.opacity = c.opacity;
        if (c.z !== cfg.z && !c.watermark) o.z = c.z;
        if (c.note) o.note = c.note;
        o.stamps = c.stamps.map(function (s) {
          var t = { mark: s.mark };
          if (s.combo != null) t.combo = s.combo;
          if (s.color) t.color = s.color;
          t.w = round(s.w, 2);
          if (s.wUnit !== 'vw') t.wUnit = s.wUnit;
          t.x = round(s.x, 2);
          t.y = round(s.y, 2);
          t.rot = round(s.rot, 1);
          var sk = key(c.id, s.i);
          var on = sk in overrides ? overrides[sk] : s.on;
          if (!on) t.on = false;
          if (s.mobileHide) t.mobileHide = true;
          if (s.mobileX !== null) t.mobileX = round(s.mobileX, 2);
          if (s.mobileY !== null) t.mobileY = round(s.mobileY, 2);
          if (s.mobileW !== null) t.mobileW = round(s.mobileW, 2);
          return t;
        });
        return o;
      })
    };
    return 'window.DEN_STAMPS = ' + JSON.stringify(out, null, 2) + ';\n';
  }

  /* ---------- Editor --------------------------------------------------- */

  function buildEditor() {
    document.documentElement.classList.add('den-stamps-editing');

    var panel = document.createElement('div');
    panel.className = 'den-ed';
    panel.innerHTML =
      '<div class="den-ed__bar">' +
        '<span class="den-ed__title">Den stamps</span>' +
        '<button class="den-ed__btn den-ed__btn--ghost" data-act="collapse">–</button>' +
      '</div>' +
      '<div class="den-ed__body">' +
        '<h4>Clusters &amp; stamps</h4><div data-list></div>' +
        '<h4>Selected stamp</h4><div data-inspector></div>' +
        '<h4>Grammar check</h4><div class="den-ed__lint" data-lint></div>' +
        '<div class="den-ed__btns">' +
          '<button class="den-ed__btn" data-act="export">Export config</button>' +
          '<button class="den-ed__btn den-ed__btn--ghost" data-act="reset">Clear my toggles</button>' +
        '</div>' +
        '<textarea class="den-ed__out" data-out readonly placeholder="Export writes the config here and copies it to your clipboard."></textarea>' +
        '<p class="den-ed__hint">Drag a stamp to move it. <kbd>arrows</kbd> nudge, ' +
        '<kbd>[</kbd><kbd>]</kbd> rotate, <kbd>-</kbd><kbd>=</kbd> resize, ' +
        '<kbd>x</kbd> toggles it, <kbd>esc</kbd> deselects. Hold <kbd>shift</kbd> for big steps.</p>' +
      '</div>';
    document.body.appendChild(panel);

    var listEl = panel.querySelector('[data-list]');
    var inspEl = panel.querySelector('[data-inspector]');
    var lintEl = panel.querySelector('[data-lint]');
    var outEl = panel.querySelector('[data-out]');
    var selected = null;   // { clusterId, i }

    /* --- panel drag --- */
    (function () {
      var bar = panel.querySelector('.den-ed__bar');
      var dragging = false, ox = 0, oy = 0;
      bar.addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        var r = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top = (e.clientY - oy) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      });
      window.addEventListener('mouseup', function () { dragging = false; });
    })();

    panel.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'collapse') {
        var c = panel.getAttribute('data-collapsed') === 'true';
        panel.setAttribute('data-collapsed', c ? 'false' : 'true');
        e.target.textContent = c ? '–' : '+';
      } else if (act === 'export') {
        var txt = exportConfig();
        outEl.value = txt;
        outEl.select();
        if (window.navigator.clipboard) {
          window.navigator.clipboard.writeText(txt).catch(function () {});
        }
        console.log(txt);
      } else if (act === 'reset') {
        overrides = {};
        writeOverrides(overrides);
        paint();
      }
    });

    function find(clusterId, i) {
      var rec = nodes[clusterId];
      if (!rec) return null;
      for (var k = 0; k < rec.stamps.length; k++) {
        if (rec.stamps[k].stamp.i === i) return { rec: rec, entry: rec.stamps[k] };
      }
      return null;
    }

    function select(clusterId, i) {
      selected = (clusterId == null) ? null : { clusterId: clusterId, i: i };
      Object.keys(nodes).forEach(function (id) {
        nodes[id].stamps.forEach(function (r) {
          var on = selected && id === selected.clusterId && r.stamp.i === selected.i;
          r.el.setAttribute('data-selected', on ? 'true' : 'false');
        });
      });
      renderList();
      renderInspector();
    }

    function renderList() {
      var html = '';
      cfg.clusters.forEach(function (c) {
        var missing = !nodes[c.id];
        var cOn = key(c.id) in overrides ? overrides[key(c.id)] : c.on;
        html += '<div class="den-ed__row">' +
          '<input type="checkbox" data-toggle-cluster="' + c.id + '"' + (cOn ? ' checked' : '') + '>' +
          '<label>' + c.id + (missing ? ' (anchor not found)' : '') + '</label></div>';
        c.stamps.forEach(function (s) {
          var sk = key(c.id, s.i);
          var sOn = sk in overrides ? overrides[sk] : s.on;
          var sel = selected && selected.clusterId === c.id && selected.i === s.i;
          var label = s.mark + (s.combo != null ? ' ' + s.combo : '') + (s.color ? ' · ' + s.color : '') +
            ' · ' + round(s.w, 1) + 'vw';
          html += '<div class="den-ed__row den-ed__row--stamp" data-selected="' + (sel ? 'true' : 'false') + '">' +
            '<input type="checkbox" data-toggle-stamp="' + sk + '"' + (sOn ? ' checked' : '') + '>' +
            '<button class="den-ed__pick" data-pick="' + sk + '">' + label + '</button></div>';
        });
      });
      listEl.innerHTML = html;
    }

    function renderInspector() {
      if (!selected) { inspEl.innerHTML = '<p style="color:#8b8c88;margin:0">Click a stamp on the page.</p>'; return; }
      var hit = find(selected.clusterId, selected.i);
      if (!hit) { inspEl.innerHTML = ''; return; }
      var s = hit.entry.stamp;
      var markOpts = Object.keys(MARKS).map(function (m) {
        return '<option value="' + m + '"' + (m === s.mark ? ' selected' : '') + '>' + m + '</option>';
      }).join('');
      var colorOpts = COLOR_NAMES.map(function (c) {
        return '<option value="' + c + '"' + (c === s.color ? ' selected' : '') + '>' + c + '</option>';
      }).join('');
      var comboOpts = '';
      for (var n = 1; n <= 12; n++) {
        comboOpts += '<option value="' + n + '"' + (n === s.combo ? ' selected' : '') + '>Combo' + n +
          ' (' + COMBO_GROUND[n] + ' ground)</option>';
      }
      var isCombo = s.mark.indexOf('combo') === 0;
      inspEl.innerHTML =
        '<select data-field="mark">' + markOpts + '</select>' +
        (isCombo ? '<select data-field="combo">' + comboOpts + '</select>'
                 : '<select data-field="color">' + colorOpts + '</select>') +
        '<div class="den-ed__grid" style="margin-top:6px">' +
          '<span>x %</span><input type="number" step="0.5" data-field="x" value="' + round(s.x, 2) + '">' +
          '<span>y %</span><input type="number" step="0.5" data-field="y" value="' + round(s.y, 2) + '">' +
          '<span>w vw</span><input type="number" step="0.5" data-field="w" value="' + round(s.w, 2) + '">' +
          '<span>rot °</span><input type="number" step="1" data-field="rot" value="' + round(s.rot, 1) + '">' +
        '</div>';
    }

    function renderLint() {
      var r = lintAll();
      var html = '';
      Object.keys(r.clusters).forEach(function (id) {
        var items = r.clusters[id].filter(function (i) { return i.level !== 'pass'; });
        if (!items.length) { html += '<p data-level="pass">' + id + '. Clean</p>'; return; }
        items.forEach(function (i) {
          html += '<p data-level="' + i.level + '">' + id + ': ' + i.msg + '</p>';
        });
      });
      r.page.forEach(function (i) { html += '<p data-level="' + i.level + '">page: ' + i.msg + '</p>'; });
      lintEl.innerHTML = html;
    }

    listEl.addEventListener('change', function (e) {
      var cid = e.target.getAttribute('data-toggle-cluster');
      var sid = e.target.getAttribute('data-toggle-stamp');
      if (cid) { overrides[key(cid)] = e.target.checked; writeOverrides(overrides); paint(); }
      if (sid) { overrides[sid] = e.target.checked; writeOverrides(overrides); paint(); }
    });

    listEl.addEventListener('click', function (e) {
      var pick = e.target.getAttribute && e.target.getAttribute('data-pick');
      if (!pick) return;
      var parts = pick.split('/');
      select(parts[0], parseInt(parts[1], 10));
    });

    inspEl.addEventListener('input', function (e) {
      if (!selected) return;
      var f = e.target.getAttribute('data-field');
      if (!f) return;
      var hit = find(selected.clusterId, selected.i);
      if (!hit) return;
      var s = hit.entry.stamp;
      if (f === 'mark') {
        s.mark = e.target.value;
        var m = MARKS[s.mark];
        if (m.colored && !s.color) s.color = 'Black';
        if (!m.colored && s.combo == null) s.combo = 1;
        renderInspector();
      } else if (f === 'color') { s.color = e.target.value; }
      else if (f === 'combo') { s.combo = parseInt(e.target.value, 10); }
      else { s[f] = parseFloat(e.target.value) || 0; }
      paint();
    });

    /* --- drag a stamp on the page --- */
    var drag = null;
    document.addEventListener('mousedown', function (e) {
      var el = e.target.closest && e.target.closest('.den-stamp');
      if (!el) return;
      var id = el.getAttribute('data-den-stamp').split('/');
      select(id[0], parseInt(id[1], 10));
      var hit = find(id[0], parseInt(id[1], 10));
      if (!hit) return;
      var box = hit.rec.el.getBoundingClientRect();
      drag = {
        hit: hit, box: box,
        startX: e.clientX, startY: e.clientY,
        ox: hit.entry.stamp.x, oy: hit.entry.stamp.y
      };
      e.preventDefault();
    }, true);

    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var s = drag.hit.entry.stamp;
      s.x = drag.ox + ((e.clientX - drag.startX) / drag.box.width) * 100;
      s.y = drag.oy + ((e.clientY - drag.startY) / drag.box.height) * 100;
      if (e.shiftKey) { s.x = Math.round(s.x); s.y = Math.round(s.y); }
      paint();
    });

    window.addEventListener('mouseup', function () {
      if (drag) { drag = null; renderInspector(); renderList(); }
    });

    window.addEventListener('keydown', function (e) {
      if (!selected) return;
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      var hit = find(selected.clusterId, selected.i);
      if (!hit) return;
      var s = hit.entry.stamp;
      var big = e.shiftKey;
      var step = big ? 2 : 0.25;
      var handled = true;
      switch (e.key) {
        case 'ArrowLeft':  s.x -= step; break;
        case 'ArrowRight': s.x += step; break;
        case 'ArrowUp':    s.y -= step; break;
        case 'ArrowDown':  s.y += step; break;
        case '[':          s.rot -= big ? 5 : 1; break;
        case ']':          s.rot += big ? 5 : 1; break;
        case '-':          s.w = Math.max(1, s.w - (big ? 2 : 0.5)); break;
        case '=': case '+': s.w += big ? 2 : 0.5; break;
        case 'x': case 'X': {
          var sk = key(selected.clusterId, selected.i);
          var cur = sk in overrides ? overrides[sk] : s.on;
          overrides[sk] = !cur;
          writeOverrides(overrides);
          break;
        }
        case 'Escape': select(null); return;
        default: handled = false;
      }
      if (!handled) return;
      e.preventDefault();
      paint();
      renderInspector();
      renderList();
    });

    select(null);
    renderLint();

    return {
      refresh: function () { renderList(); renderLint(); }
    };
  }

  /* ---------- Boot ----------------------------------------------------- */

  function init(raw) {
    var source = raw || window.DEN_STAMPS;
    if (!source) {
      console.warn('[DenStamps] no config found: set window.DEN_STAMPS before loading den-stamps.js');
      return;
    }
    cfg = normalise(source);
    overrides = (mode === 'on' || mode === 'off') ? {} : readOverrides();
    build();
    if (mode === 'edit' && !editor) editor = buildEditor();

    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(paint, 120);
    });
  }

  /* ---------- Public API ----------------------------------------------- */

  var API = {
    init: init,
    config: function () { return cfg ? clone(cfg) : null; },

    list: function () {
      if (!cfg) return [];
      return cfg.clusters.map(function (c) {
        return {
          cluster: c.id,
          anchor: c.anchor,
          rendered: !!nodes[c.id],
          on: isOn(c, null),
          stamps: c.stamps.map(function (s) {
            return { i: s.i, mark: s.mark + (s.combo != null ? s.combo : ''), color: s.color,
                     w: s.w, x: s.x, y: s.y, rot: s.rot, on: isOn(c, s) };
          })
        };
      });
    },

    /* id forms: "hero" (whole cluster) or "hero/1" (one stamp) */
    on: function (id) { overrides[id] = true; writeOverrides(overrides); paint(); return API; },
    off: function (id) { overrides[id] = false; writeOverrides(overrides); paint(); return API; },
    toggle: function (id) {
      var cur = id in overrides ? overrides[id] : null;
      if (cur === null) {
        var parts = id.split('/');
        var c = cfg.clusters.filter(function (x) { return x.id === parts[0]; })[0];
        if (!c) return API;
        cur = parts.length > 1 ? (c.stamps[parts[1]] || {}).on !== false : c.on;
      }
      overrides[id] = !cur;
      writeOverrides(overrides);
      paint();
      return API;
    },
    reset: function () { overrides = {}; writeOverrides(overrides); paint(); return API; },
    repaint: paint,
    rebuild: build,
    lint: printLint,
    export: function () { var t = exportConfig(); console.log(t); return t; },
    palette: PALETTE,
    marks: MARKS,
    comboGrounds: COMBO_GROUND,
    watermarkPairs: WATERMARK_PAIRS
  };

  window.DenStamps = API;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

})(window, document);
