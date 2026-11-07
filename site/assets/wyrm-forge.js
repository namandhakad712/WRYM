/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-forge.js — the Level Forge application
   Paint → Certify (real engine, in a Worker) → Playtest → Export →
   Submit-via-PR. Vanilla JS, zero dependencies.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var E = window.WYRM_ENGINE;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ── element vocabulary (order = palette order) ──────────────────── */
  var ELEMENTS = [
    { ch: "#", name: "soil wall", tip: "bedrock — nothing passes" },
    { ch: ".", name: "tunnel", tip: "carved open floor" },
    { ch: "@", name: "worm head", tip: "exactly one; facing right" },
    { ch: "o", name: "worm body", tip: "contiguous line behind the head" },
    { ch: "*", name: "apple", tip: "eat all of them to unseal the exit" },
    { ch: "X", name: "heart goal", tip: "exactly one; the win tile" },
    { ch: "$", name: "walnut crate", tip: "pushable sokoban-style" },
    { ch: "%", name: "floor button", tip: "weighted by crate / remains / worm" },
    { ch: "D", name: "golden gate", tip: "opens while every button is pressed" },
    { ch: "~", name: "spikes", tip: "instant death, also mid-slide" },
    { ch: "+", name: "soft dirt", tip: "diggable, permanently opens" },
    { ch: "k", name: "key", tip: "pick up by crawling over it" },
    { ch: "L", name: "padlock", tip: "consumes a key, opens forever" },
    { ch: ">", name: "valve right", tip: "one-way: enter moving right only" },
    { ch: "<", name: "valve left", tip: "one-way: enter moving left only" },
    { ch: "^", name: "valve up", tip: "one-way: enter moving up only" },
    { ch: "v", name: "valve down", tip: "one-way: enter moving down only" },
    { ch: "=", name: "crumble bridge", tip: "crosses once, then rubble" },
    { ch: "_", name: "frictionless ice", tip: "enter it and you slide" },
    { ch: "O", name: "egg", tip: "fragile cargo — rests on the cell below; cracks if unsupported" },
  ];

  /* ── state ────────────────────────────────────────────────────────── */
  var S = {
    rows: [],
    w: 11, h: 9,
    brush: "#",
    mode: "edit",           // edit | play
    game: null,             // playtest GameState
    cert: null,             // last certificate
    worker: null, certifying: false,
    tags: {},               // selected submission tags
  };

  function blankRows(w, h) {
    var rows = [];
    for (var y = 0; y < h; y++) {
      var r = "";
      for (var x = 0; x < w; x++) {
        r += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? "#" : ".";
      }
      rows.push(r);
    }
    // a friendly starter: worm + one apple + exit
    rows[2] = setChar(rows[2], 3, "o"); rows[2] = setChar(rows[2], 4, "@");
    rows[4] = setChar(rows[4], 6, "*"); rows[6] = setChar(rows[6], 7, "X");
    return rows;
  }
  function setChar(s, i, c) { return s.slice(0, i) + c + s.slice(i + 1); }

  /* ── contributor card (community-2 submission envelope) ──────────── */
  function contributor() {
    var name = $("#f-cname").value.trim();
    var github = $("#f-cgh").value.trim().replace(/^@/, "");
    var intent = $("#f-cintent").value.trim();
    var tags = Object.keys(S.tags).filter(function (t) { return S.tags[t]; });
    if (!name && !github && !intent) return null;
    var c = {};
    if (name) c.name = name;
    if (github) c.github = github;
    if (intent) c.intent = intent;
    if (tags.length) c.tags = tags;
    c.submittedWith = "level-forge/2";
    return c;
  }

  /* what wyrm-bot will check — rendered as a live checklist */
  function submitReadiness() {
    var pre = precheck({ name: "x", slug: "x", grid: S.rows, turnLimit: 60 });
    var items = [
      {
        ok: !pre,
        label: "level structure valid" + (pre ? " — " + pre.reason : ""),
      },
      {
        ok: !!(S.cert && S.cert.solvable),
        label: (S.cert && S.cert.solvable)
          ? "certified solvable · par " + S.cert.minMoves + " · difficulty " + S.cert.difficulty.toFixed(1) + " (" + S.cert.tier + ")"
          : "not certified yet — press ⚗ certify",
      },
      { ok: !!$("#f-cname").value.trim(), label: "contributor name (credited on the level card)" },
      {
        ok: /^[A-Za-z0-9-]{1,39}$/.test($("#f-cgh").value.trim().replace(/^@/, "")),
        label: "github handle (links your profile on the community board)",
      },
      {
        ok: $("#f-cintent").value.trim().length >= 20,
        label: "design intent ≥ 20 chars (what a maintainer judges beyond the machine checks)",
      },
    ];
    return { items: items, ready: items.every(function (i) { return i.ok; }) };
  }

  function renderChecklist() {
    var host = $("#submit-checklist");
    if (!host) return;
    var r = submitReadiness();
    host.innerHTML =
      '<div class="pb-title" style="margin-top:10px">submission readiness</div>' +
      '<ul class="checklist">' +
      r.items.map(function (i) {
        return '<li class="' + (i.ok ? "ok" : "todo") + '">' + (i.ok ? "✓" : "○") + " " + esc(i.label) + "</li>";
      }).join("") +
      "</ul>";
    $("#btn-pr").classList.toggle("armed", r.ready);
  }

  function levelDoc() {
    var doc = {
      schema: "wyrm.level/community-2",
      name: $("#f-name").value.trim() || "Untitled Wrym",
      slug: ($("#f-slug").value.trim() || "community-level")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      author: $("#f-cname").value.trim() || $("#f-cgh").value.trim().replace(/^@/, "") || undefined,
      grid: S.rows.slice(),
      turnLimit: Math.max(4, Math.min(240, parseInt($("#f-limit").value, 10) || 60)),
    };
    var c = contributor();
    if (c) doc.contributor = c;
    if (S.cert && S.cert.solvable) {
      doc.certified = {
        difficulty: S.cert.difficulty,
        tier: S.cert.tier,
        minMoves: S.cert.minMoves,
        statesExplored: S.cert.statesExplored,
        splitsRequired: !!S.cert.splitsRequired,
        validatedWith: "wyrm-engine " + (E ? E.VERSION : "?"),
      };
    }
    return doc;
  }

  /* ── palette ──────────────────────────────────────────────────────── */
  function buildPalette() {
    var host = $("#palette");
    host.innerHTML = "";
    ELEMENTS.forEach(function (el) {
      var b = document.createElement("button");
      b.className = "swatch" + (el.ch === S.brush ? " sel" : "");
      b.title = el.ch + " · " + el.name + " — " + el.tip;
      b.setAttribute("aria-label", el.name);
      var c = document.createElement("canvas");
      c.width = 44; c.height = 44;
      try { WyrmRender.spriteIcon(c, el.ch, 44, { theme: "moss" }); } catch (e) { /* noop */ }
      b.appendChild(c);
      var lbl = document.createElement("span");
      lbl.className = "swatch-lbl";
      lbl.textContent = el.name;
      b.appendChild(lbl);
      b.addEventListener("click", function () {
        S.brush = el.ch;
        host.querySelectorAll(".swatch").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
      });
      host.appendChild(b);
    });
  }

  /* ── editor canvas ────────────────────────────────────────────────── */
  function gridToSt(rows) {
    var h = rows.length, w = rows[0] ? rows[0].length : 0;
    var t = [], a = [], c = [], k = [], m = [];
    for (var y = 0; y < h; y++) {
      var row = "";
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (ch === "*") { a.push({ x: x, y: y }); row += "."; }
        else if (ch === "$") { c.push({ x: x, y: y }); row += "."; }
        else if (ch === "k") { k.push({ x: x, y: y }); row += "."; }
        else if (ch === "@") { m.unshift({ x: x, y: y }); row += "."; }
        else if (ch === "o") { m.push({ x: x, y: y }); row += "."; }
        else { row += (ch || "."); }
      }
      t.push(row);
    }
    return { w: w, h: h, t: t, a: a, c: c, k: k, m: m, r: [], slug: $("#f-slug").value || "forge" };
  }

  function drawEditor() {
    WyrmRender.draw($("#editor"), gridToSt(S.rows), { cell: 40, t: 0 });
  }

  function canvasCell(canvas, ev) {
    // → {x, y, cell, pad} or null
    var rect = canvas.getBoundingClientRect();
    var st = gridToSt(S.rows);
    var cell = 40, pad = Math.round(cell * 0.55);
    var w = st.w * cell + pad * 2, h = st.h * cell + pad * 2;
    var scale = rect.width / w;
    var px = (ev.clientX - rect.left) / scale - pad;
    var py = (ev.clientY - rect.top) / scale - pad;
    var x = Math.floor(px / cell), y = Math.floor(py / cell);
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return null;
    return { x: x, y: y };
  }

  function paint(ev, erase) {
    var p = canvasCell($("#editor"), ev);
    if (!p) return;
    var ch = erase ? "." : S.brush;
    if (S.rows[p.y][p.x] === ch) return;
    // enforce singleton rules interactively
    if (ch === "@" || ch === "X") {
      S.rows = S.rows.map(function (r) { return r.split("").map(function (c) { return c === ch ? "." : c; }).join(""); });
    }
    S.rows[p.y] = setChar(S.rows[p.y], p.x, ch);
    invalidate();
    drawEditor();
  }

  /* ── certify (worker) ─────────────────────────────────────────────── */
  function ensureWorker(cb) {
    if (S.worker) return cb(S.worker);
    fetch("./assets/wyrm-engine.js")
      .then(function (r) { return r.text(); })
      .then(function (src) {
        var glue =
          "self.onmessage = function (e) {" +
          "  var t0 = Date.now();" +
          "  try {" +
          "    var r = self.WYRM_ENGINE.validateLevel(e.data.level);" +
          "    r.ms = Date.now() - t0;" +
          "    self.postMessage({ ok: true, report: r });" +
          "  } catch (err) {" +
          "    self.postMessage({ ok: false, error: String(err && err.message || err) });" +
          "  }" +
          "};";
        var blob = new Blob([src, "\n", glue], { type: "text/javascript" });
        var wk = new Worker(URL.createObjectURL(blob));
        S.worker = wk;
        cb(wk);
      });
  }

  function certify() {
    if (S.certifying) return;
    var doc = levelDoc();
    var level = { name: doc.name, slug: doc.slug, grid: doc.grid, turnLimit: doc.turnLimit };
    // cheap pre-checks for instant feedback
    var pre = precheck(level);
    if (pre) { showCert(pre); return; }
    S.certifying = true;
    $("#cert-head").textContent = "— exhaustive search running…";
    $("#cert-panel").classList.remove("hidden");
    $("#cert-body").innerHTML =
      '<p class="hint">The validator is exploring the full game graph — this can take ' +
      'a few seconds (or longer for big open levels). Nothing leaves your browser.</p>';
    ensureWorker(function (wk) {
      wk.onmessage = function (e) {
        S.certifying = false;
        var d = e.data;
        if (!d.ok) { showCert({ solvable: false, reason: "engine error: " + d.error }); return; }
        S.cert = d.report;
        showCert({ report: d.report });
      };
      wk.postMessage({ level: level });
    });
  }

  function precheck(level) {
    var rows = level.grid;
    if (!rows.length) return { solvable: false, reason: "empty level" };
    var w = rows[0].length;
    if (rows.some(function (r) { return r.length !== w; }))
      return { solvable: false, reason: "ragged rows — every row must be the same width" };
    var flat = rows.join("");
    if ((flat.match(/@/g) || []).length !== 1)
      return { solvable: false, reason: "exactly one worm head @ is required" };
    if ((flat.match(/X/g) || []).length !== 1)
      return { solvable: false, reason: "exactly one heart goal X is required" };
    if (flat.indexOf("o") < 0) { /* 1-segment worm is legal */ }
    var bad = flat.match(/[^#.@o*$%DX~+kL<>=^v_]/);
    if (bad) return { solvable: false, reason: "unknown character '" + bad[0] + "'" };
    return null;
  }

  var DIM_LABELS = {
    depth: "depth — how far the winning plan stretches",
    search: "search — combinatorial width of the space",
    irreversibility: "irreversibility — permanent acts on the line",
    simulation: "simulation — forced ice glides to trace",
    threat: "threat — legal moves that would kill you",
    choreography: "choreography — sub-goal ordering load",
    budget: "budget — turn-limit pressure",
  };

  function showCert(o) {
    $("#cert-panel").classList.remove("hidden");
    var box = $("#cert-body"), head = $("#cert-head");
    if (o.reason) {
      head.textContent = "NOT CERTIFIABLE";
      box.innerHTML = '<p class="verdict bad">✗ ' + esc(o.reason) + "</p>";
      return;
    }
    var r = o.report;
    if (!r.solvable) {
      head.textContent = "no solution exists";
      box.innerHTML =
        '<p class="verdict bad">✗ ' + esc(r.reason || "unsolvable") + "</p>" +
        "<p class=\"hint\">States explored before giving up: <b>" +
        Number(r.statesExplored).toLocaleString() + "</b>. Every apple must be " +
        "reachable and the exit enterable — check one-way valves and burned bridges.</p>";
      return;
    }
    head.textContent = "certified · " + (r.ms / 1000).toFixed(1) + "s of search";
    var dims = r.dims || {};
    var bars = Object.keys(DIM_LABELS).map(function (k) {
      var v = Math.round(dims[k] || 0);
      return '<div class="dimbar"><span class="dimbar-lbl">' + esc(k) +
        '</span><span class="dimbar-track"><i style="width:' + v + '%"></i></span><b>' + v + "</b></div>";
    }).join("");
    var ev = r.evidence || {};
    box.innerHTML =
      '<div class="cert-top"><span class="cert-score">' + r.difficulty.toFixed(1) +
      '</span><span class="tierchip tier-' + String(r.tier).toLowerCase() + '">' + esc(r.tier) +
      "</span></div>" +
      '<table class="ledger cert-ledger"><tbody>' +
      "<tr><td>optimal line (par)</td><td class='num'>" + r.minMoves + " moves / " + levelDoc().turnLimit + " limit</td></tr>" +
      "<tr><td>states explored</td><td class='num'>" + Number(r.statesExplored).toLocaleString() + "</td></tr>" +
      "<tr><td>split required</td><td class='num'>" + (r.splitsRequired ? "yes — flesh must be paid" : "no") + "</td></tr>" +
      "<tr><td>digs · pushes · unlocks</td><td class='num'>" + (ev.digs || 0) + " · " + (ev.pushes || 0) + " · " + (ev.unlocks || 0) + "</td></tr>" +
      "<tr><td>slides · bridge burns · splits</td><td class='num'>" + (ev.slides || 0) + " · " + (ev.bridgesBurned || 0) + " · " + (ev.splits || 0) + "</td></tr>" +
      "</tbody></table>" +
      '<div class="dims">' + bars + "</div>";
    $("#pr-hint").innerHTML = S.cert && S.cert.solvable
      ? "Certificate embedded — ready to submit."
      : "Certify first — the submission embeds the difficulty certificate.";
    renderChecklist();
  }

  /* ── playtest ─────────────────────────────────────────────────────── */
  function enterPlay() {
    var doc = levelDoc();
    var pre = precheck({ grid: doc.grid });
    if (pre) { alert(pre.reason); return; }
    try {
      S.game = E.createGame({ name: doc.name, slug: doc.slug, grid: doc.grid, turnLimit: doc.turnLimit });
    } catch (err) { alert("cannot start: " + err.message); return; }
    S.mode = "play";
    $("#play-panel").classList.remove("hidden");
    $("#forge-readout").textContent = "playtest — arrows to move · X to split";
    renderPlay();
  }
  function enterEdit() {
    S.mode = "edit"; S.game = null;
    $("#play-panel").classList.add("hidden");
    $("#forge-readout").textContent = "edit mode";
    drawEditor();
  }
  function renderPlay() {
    var g = S.game; if (!g) return;
    var st = JSON.parse(E.serializeState(g));
    st.slug = $("#f-slug").value || "forge";
    WyrmRender.draw($("#editor"), st, { cell: 40, t: performance.now() });
    var st2 = g.status === "playing" ? "turn " + g.turn + " / " + g.turnLimit :
      (g.status === "won" ? "WON in " + g.turn + " moves ♥" :
       g.status === "dead" ? "DEAD — spiked" : "exhausted — out of turns");
    $("#play-status").textContent = st2 + " · length " + g.worm.length +
      " · apples left " + g.apples.length + (g.keysHeld ? " · keys " + g.keysHeld : "");
    var evs = (g.lastEvents || []).map(function (e) {
      return '<span class="ev ev-' + esc(e.type) + '">' + esc(e.type) + "</span>";
    }).join("");
    $("#play-events").innerHTML = evs || '<span class="ev ev-move">—</span>';
    if (g.status !== "playing") requestAnimationFrame(renderPlay);
  }
  function act(a) {
    var g = S.game; if (!g || g.status !== "playing") return;
    var r = E.step(g, a);
    if (r.valid) { S.game = r.state; renderPlay(); }
    else { $("#play-events").innerHTML = '<span class="ev ev-bump">✗ ' + esc(r.reason || "blocked") + "</span>"; }
  }

  /* ── export / submit ──────────────────────────────────────────────── */
  function refreshOutputs() {
    var doc = levelDoc();
    $("#grid-text").textContent = doc.grid.join("\n");
    $("#json-view").textContent = JSON.stringify(doc, null, 2);
  }
  function download() {
    var doc = levelDoc();
    var blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = doc.slug + ".json";
    a.click();
  }
  function copy() {
    var doc = JSON.stringify(levelDoc(), null, 2);
    (navigator.clipboard ? navigator.clipboard.writeText(doc) : Promise.reject())
      .then(function () { $("#btn-copy").textContent = "✓ copied"; setTimeout(function () { $("#btn-copy").textContent = "⧉ copy json"; }, 1400); })
      .catch(function () { $("#json-view").scrollIntoView(); });
  }
  function submitPR() {
    var doc = levelDoc();
    var pre = precheck({ grid: doc.grid });
    if (pre) { alert("Fix the level first: " + pre.reason); return; }
    var r = submitReadiness();
    if (!r.ready) {
      var missing = r.items.filter(function (i) { return !i.ok; }).map(function (i) { return "· " + i.label; });
      if (!confirm("The submission card is incomplete — wyrm-bot will return the PR until this is fixed:\n\n" + missing.join("\n") + "\n\nSubmit anyway?"))
        return;
    }
    var fn = (doc.slug || "community-level") + ".json";
    var prBody =
      "### Community level submission\n\n" +
      "- **level**: " + doc.name + " (`" + doc.slug + "`)\n" +
      "- **contributor**: " + (doc.contributor && doc.contributor.name ? doc.contributor.name : "anonymous") +
      (doc.contributor && doc.contributor.github ? " ([@" + doc.contributor.github + "](https://github.com/" + doc.contributor.github + "))" : "") + "\n" +
      "- **intent**: " + (doc.contributor && doc.contributor.intent ? doc.contributor.intent : "—") + "\n" +
      "- **certificate**: " + (doc.certified
        ? "par " + doc.certified.minMoves + " · difficulty " + doc.certified.difficulty.toFixed(1) + " (" + doc.certified.tier + ") — certified in the Level Forge with the real engine"
        : "none (wyrm-bot will certify on arrival)") + "\n\n" +
      "wyrm-bot will post the full deterministic review card below. A maintainer approves with `/wyrm approve` or returns it with `/wyrm request-changes <reason>`.";
    // GitHub's zero-backend flow: new-file editor with the JSON pre-filled,
    // then the PR description from the clipboard (the editor cannot prefill it).
    if (navigator.clipboard) {
      navigator.clipboard.writeText(prBody).catch(function () {});
    }
    var url = "https://github.com/namandhakad712/WRYM/new/main/community-levels" +
      "?filename=" + encodeURIComponent(fn) +
      "&value=" + encodeURIComponent(JSON.stringify(doc, null, 2) + "\n");
    window.open(url, "_blank", "noopener");
    var hint = $("#pr-hint");
    if (hint) {
      hint.innerHTML = "✔ PR file opened in GitHub. <b>One more click:</b> paste the PR description (just copied to your clipboard — ⌘/Ctrl-V) into the PR body so maintainers see your intent, then hit <i>Propose new file</i>. wyrm-bot takes over from there.";
    }
  }

  /* ── wiring ───────────────────────────────────────────────────────── */
  function invalidate() { S.cert = null; refreshOutputs(); renderChecklist(); }

  function resize(w, h) {
    w = Math.max(6, Math.min(22, w || S.w));
    h = Math.max(6, Math.min(18, h || S.h));
    var rows = [];
    for (var y = 0; y < h; y++) {
      var cur = S.rows[y] || "";
      var r = (cur + Array(w + 1).join(".")).slice(0, w);
      rows.push(r);
    }
    S.rows = rows; S.w = w; S.h = h;
    invalidate(); drawEditor();
  }

  window.WyrmForge = function () {
    S.rows = blankRows(11, 9);
    buildPalette();
    drawEditor();
    refreshOutputs();
    renderChecklist();

    // presets
    var sel = $("#f-preset");
    (E && E.LEVELS || []).forEach(function (l) {
      var o = document.createElement("option");
      o.value = l.slug; o.textContent = l.slug + " — " + l.name;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      var l = (E.LEVELS || []).find(function (x) { return x.slug === sel.value; });
      if (!l) return;
      S.rows = l.grid.slice(); S.w = l.grid[0].length; S.h = l.grid.length;
      $("#f-name").value = l.name + " (remix)";
      $("#f-slug").value = l.slug + "-remix";
      $("#f-limit").value = l.turnLimit || 60;
      $("#f-w").value = S.w; $("#f-h").value = S.h;
      invalidate(); drawEditor();
    });

    // painting
    var painting = false, erasing = false;
    var cv = $("#editor");
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    cv.addEventListener("mousedown", function (e) {
      if (S.mode !== "edit") return;
      painting = true; erasing = (e.button === 2);
      paint(e, erasing);
    });
    window.addEventListener("mouseup", function () { painting = false; });
    cv.addEventListener("mousemove", function (e) {
      if (S.mode === "edit" && painting) paint(e, erasing);
    });

    // card fields
    ["f-name", "f-slug", "f-cname", "f-cgh", "f-cintent"].forEach(function (id) {
      $("#" + id).addEventListener("input", function () { refreshOutputs(); renderChecklist(); });
    });
    // submission tags
    document.querySelectorAll("#f-ctags .tagbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-tag");
        S.tags[t] = !S.tags[t];
        b.classList.toggle("sel", !!S.tags[t]);
        refreshOutputs();
      });
    });
    $("#f-limit").addEventListener("change", invalidate);
    $("#f-w").addEventListener("change", function () { resize(parseInt(this.value, 10), S.h); });
    $("#f-h").addEventListener("change", function () { resize(S.w, parseInt(this.value, 10)); });
    $("#btn-frame").addEventListener("click", function () {
      S.rows = S.rows.map(function (r, y) {
        return r.split("").map(function (c, x) {
          return (x === 0 || y === 0 || x === S.w - 1 || y === S.h - 1) ? "#" : c;
        }).join("");
      });
      invalidate(); drawEditor();
    });
    $("#btn-clear").addEventListener("click", function () {
      S.rows = blankRows(S.w, S.h); invalidate(); drawEditor();
    });

    // certify / modes
    $("#btn-certify").addEventListener("click", certify);
    $("#btn-play").addEventListener("click", enterPlay);
    $("#btn-edit").addEventListener("click", enterEdit);
    $("#pk-up").addEventListener("click", function () { act("up"); });
    $("#pk-down").addEventListener("click", function () { act("down"); });
    $("#pk-left").addEventListener("click", function () { act("left"); });
    $("#pk-right").addEventListener("click", function () { act("right"); });
    $("#pk-split").addEventListener("click", function () { act("split"); });
    $("#pk-reset").addEventListener("click", enterPlay);

    window.addEventListener("keydown", function (e) {
      if (S.mode !== "play") return;
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      var map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right",
        x: "split", X: "split",
      };
      if (map[e.key]) { e.preventDefault(); act(map[e.key]); }
    });

    // export
    $("#btn-download").addEventListener("click", download);
    $("#btn-copy").addEventListener("click", copy);
    $("#btn-pr").addEventListener("click", submitPR);
  };
})();
