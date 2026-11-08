/* ═══════════════════════════════════════════════════════════════════
   WRYM · Human Arena — play the benchmark yourself
   ───────────────────────────────────────────────────────────────────
   The same certified engine the models play (site/assets/wyrm-engine.js,
   the exact bundle CI certifies the ladder with), the same renderer,
   the same levels. What the arena adds for humans:

   · every move logged (action · engine events · wall-clock ms)
   · localStorage checkpoint per level — close the tab, resume later
   · attempts (retries) and deaths counted, exactly like model runs
   · export the full run as JSON (schema wyrm.humanrun/1)
   · on victory: scored against the leaderboard — solver optimum,
     every model that has a run on this level, Elo included
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var E = window.WYRM_ENGINE;
  var LS = {
    run: function (slug) { return "wyrm.humanrun." + slug; },
    best: function (slug) { return "wyrm.humanbest." + slug; },
    career: "wyrm.human.career.v1"
  };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var S = {
    levels: [],           // levels.json
    models: [],           // models.json (enabled)
    board: null,          // index.json leaderboard
    level: null,          // current level object
    game: null,           // engine GameState
    run: null,            // { slug, startedAt, attempts, deaths, moves[], state, status }
    t0: 0,                // attempt start ms
    raf: 0
  };

  /* ── data load ──────────────────────────────────────────────────── */
  function fetchJSON(p) { return fetch(p).then(function (r) { return r.ok ? r.json() : null; }); }

  Promise.all([
    fetchJSON("./data/levels.json"),
    fetchJSON("./data/models.json"),
    fetchJSON("./data/index.json")
  ]).then(function (res) {
    S.levels = res[0] || [];
    S.models = (res[1] || []).filter(function (m) { return m.enabled !== false; });
    S.board = res[2] || { leaderboard: [] };
    renderPicker();
    var deep = location.hash.match(/#play=([A-Za-z0-9-]+)/);
    if (deep) { var l = S.levels.find(function (x) { return x.slug === deep[1]; }); if (l) return enterLevel(l); }
  });

  /* ── career (localStorage) ──────────────────────────────────────── */
  function career() {
    try { return JSON.parse(localStorage.getItem(LS.career) || "{}"); } catch (e) { return {}; }
  }
  function saveCareer(c) { try { localStorage.setItem(LS.career, JSON.stringify(c)); } catch (e) {} }
  function careerAdd(level, moves, attempts, deaths) {
    var c = career();
    c.solved = (c.solved || 0) + 1;
    c.slugs = c.slugs || {};
    var prev = c.slugs[level.slug];
    var best = prev && prev.best ? Math.min(prev.best, moves) : moves;
    c.slugs[level.slug] = { best: best, attempts: (prev ? prev.attempts : 0) + attempts, deaths: (prev ? prev.deaths : 0) + deaths };
    saveCareer(c);
  }

  /* ── level picker ───────────────────────────────────────────────── */
  function tierColor(tier) {
    var map = {
      TUTORIAL: "rgba(126,196,106,.16)|rgba(126,196,106,.5)|#a8d98f",
      II: "rgba(155,212,239,.14)|rgba(155,212,239,.45)|#9bd4ef",
      III: "rgba(255,207,51,.14)|rgba(255,207,51,.45)|#ffcf33",
      IV: "rgba(255,145,120,.14)|rgba(255,145,120,.45)|#ff9178",
      V: "rgba(255,112,144,.16)|rgba(255,112,144,.5)|#ff7090",
      VI: "rgba(201,81,103,.18)|rgba(201,81,103,.55)|#e88ca0"
    };
    var k = (tier || "").toUpperCase();
    for (var key in map) if (k.indexOf(key) === 0 || k === key) return map[key].split("|");
    return map.III.split("|");
  }

  function renderPicker() {
    var c = career();
    var solved = c.solved || 0;
    $("#career-chip").innerHTML =
      "<b>" + solved + "</b> / " + S.levels.length + " solved" +
      '<span class="sep">·</span> attempts are unlimited, but <b>retries &amp; deaths</b> show in your export' +
      '<span class="sep">·</span> beat the <b>solver optimum</b> for a perfect run';

    var byTier = {};
    S.levels.forEach(function (l) {
      (byTier[l.tier] = byTier[l.tier] || []).push(l);
    });
    var html = "";
    Object.keys(byTier).forEach(function (tier) {
      var cols = tierColor(tier);
      var blurb = (E && E.TIER_BLURB && E.TIER_BLURB[tier]) || "";
      html += '<div class="tier-band" id="tier-' + esc(tier) + '">' +
        '<h3 style="color:' + cols[2] + '">' + esc(tier) + "</h3>" +
        (blurb ? '<span class="tier-note">' + esc(blurb) + "</span>" : "") +
        "</div>";
      html += '<div class="pick-grid">';
      byTier[tier].forEach(function (l) {
        var you = c.slugs && c.slugs[l.slug];
        var inprog = null;
        try { var r = JSON.parse(localStorage.getItem(LS.run(l.slug)) || "null"); if (r && r.status === "playing" && r.moves && r.moves.length) inprog = r; } catch (e) {}
        var elems = [];
        if (l.counts) {
          if (l.counts.eggs) elems.push("🥚" + l.counts.eggs + " egg" + (l.counts.eggs > 1 ? "s" : ""));
          if (l.counts.crates) elems.push("▦ " + l.counts.crates);
          if (l.counts.plates) elems.push("% " + l.counts.plates);
          if (l.counts.keys) elems.push("🔑 " + l.counts.keys);
          if (l.counts.valves) elems.push("⇄ " + l.counts.valves);
          if (l.counts.bridges) elems.push("≋ " + l.counts.bridges);
          if (l.counts.ice) elems.push("❄ " + l.counts.ice);
          if (l.counts.apples) elems.push("♥ " + l.counts.apples);
        }
        var dmax = 100;
        html += '<button class="pick-card" data-slug="' + esc(l.slug) + '">' +
          '<div class="pc-top"><span class="pc-name">' + esc(l.name) + "</span>" +
          '<span class="pc-opt">opt <b>' + (l.minMoves != null ? l.minMoves : "?") + "</b> moves</span></div>" +
          '<div class="pc-bar"><i style="width:' + Math.min(100, Math.round(((l.difficulty || 0) / dmax) * 100)) + '%"></i></div>' +
          '<div class="pc-elems">' + elems.map(function (e) { return "<i>" + esc(e) + "</i>"; }).join("") + "</div>" +
          '<div class="pc-you"><span class="' + (you ? "done" : inprog ? "" : "") + '">' +
          (you ? "✓ solved · best " + you.best + " moves" : inprog ? "▶ in progress · turn " + inprog.moves.length + " · resume" : "not attempted") +
          "</span><span>idx " + (l.difficulty != null ? l.difficulty.toFixed(1) : "?") + "</span></div>" +
          "</button>";
      });
      html += "</div>";
    });
    $("#tier-list").innerHTML = html;
    $("#tier-list").querySelectorAll(".pick-card").forEach(function (b) {
      b.addEventListener("click", function () {
        var l = S.levels.find(function (x) { return x.slug === b.getAttribute("data-slug"); });
        if (l) enterLevel(l);
      });
    });
  }

  /* ── enter / resume a level ─────────────────────────────────────── */
  function enterLevel(l) {
    S.level = l;
    location.hash = "play=" + l.slug;
    $("#picker").style.display = "none";
    $("#arena").style.display = "";
    $("#arena-title").textContent = l.name;
    $("#arena-sub").textContent = "tier " + l.tier + " · optimum " + l.minMoves + " moves · turn limit " + l.turnLimit;
    document.title = l.name + " · WRYM Human Arena";

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS.run(l.slug)) || "null"); } catch (e) {}
    var banner = $("#resume-banner");
    if (saved && saved.status === "playing" && saved.moves && saved.moves.length) {
      banner.style.display = "";
      banner.innerHTML = "<b>checkpoint found</b> — attempt " + (saved.attempts || 1) +
        ", turn " + (saved.moves.length) + "/" + l.turnLimit +
        '<button id="btn-resume">▶ resume</button>' +
        '<button id="btn-fresh">↺ start fresh</button>';
      $("#btn-resume").addEventListener("click", function () { banner.style.display = "none"; resumeRun(saved); });
      $("#btn-fresh").addEventListener("click", function () { banner.style.display = "none"; localStorage.removeItem(LS.run(l.slug)); newAttempt(1, 0); });
    } else {
      banner.style.display = "none";
      newAttempt(1, 0);
    }
    renderLegend();
  }

  function newAttempt(attempts, deaths) {
    S.game = E.createGame({ name: S.level.name, slug: S.level.slug, grid: S.level.grid, turnLimit: S.level.turnLimit });
    S.run = {
      schema: "wyrm.humanrun/1",
      slug: S.level.slug,
      level: S.level.name,
      tier: S.level.tier,
      engineVersion: E.VERSION,
      startedAt: new Date().toISOString(),
      attempts: attempts, deaths: deaths,
      moves: [],
      status: "playing"
    };
    S.t0 = performance.now();
    persist();
    drawAll();
    $("#steplog").innerHTML = "";
    logLine(0, "start", "attempt " + attempts + " begins");
  }

  function resumeRun(saved) {
    S.run = saved;
    var g = null;
    try { g = E.deserializeState(saved.state); } catch (e) {}
    if (!g) { newAttempt(saved.attempts || 1, saved.deaths || 0); return; }
    S.game = g;
    S.t0 = performance.now() - ((saved.elapsedMs) || 0);
    drawAll();
    $("#steplog").innerHTML = "";
    S.run.moves.forEach(function (m, i) { logLine(i + 1, m.action, (m.events || []).join(" ")); });
    logLine(S.run.moves.length, "resume", "checkpoint restored");
    if (S.game.status !== "playing") finish();
  }

  function persist() {
    if (!S.run) return;
    S.run.state = E.serializeState(S.game);
    S.run.elapsedMs = Math.round(performance.now() - S.t0);
    try { localStorage.setItem(LS.run(S.level.slug), JSON.stringify(S.run)); } catch (e) {}
  }

  /* ── rendering ──────────────────────────────────────────────────── */
  function stateForRender() {
    var st = JSON.parse(E.serializeState(S.game));
    st.slug = S.level.slug;
    return st;
  }
  function drawAll() {
    if (!S.game) return;
    var st = stateForRender();
    var grid = S.level.grid, h = grid.length, w = grid[0].length;
    var wrap = document.querySelector(".play-canvas-wrap");
    var maxW = Math.max(220, Math.min(760, wrap.clientWidth - 36));
    var cell = Math.max(16, Math.min(44, Math.floor(maxW / w)));
    var cv = $("#play-stage");
    WyrmRender.draw(cv, st, { cell: cell, t: performance.now() });
    cancelAnimationFrame(S.raf);
    (function loop() { S.raf = requestAnimationFrame(function () { WyrmRender.draw(cv, stateForRender(), { cell: cell, t: performance.now() }); loop(); }); })();
    renderHUD();
  }

  function renderHUD() {
    var g = S.game;
    if (!g) return;
    var status = g.status === "playing" ? "" :
      g.status === "won" ? ' <span class="hud-status-won">WON ♥</span>' :
      g.status === "dead" ? ' <span class="hud-status-dead">SPIKED</span>' :
      ' <span class="hud-status-dead">EXHAUSTED</span>';
    var eggs = (g.eggs && g.eggs.length) ? ' <span class="hud-sep">·</span> <span class="hud-egg">🥚 ' + g.eggs.length + " egg" + (g.eggs.length > 1 ? "s" : "") + "</span>" : "";
    $("#play-hud").innerHTML =
      "turn <b>" + g.turn + "</b>/<b>" + g.turnLimit + "</b>" +
      '<span class="hud-sep">·</span> length <b>' + g.worm.length + "</b>" +
      '<span class="hud-sep">·</span> apples <b>' + g.apples.length + "</b>" +
      (g.keysHeld ? '<span class="hud-sep">·</span> keys <b>' + g.keysHeld + "</b>" : "") +
      eggs + status;
  }

  function logLine(n, action, ev) {
    var el = document.createElement("div");
    el.className = "stepline";
    el.innerHTML = '<span class="st-n">' + n + "</span>" +
      '<span class="st-a">' + esc(action) + "</span>" +
      '<span class="st-ev">' + esc(ev || "") + "</span>";
    var log = $("#steplog");
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function renderLegend() {
    $("#elem-legend").innerHTML = [
      ["@", "worm head (you)"], ["o", "worm body"], ["*", "apple — eat all, then reach ♥"],
      ["X", "heart goal"], ["#", "soil wall"], ["+", "dirt — diggable"], ["%", "floor button"],
      ["D", "golden gate"], ["$", "crate"], ["k / L", "key / lock"], ["~", "spikes — death"],
      ["> < ^ v", "valves — one-way"], ["=", "crumble bridge — once"], ["_", "ice — you slide"],
      ["O", "egg — gravity cargo · drop = run lost"]
    ].map(function (r) { return "<div><b>" + r[0] + "</b>" + r[1] + "</div>"; }).join("");
  }

  /* ── input ──────────────────────────────────────────────────────── */
  var KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    x: "split", X: "split", " ": "split"
  };
  document.addEventListener("keydown", function (e) {
    if (!S.game || $("#arena").style.display === "none") return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); restartAttempt(); return; }
    if (e.key === "Escape") return;
    var act = KEYMAP[e.key];
    if (!act) return;
    e.preventDefault();
    if (e.repeat) return;
    doAction(act);
  });
  $("#dpad").querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { doAction(b.getAttribute("data-act")); });
  });

  function doAction(act) {
    if (!S.game || S.game.status !== "playing") return;
    var tMs = Math.round(performance.now() - S.t0);
    var r = E.step(S.game, act);
    if (!r.valid) {
      logLine(S.run.moves.length + 1, act, "✗ " + (r.reason || "blocked"));
      return;
    }
    S.game = r.state;
    var evs = (r.state.lastEvents || []).map(function (e) { return e.type; });
    S.run.moves.push({ turn: S.game.turn, action: act, events: evs, tMs: tMs });
    logLine(S.run.moves.length, act, evs.join(" "));
    renderHUD();
    var st = stateForRender();
    var grid = S.level.grid, w = grid[0].length;
    var wrap = document.querySelector(".play-canvas-wrap");
    var cell = Math.max(16, Math.min(44, Math.floor(Math.max(220, Math.min(760, wrap.clientWidth - 36)) / w)));
    WyrmRender.draw($("#play-stage"), st, { cell: cell, t: performance.now() });
    persist();
    if (S.game.status !== "playing") finish();
  }

  function restartAttempt() {
    if (!S.run) return;
    S.run.deaths += (S.game && S.game.status === "dead") ? 1 : 0;
    newAttempt(S.run.attempts + 1, S.run.deaths);
  }
  $("#btn-restart").addEventListener("click", restartAttempt);
  $("#btn-back").addEventListener("click", function () {
    cancelAnimationFrame(S.raf);
    location.hash = "";
    document.title = "WRYM · Human Arena — play the benchmark yourself";
    $("#arena").style.display = "none";
    $("#picker").style.display = "";
    renderPicker();
  });
  $("#btn-export-run").addEventListener("click", exportRun);

  /* ── finish + model comparison ──────────────────────────────────── */
  function eloFor(modelKey) {
    var row = (S.board.leaderboard || []).find(function (r) { return r.key === modelKey; });
    return row ? row.elo : null;
  }

  function modelRunsFor(slug, cb) {
    var jobs = S.models.map(function (m) {
      return fetch("./data/runs/" + m.key + "__" + slug + ".json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j ? { model: m, run: j } : null; })
        .catch(function () { return null; });
    });
    Promise.all(jobs).then(function (rows) { cb(rows.filter(Boolean)); });
  }

  function finish() {
    cancelAnimationFrame(S.raf);
    var g = S.game;
    var won = g.status === "won";
    var moves = S.run.moves.length;
    S.run.status = g.status;
    S.run.finishedAt = new Date().toISOString();
    S.run.result = {
      status: g.status, moves: moves, attempts: S.run.attempts, deaths: S.run.deaths,
      applesEaten: (S.level.counts && S.level.counts.apples ? S.level.counts.apples - g.apples.length : 0),
      splits: S.run.moves.filter(function (m) { return m.action === "split"; }).length,
      optimal: S.level.minMoves
    };
    persist();

    if (won) {
      careerAdd(S.level, moves, S.run.attempts, S.run.deaths);
      localStorage.removeItem(LS.run(S.level.slug));
    }

    modelRunsFor(S.level.slug, function (rows) { openResult(won, rows); });
  }

  function openResult(won, rows) {
    var moves = S.run.moves.length;
    var opt = S.level.minMoves || 0;
    var eff = opt > 0 ? Math.round((opt / moves) * 100) : null;

    $("#res-head").innerHTML = won
      ? '<div style="font-size:34px">🪱♥</div><h3>WOIM IN LOVE!</h3><p class="res-sub">every apple eaten, the heart reached' + ((S.level.counts && S.level.counts.eggs) ? ", the eggs delivered safely" : "") + "</p>"
      : (S.game.status === "dead"
        ? '<div style="font-size:34px">💀</div><h3>THE WOIM IS NO MORE</h3><p class="res-sub">spiked at turn ' + S.game.turn + " — the nest remains empty</p>"
        : '<div style="font-size:34px">⏳</div><h3>OUT OF TURNS</h3><p class="res-sub">turn limit ' + S.level.turnLimit + " reached — the arena closes</p>");

    $("#res-score").textContent = won ? moves + " moves" : "—";
    $("#res-score-lab").textContent = won ? "solver optimum: " + opt + " · efficiency " + eff + "%" : "no score — the worm demands victory";

    var best = Math.max(1, rows.reduce(function (a, r) { return Math.min(a, r.run.result.movesUsed || 999); }, 999));
    $("#res-grid").innerHTML =
      '<div class="res-cell ' + (won && moves <= opt ? "good" : "") + '"><b>' + opt + "</b><span>solver optimum</span></div>" +
      '<div class="res-cell ' + (won && moves <= opt ? "good" : "") + '"><b>' + (won ? eff + "%" : "—") + "</b><span>your efficiency</span></div>" +
      '<div class="res-cell ' + (won ? "good" : "bad") + '"><b>' + S.run.attempts + "</b><span>attempts</span></div>" +
      '<div class="res-cell ' + (S.run.deaths === 0 ? "good" : "bad") + '"><b>' + S.run.deaths + "</b><span>deaths</span></div>";

    /* comparison table: you vs every model with a certified run */
    var rowsHtml = "";
    var youBeat = 0, youTied = 0, totalCmp = 0;
    rows.forEach(function (r) {
      var res = r.run.result || {};
      var mMoves = res.movesUsed != null ? res.movesUsed : "—";
      var solved = res.status === "won";
      var delta, cls;
      if (!won) { delta = "—"; cls = "same"; }
      else if (!solved) { delta = "you won · it didn't"; cls = "win"; youBeat++; totalCmp++; }
      else {
        var d = moves - res.movesUsed;
        delta = d === 0 ? "tied" : (d < 0 ? d + " turns" : "+" + d + " turns");
        cls = d === 0 ? "same" : (d < 0 ? "win" : "loss");
        if (d < 0) youBeat++;
        if (d === 0) youTied++;
        totalCmp++;
      }
      var elo = eloFor(r.model.key);
      rowsHtml += "<tr>" +
        '<td class="cmp-name">' + esc(r.model.name) + ' <span class="cmp-elo">' + (elo != null ? "elo " + elo : r.model.kind) + "</span></td>" +
        "<td>" + (solved ? "✓ solved" : "✗ " + esc(res.status || "failed")) + "</td>" +
        "<td>" + mMoves + "</td>" +
        "<td>" + (res.attempts != null ? res.attempts : "—") + "</td>" +
        "<td>" + (res.deaths != null ? res.deaths : "—") + "</td>" +
        '<td><span class="cmp-delta ' + cls + '">' + delta + "</span></td>" +
        "</tr>";
    });
    rowsHtml += '<tr class="cmp-you"><td class="cmp-name">🪱 YOU <span class="cmp-elo">human</span></td>' +
      "<td>" + (won ? "✓ solved" : "✗ " + S.run.status) + "</td>" +
      "<td><b>" + (won ? moves : "—") + "</b></td>" +
      "<td>" + S.run.attempts + "</td><td>" + S.run.deaths + "</td>" +
      '<td><span class="cmp-delta same">reference</span></td></tr>';

    $("#cmp-table").innerHTML = "<thead><tr><th>player</th><th>outcome</th><th>moves</th><th>attempts</th><th>deaths</th><th>Δ you vs model</th></tr></thead><tbody>" + rowsHtml + "</tbody>";
    $("#cmp-note").textContent = rows.length
      ? (won && totalCmp ? ("you beat " + youBeat + " of " + totalCmp + " scored machine" + (totalCmp > 1 ? "s" : "") + " on this level" + (youTied ? " · " + youTied + " exact tie" + (youTied > 1 ? "s" : "") + " at optimum" : "")) : "model runs on this level are certified — mirror-variant protected, replayed frame by frame")
      : "no certified model runs on this level yet — you are setting the first reference line";

    $("#result-modal").classList.add("open");
    S.cmpRows = rows;
  }

  $("#btn-stay").addEventListener("click", function () {
    $("#result-modal").classList.remove("open");
    var deaths = S.run.deaths + (S.run.status === "dead" ? 1 : 0);
    newAttempt(S.run.attempts + (S.run.status === "dead" ? 0 : 1), deaths);
  });
  $("#btn-next").addEventListener("click", function () {
    $("#result-modal").classList.remove("open");
    var i = S.levels.findIndex(function (l) { return l.slug === S.level.slug; });
    var next = S.levels[i + 1] || S.levels[0];
    enterLevel(next);
  });

  /* ── export + share ─────────────────────────────────────────────── */
  function buildExport() {
    var out = JSON.parse(JSON.stringify(S.run));
    delete out.state;
    out.levelMeta = {
      slug: S.level.slug, name: S.level.name, tier: S.level.tier,
      minMoves: S.level.minMoves, difficulty: S.level.difficulty,
      turnLimit: S.level.turnLimit, grid: S.level.grid
    };
    out.comparison = (S.cmpRows || []).map(function (r) {
      return {
        model: r.model.name, key: r.model.key, elo: eloFor(r.model.key),
        status: r.run.result && r.run.result.status, movesUsed: r.run.result && r.run.result.movesUsed,
        attempts: r.run.result && r.run.result.attempts, deaths: r.run.result && r.run.result.deaths,
        runUrl: location.origin + location.pathname.replace("play.html", "run.html?run=" + encodeURIComponent(r.run.runId || (r.model.key + "__" + S.level.slug)))
      };
    });
    out.solverOptimum = S.level.minMoves;
    out.efficiencyPct = S.run.result && S.run.result.status === "won" && S.level.minMoves ? Math.round((S.level.minMoves / S.run.result.moves) * 100) : null;
    return out;
  }
  function exportRun() {
    if (!S.run || !S.run.moves.length) { alert("make at least one move first"); return; }
    var blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wyrm-human__" + S.level.slug + "__" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
  }
  $("#btn-export-modal").addEventListener("click", exportRun);
  $("#btn-share").addEventListener("click", function () {
    var r = S.run.result || {};
    var lines = ["WRYM · " + S.level.name + " (" + S.level.tier + ")"];
    lines.push(wonLine(r));
    (S.cmpRows || []).forEach(function (c) {
      var res = c.run.result || {};
      lines.push("vs " + c.model.name + ": " + (res.status === "won" ? "solved in " + res.movesUsed : "failed (" + res.status + ")"));
    });
    lines.push("optimum " + S.level.minMoves + " moves · play: " + location.origin + location.pathname.replace(/[^/]*$/, "play.html") + "#play=" + S.level.slug);
    var txt = lines.join("\n");
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(function () { $("#btn-share").textContent = "✓ copied"; setTimeout(function () { $("#btn-share").textContent = "⧉ copy share text"; }, 1500); })
      .catch(function () { alert(txt); });
  });
  function wonLine(r) {
    if (r.status === "won") return "solved in " + r.moves + " moves (optimum " + r.optimal + ", " + Math.round((r.optimal / r.moves) * 100) + "% efficiency, " + r.attempts + " attempts, " + r.deaths + " deaths)";
    return r.status + " — the machines still hold this ground";
  }
})();
