/* ═══════════════════════════════════════════════════════════════════
   WRYM · collapsible burger sidebar (site-wide navigation)
   ───────────────────────────────────────────────────────────────────
   The masthead nav got long — nine destinations don't fit a top bar
   without horizontal scrolling. This script folds every page's
   existing <nav> into a fixed left drawer behind a burger button:
   same links, same active state, one consistent component.

   How it works:
   · on load, reads <header class="masthead"> nav links verbatim
   · removes the top nav, injects burger + drawer + backdrop
   · drawer auto-groups links with inline SVG icons (no icon fonts,
     no external requests — crisp at every DPI)
   · state persisted in localStorage; `[` toggles; ESC / backdrop close
   · fully keyboard accessible (real <button>, aria-expanded, focus
     returns to the burger on close)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ICONS = {
    leaderboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h3V10H4v10zm6.5 0h3V4h-3v16zM17 20h3v-7h-3v7z"/></svg>',
    levels: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5zm0 8.2L5.7 8.1 4 8.9l8 4 8-4-1.7-.8L12 10.2zm0 5L5.7 12.1 4 12.9l8 4 8-4-1.7-.8L12 15.2z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6h3V4h-3v2zM7 6h3V4H7v2zM7 18h3v-2H7v2zM3 8h2v8H3V8zm16 0h2v8h-2V8zM11 6h2V5h1v14h-2v1h3V4h-3v2h-1zm-6 5h2v2H5v-2zm12 0h2v2h-2v-2zM11 11h2v2h-2v-2z"/></svg>',
    forge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
    community: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    providers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>',
    method: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
    paper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 18H6V4h12v16h-6z"/><path d="M8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>',
    repository: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>'
  };

  function iconFor(href, label) {
    var k = (label || "").toLowerCase();
    if (/play/.test(k)) return ICONS.play;
    if (/leaderboard|board/.test(k)) return ICONS.leaderboard;
    if (/level/.test(k)) return ICONS.levels;
    if (/forge|editor/.test(k)) return ICONS.forge;
    if (/community/.test(k)) return ICONS.community;
    if (/provider/.test(k)) return ICONS.providers;
    if (/method/.test(k)) return ICONS.method;
    if (/paper/.test(k)) return ICONS.paper;
    if (/github|repository|repo/.test(k) || /github/.test(href)) return ICONS.repository;
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>';
  }

  function init() {
    var mast = document.querySelector("header.masthead");
    if (!mast) return;
    var nav = mast.querySelector("nav");
    if (!nav) return;
    var links = [];
    nav.querySelectorAll("a").forEach(function (a) {
      links.push({ href: a.getAttribute("href"), label: (a.textContent || "").trim(), active: a.classList.contains("active") });
    });
    if (!links.length) return;

    nav.remove();

    /* ── burger button ─────────────────────────────────────────────── */
    var burger = document.createElement("button");
    burger.className = "nav-burger";
    burger.setAttribute("aria-label", "open navigation");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-controls", "nav-drawer");
    burger.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path class="burger-p1" d="M3 6h18v2.4H3z"/>' +
      '<path class="burger-p2" d="M3 10.8h18v2.4H3z"/>' +
      '<path class="burger-p3" d="M3 15.6h18V18H3z"/>' +
      "</svg>";
    document.body.appendChild(burger);

    /* ── backdrop ──────────────────────────────────────────────────── */
    var backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    document.body.appendChild(backdrop);

    /* ── drawer ────────────────────────────────────────────────────── */
    var drawer = document.createElement("aside");
    drawer.className = "nav-drawer";
    drawer.id = "nav-drawer";
    drawer.setAttribute("aria-hidden", "true");
    var html = '<div class="nd-brand">' +
      '<div class="sigil">W</div>' +
      '<div><strong>WRYM</strong><span>the worm arena</span></div>' +
      "</div>" +
      '<nav class="nd-links">';
    links.forEach(function (l) {
      var external = /^https?:/.test(l.href || "") ? ' target="_blank" rel="noopener"' : "";
      html +=
        '<a href="' + l.href + '"' + external + (l.active ? ' class="active"' : "") + ">" +
        '<span class="nd-ic">' + iconFor(l.href, l.label) + "</span>" +
        "<span>" + l.label + "</span>" +
        (l.active ? '<span class="nd-here">here</span>' : "") +
        "</a>";
    });
    html += "</nav>";
    html +=
      '<div class="nd-foot">' +
      '<span class="nd-ver">engine <span id="nd-version">—</span></span>' +
      '<a href="https://github.com/namandhakad712/WRYM" target="_blank" rel="noopener">' + ICONS.repository + "github</a>" +
      "</div>";
    drawer.innerHTML = html;
    document.body.appendChild(drawer);

    /* engine version badge, if the engine is loaded on this page */
    if (window.WYRM_ENGINE && drawer.querySelector("#nd-version")) {
      drawer.querySelector("#nd-version").textContent = "v" + window.WYRM_ENGINE.VERSION;
    }

    var open = false;
    function setOpen(v) {
      open = v;
      drawer.classList.toggle("open", open);
      backdrop.classList.toggle("open", open);
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      document.body.classList.toggle("nav-open", open);
      try { localStorage.setItem("wyrm.nav.pinned", open ? "1" : "0"); } catch (e) {}
    }
    burger.addEventListener("click", function () { setOpen(!open); });
    backdrop.addEventListener("click", function () { setOpen(false); });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) { setOpen(false); burger.focus(); }
      else if (e.key === "[" && !/input|select|textarea/i.test((e.target && e.target.tagName) || "")) setOpen(!open);
    });

    /* restore pinned state on wide screens (mobile always starts closed) */
    try {
      if (window.matchMedia("(min-width: 900px)").matches && localStorage.getItem("wyrm.nav.pinned") === "1") setOpen(true);
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
