/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-app.js — leaderboard, level gallery, replay engine.
   Pure static: reads pre-built JSON from ./data/, renders everything
   client-side. No computation is required server-side; the archive is
   fully deterministic (engine replays certify every run).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = function (sel, el) { return (el || document).querySelector(sel); };
  const $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const fmt = function (n, d) { return n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }); };

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
  }

  // ── pairwise Elo (mirrors src/lib/wyrm/elo.ts) ─────────────────────
  function eloUpdate(a, b) {
    const K = 32;
    const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
    let sA;
    if (a.solved && !b.solved) sA = 1;
    else if (!a.solved && b.solved) sA = 0;
    else if (a.solved && b.solved) sA = a.score >= b.score ? 1 : 0;
    else sA = 0.5;
    return {
      newA: Math.round(a.elo + K * (sA - expectedA)),
      newB: Math.round(b.elo + K * ((1 - sA) - (1 - expectedA))),
    };
  }

  function computeElo(runs) {
    // runs: [{model, levelSlug, status, score}]
    const elos = {};
    const bump = function (m) { if (!elos[m]) elos[m] = 1200; return elos[m]; };
    const byLevel = {};
    runs.forEach(function (r) {
      (byLevel[r.levelSlug] = byLevel[r.levelSlug] || []).push(r);
    });
    Object.keys(byLevel).forEach(function (lv) {
      const rs = byLevel[lv];
      for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          if (a.model === b.model) continue;
          const out = eloUpdate(
            { elo: bump(a.model), score: a.score, solved: a.status === "won" },
            { elo: bump(b.model), score: b.score, solved: b.status === "won" },
          );
          elos[a.model] = out.newA;
          elos[b.model] = out.newB;
        }
      }
    });
    return elos;
  }

  // ── shared page chrome: active nav + footer year ──────────────────
  document.addEventListener("DOMContentLoaded", function () {
    const path = location.pathname.split("/").pop() || "index.html";
    $$(".masthead nav a").forEach(function (a) {
      const href = a.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
    });
  });

  // ═══ INDEX — leaderboard ═══════════════════════════════════════════
  window.WyrmIndex = function () {
    Promise.all([fetchJSON("./data/index.json")]).then(function (res) {
      const data = res[0];
      // stats
      $("#stat-models .num").textContent = data.models.length;
      $("#stat-levels .num").textContent = data.levels.length;
      $("#stat-runs .num").textContent = fmt(data.summary.runs);
      $("#stat-solved .num").textContent = data.summary.solvedPct + "%";

      // leaderboard
      const board = $("#leaderboard tbody");
      board.innerHTML = data.leaderboard.map(function (row, i) {
        const eff = row.avgEfficiency == null ? "—" : (row.avgEfficiency * 100).toFixed(0) + "%";
        return (
          "<tr>" +
          '<td><span class="rank">' + (i + 1) + "</span></td>" +
          '<td><span class="model-name">' + esc(row.name) + "</span>" +
          '<span class="model-kind">' + esc(row.kind) + "</span></td>" +
          '<td class="num">' + fmt(row.elo) + "</td>" +
          '<td class="num">' + row.solved + "/" + row.covered + "</td>" +
          '<td class="num">' + eff + "</td>" +
          '<td class="num">' + fmt(row.deaths) + "</td>" +
          '<td class="num">' + (row.avgLatency == null ? "—" : fmt(row.avgLatency) + " ms") + "</td>" +
          '<td class="num">' + fmt(row.tokens, 0) + "</td>" +
          "<td>" + row.checkerPct + "%</td>" +
          "</tr>"
        );
      }).join("");

      // level table
      const lv = $("#levels tbody");
      lv.innerHTML = data.levels.map(function (l) {
        const meter = Array.from({ length: 10 }, function (_, k) {
          return '<i class="' + (k < l.difficulty ? "on" : "") + '"></i>';
        }).join("");
        const runsCell = l.runs.length
          ? l.runs.map(function (r) {
              return '<a href="./run.html?m=' + encodeURIComponent(r.model) + "&l=" + encodeURIComponent(l.slug) + '">' +
                '<span class="verdict ' + esc(r.status) + '">' + esc(r.modelShort) + " · " + esc(r.status) + "</span></a>";
            }).join(" · ")
          : '<span style="color:var(--ink-faint)">awaiting first run</span>';
        return (
          "<tr>" +
          '<td><span class="mono-note" style="border:0;padding:0;background:none">' + esc(l.slug) + "</span></td>" +
          "<td>" + esc(l.name) + "</td>" +
          '<td><span class="tierchip tier-' + esc(String(l.tier || "").toLowerCase()) + '">' + esc(l.tier || "\u2014") + "</span></td>" +
          '<td><span class="diff">' + meter + '<span class="val">' + (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : l.difficulty) + "/10</span></span></td>" +
          '<td class="num">' + l.minMoves + "</td>" +
          "<td>" + l.mechanics.map(function (m) { return '<span class="chip">' + esc(m) + "</span>"; }).join(" ") + "</td>" +
          "<td>" + runsCell + "</td>" +
          "</tr>"
        );
      }).join("");

      // methodology footnote numbers
      if ($("#gen-time")) $("#gen-time").textContent = data.generatedAt;
    }).catch(function (e) {
      const el = $("#leaderboard tbody");
      if (el) el.innerHTML = '<tr><td colspan="9">archive data failed to load: ' + esc(e.message) + "</td></tr>";
    });
  };

  // ═══ LEVELS — gallery ══════════════════════════════════════════════
  var DIM_LABELS = {
    depth: "depth", search: "search", irreversibility: "irreversible",
    simulation: "simulation", threat: "threat", choreography: "choreography",
    budget: "budget",
  };
  function dimsHtml(l) {
    if (!l.dims) return "";
    return '<div class="dims">' + Object.keys(DIM_LABELS).map(function (k) {
      var v = Math.round(l.dims[k] || 0);
      return '<span class="dim" title="' + esc(DIM_LABELS[k]) + " " + v + '/100">' +
        "<i style=\"width:" + v + '%"></i><b>' + esc(DIM_LABELS[k].slice(0, 4)) + "</b></span>";
    }).join("") + "</div>";
  }
  window.WyrmLevels = function () {
    fetchJSON("./data/index.json").then(function (data) {
      const grid = $("#level-grid");
      grid.innerHTML = data.levels.map(function (l, i) {
        const runs = l.runs.length
          ? l.runs.map(function (r) {
              return '<a href="./run.html?m=' + encodeURIComponent(r.model) + "&l=" + encodeURIComponent(l.slug) + '">' +
                '<span class="verdict ' + esc(r.status) + '">' + esc(r.modelShort) + " · " + esc(r.status) + "</span></a>";
            }).join("<br>")
          : '<span style="color:var(--ink-faint);font-size:12px">awaiting first run</span>';
        return (
          '<div class="level-card">' +
          '<canvas data-level="' + i + '"></canvas>' +
          "<h3>" + esc(l.name) +
          ' <span class="tierchip tier-' + esc(String(l.tier || "").toLowerCase()) + '">' + esc(l.tier || "\u2014") + "</span></h3>" +
          '<div class="slug">' + esc(l.slug) + " · budget " + l.turnLimit + " turns · par " + l.minMoves + " · score " +
          (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : l.difficulty) + "</div>" +          '<div class="meta"><span class="diff">' +
          Array.from({ length: 10 }, function (_, k) { return '<i class="' + (k < l.difficulty ? "on" : "") + '"></i>'; }).join("") +
          '<span class="val">' + (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : l.difficulty) + "/10</span></span>" +
          '<span class="chips">' + l.mechanics.map(function (m) { return '<span class="chip">' + esc(m) + "</span>"; }).join("") + "</span></div>" +
          dimsHtml(l) +
          '<div class="runs" style="margin-top:8px;font-size:12.5px">' + runs + "</div>" +
          "</div>"
        );
      }).join("");

      // draw each level's initial state
      fetchJSON("./data/levels.json").then(function (levels) {
        $$("#level-grid canvas").forEach(function (cv) {
          const l = levels[Number(cv.dataset.level)];
          if (!l) return;
          const st = initialState(l.grid, l.turnLimit);
          const cell = Math.max(14, Math.min(26, Math.floor(230 / l.width)));
          WyrmRender.draw(cv, st, { cell: cell, pad: 12, quality: "low" });
        });
      });
    }).catch(function (e) {
      $("#level-grid").innerHTML = '<div class="notice">archive data failed to load: ' + esc(e.message) + "</div>";
    });
  };

  // ═══ LEGEND — the pieces, as real sprite icons ═══════════════════
  window.WyrmLegend = function () {
    const host = $("#element-legend");
    if (!host || !window.WyrmRender || !WyrmRender.spriteIcon) return;
    const pieces = [
      ["#", "Soil Wall", "impassable earth, layered strata"],
      [".", "Tunnel", "carved dark chamber — the worm walks here"],
      ["+", "Dirt", "dug through at the cost of a turn"],
      ["@", "Worm", "coral head, googly eye, grows per apple"],
      ["*", "Apple", "mandatory food — one segment each"],
      ["$", "Walnut", "pushable boulder, weighs buttons"],
      ["%", "Button", "depresses under any weight"],
      ["D", "Gate", "bars until every button is held"],
      ["X", "Heart", "the goal — opens after all apples"],
      ["~", "Spikes", "instant death, even mid-slide"],
      [">", "Valve", "one-way with the arrow"],
      ["_", "Ice", "slide until something stops you"],
      ["=", "Bridge", "crumbles when the last weight leaves"],
      ["k", "Key", "pickup — each padlock eats one"],
      ["L", "Padlock", "opens forever with a key"],
    ];
    const themes = WyrmRender.THEMES;
    const keys = Object.keys(themes);
    host.innerHTML = pieces.map(function (p, i) {
      return (
        '<div class="legend-item">' +
        '<canvas data-ch="' + esc(p[0]) + '" data-seed="' + (i * 7 + 3) + '"></canvas>' +
        '<div><b>' + esc(p[1]) + '</b><span>' + esc(p[2]) + "</span></div>" +
        '<code class="legend-char">' + (p[0] === "." ? "·" : esc(p[0])) + "</code>" +
        "</div>"
      );
    }).join("");
    $$("#element-legend canvas").forEach(function (cv) {
      const th = themes[keys[(Number(cv.dataset.seed) * 13 + 5) % keys.length]];
      WyrmRender.spriteIcon(cv, cv.dataset.ch, 44, { theme: th, seed: Number(cv.dataset.seed) });
      cv.style.borderRadius = "22%";
      cv.style.boxShadow = "0 3px 0 rgba(0,0,0,0.28)";
    });
  };

  function initialState(grid, turnLimit) {
    const h = grid.length, w = grid[0].length;
    const t = grid.map(function (r) { return r.split(""); });
    const m = [], a = [], c = [], k = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = grid[y][x];
        if (ch === "@") { m[0] = { x: x, y: y }; t[y][x] = "."; }
        else if (ch === "o") { m.push({ x: x, y: y }); t[y][x] = "."; }
        else if (ch === "*") { a.push({ x: x, y: y }); t[y][x] = "."; }
        else if (ch === "$") { c.push({ x: x, y: y }); t[y][x] = "."; }
        else if (ch === "k") { k.push({ x: x, y: y }); t[y][x] = "."; }
      }
    }
    const body = m.slice(1).reverse();
    return { w: w, h: h, t: t.map(function (r) { return r.join(""); }), m: [m[0]].concat(body), a: a, c: c, k: k, kh: 0, r: [], p: [], n: 0, tl: turnLimit, s: "playing" };
  }

  // ═══ RUN — replay viewer ═══════════════════════════════════════════
  window.WyrmRun = function () {
    const qs = new URLSearchParams(location.search);
    const model = qs.get("m");
    const slug = qs.get("l");
    if (!model || !slug) {
      $("#run-root").innerHTML = '<div class="notice"><span class="n-title">missing parameters</span>use <code>run.html?m=&lt;model-key&gt;&amp;l=&lt;level-slug&gt;</code> — every archive link carries them.</div>';
      return;
    }
    fetchJSON("./data/runs/" + model + "__" + slug + ".json").then(function (run) {
      renderRun(run);
    }).catch(function () {
      $("#run-root").innerHTML = '<div class="notice"><span class="n-title">run not found</span>no archived run for <code>' +
        esc(model) + "</code> × <code>" + esc(slug) + "</code>. It may not have been played yet — see the index for coverage.</div>";
    });
  };

  function renderRun(run) {
    $("#run-title").textContent = run.model.name + " × " + run.level.name;
    $("#run-crumbs").innerHTML =
      '<a href="./index.html">leaderboard</a> / <span>' + esc(run.model.key) + "</span> / <span>" + esc(run.level.slug) + "</span>";
    $("#run-status").innerHTML =
      '<span class="verdict ' + esc(run.result.status) + '">' + esc(run.result.status).toUpperCase() + "</span>" +
      ' <span style="color:var(--ink-faint)">· checker ' + esc(run.checker.verdict) +
      " · " + run.result.movesUsed + " moves (par " + run.level.minMoves + ", budget " + run.level.turnLimit + ")" +
      " · deaths " + run.result.deaths + " · attempts " + run.result.attempts + "</span>";

    const steps = run.steps.filter(function (s, i) {
      // keep only steps that CHANGED the world or carried a real reply —
      // rejected actions stay visible (they are teaching moments), but
      // consecutive rejected repeats collapse into the next real step
      return s.valid || s.reason || i === run.steps.length - 1 || true;
    });

    const canvas = $("#stage");
    let idx = 0;
    let playing = false;
    let timer = null;

    function show(i) {
      idx = Math.max(0, Math.min(steps.length - 1, i));
      const st = JSON.parse(steps[idx].stateJson);
      const geo = WyrmRender.draw(canvas, st, { cell: 44, pad: 24, quality: "high" });
      $("#scrubber").value = String(idx);
      $("#turn-readout").textContent = "step " + (idx + 1) + "/" + steps.length + " · turn " + st.n;
      // thought panel
      const s = steps[idx];
      $("#tp-status").textContent = s.valid ? "action accepted" : "action rejected";
      $("#tp-status").className = "tp-status " + (s.valid ? "ok" : "bad");
      $("#tp-thought").textContent = s.thought || "(no recorded thought)";
      $("#tp-raw").textContent = s.rawOutput || "—";
      $("#tp-action").textContent = s.action + (s.valid ? "" : " — " + (s.reason || "invalid"));
      $("#tp-action").className = "action-chip" + (s.valid ? "" : " invalid");
      $("#tp-meta").textContent =
        "latency " + s.latencyMs + " ms" + (s.sandbox && s.sandbox.bytesIn ? " · obs " + fmt(s.sandbox.bytesIn) + " B in / " + fmt(s.sandbox.bytesOut) + " B out" : "");
      // events
      const evs = (s.events || []);
      $("#event-strip").innerHTML = evs.length
        ? evs.map(function (e) {
            const cls = e.type === "death" || e.type === "spike" ? "bad" : (e.type === "win" || e.type === "ate" ? "good" : "");
            return '<span class="ev ' + cls + '">' + esc(eventLabel(e)) + "</span>";
          }).join("")
        : "";
      $("#btn-prev").disabled = idx === 0;
      $("#btn-next").disabled = idx === steps.length - 1;
    }

    function eventLabel(e) {
      switch (e.type) {
        case "move": return "→ " + e.dir;
        case "slide": return "slide " + e.dir + " ×" + e.cells;
        case "bump": return "bump: " + e.reason;
        case "dig": return "dig";
        case "push": return "push crate";
        case "ate": return "ate apple (len " + e.newLength + ")";
        case "grow": return "grow → " + e.newLength;
        case "split": return "split " + e.kept + "+" + e.dropped;
        case "plates": return "plates " + e.satisfied + "/" + e.total;
        case "spike": return "SPIKES";
        case "crumble": return "bridge crumbles";
        case "key": return "key picked up";
        case "unlock": return "lock opened";
        case "exit-sealed": return "exit sealed — " + e.applesLeft + " apple(s) left";
        case "win": return "WON in " + e.moves;
        case "death": return "DEATH";
        default: return e.type;
      }
    }

    function setPlaying(p) {
      playing = p;
      $("#btn-play").textContent = playing ? "❚❚ pause" : "▶ play";
      if (timer) { clearInterval(timer); timer = null; }
      if (playing) {
        timer = setInterval(function () {
          if (idx >= steps.length - 1) { setPlaying(false); return; }
          show(idx + 1);
        }, 420);
      }
    }

    $("#btn-prev").onclick = function () { setPlaying(false); show(idx - 1); };
    $("#btn-next").onclick = function () { setPlaying(false); show(idx + 1); };
    $("#btn-play").onclick = function () { setPlaying(!playing); };
    $("#btn-end").onclick = function () { setPlaying(false); show(steps.length - 1); };
    $("#scrubber").addEventListener("input", function () { setPlaying(false); show(Number(this.value)); });

    show(0);

    // reliability roll-up
    const rel = run.reliability;
    $("#reliability").innerHTML =
      '<div class="print-box"><div class="pb-title">reliability ledger — this run</div>' +
      "<b>" + rel.calls + "</b> model calls · <b>" + rel.retries + "</b> retries · <b>" + rel.degraded + "</b> fallback rescues · " +
      "rate-limit waits <b>" + fmt(rel.rateWaitMs) + " ms</b> · tokens ≈ <b>" + fmt(rel.tokensIn) + " in</b> / <b>" + fmt(rel.tokensOut) + " out</b>" +
      (rel.costUsd ? " · est. spend <b>$" + rel.costUsd.toFixed(4) + "</b>" : "") +
      (run.result.llmError ? '<div style="margin-top:8px;color:var(--wax)">last LLM error: ' + esc(run.result.llmError) + "</div>" : "") +
      "</div>";
  }
})();
