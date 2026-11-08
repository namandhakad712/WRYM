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

  // ── rating + capability presentation helpers ─────────────────────
  // Ratings arrive PRE-COMPUTED from site/data/index.json (pooled
  // Bradley-Terry MLE + bootstrap 95% CI — see scripts/export-site.ts
  // and src/lib/wyrm/elo.ts). The site itself stays zero-computation.

  var CAP_SHORT = {
    spatial: ["SPA", "spatial reasoning — valves / ice"],
    planning: ["PLA", "planning ahead — irreversibility × tight budgets"],
    dependencies: ["DEP", "object dependencies — buttons / gates / keys"],
    "state-tracking": ["STT", "state tracking — permanent world changes"],
    "long-horizon": ["LNG", "long-horizon play — deep optimal lines"],
    risk: ["RSK", "risk assessment — spike fields"],
    precision: ["PRC", "choreography — crate & body routing precision"],
  };

  function capChips(tags) {
    return (tags || []).map(function (t) {
      var m = CAP_SHORT[t] || [String(t).slice(0, 3).toUpperCase(), t];
      return '<span class="chip capchip" title="' + esc(m[1]) + " · " + esc(t) + '">' + esc(m[0]) + "</span>";
    }).join(" ");
  }

  function eloCell(row) {
    if (row.kind === "solver") return '<span class="ref-chip" title="the provably-optimal reference line every model is measured against">reference</span>';
    if (row.elo == null) return '—';
    var ci = row.eloCi;
    var half = ci ? Math.round((ci[1] - ci[0]) / 2) : null;
    return '<b>' + fmt(row.elo) + "</b>" +
      (half != null ? ' <span class="ci-chip" title="bootstrap 95% CI ' + ci[0] + "–" + ci[1] + '">±' + fmt(half) + "</span>" : "");
  }

  function progressCell(pct) {
    if (pct == null) return '—';
    return '<div class="pbar" title="BALROG-style partial credit: apples · goal · distance closure"><i style="width:' +
      Math.max(2, pct) + '%"></i><span>' + pct + "%</span></div>";
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
      // stats — "ranked" counts models with archived runs; the rest are
      // honestly listed below the board as awaiting their first run
      const rankedCount = (data.leaderboard || []).length;
      const unrankedCount = (data.unranked || []).length;
      $("#stat-models .num").textContent = rankedCount + (unrankedCount ? "+" + unrankedCount : "");
      $("#stat-models .lbl").textContent = unrankedCount
        ? "ranked (" + unrankedCount + " awaiting first run)"
        : "models ranked";
      $("#stat-levels .num").textContent = data.levels.length;
      $("#stat-runs .num").textContent = fmt(data.summary.runs);
      $("#stat-solved .num").textContent = data.summary.solvedPct + "%";

      // leaderboard
      const board = $("#leaderboard tbody");
      board.innerHTML = data.leaderboard.map(function (row, i) {
        const eff = row.avgEfficiency == null ? "—" : (row.avgEfficiency * 100).toFixed(0) + "%";
        const modelMeta = (data.models || []).find(function (m) { return m.key === row.key; }) || {};
        const aa = row.aaUrl || modelMeta.aaUrl;
        return (
          "<tr>" +
          '<td><span class="rank">' + (i + 1) + "</span></td>" +
          '<td><span class="model-name">' + esc(row.name) + "</span>" +
          (aa ? ' <a class="aa-chip" href="' + esc(aa) + '" target="_blank" rel="noopener" title="independent analysis on Artificial Analysis">AA ↗</a>' : "") +
          '<span class="model-kind">' + esc(row.kind) + "</span></td>" +
          '<td class="num">' + eloCell(row) + "</td>" +
          '<td class="num">' + fmt(row.battles) + "</td>" +
          '<td class="num">' + row.solved + "/" + row.covered + "</td>" +
          '<td class="num">' + progressCell(row.avgProgress) + "</td>" +
          '<td class="num">' + eff + "</td>" +
          '<td class="num">' + fmt(row.deaths) + "</td>" +
          '<td class="num">' + (row.failures ? row.failures.invalidPct + "%" : "—") + "</td>" +
          '<td class="num">' + fmt(row.tokens, 0) + "</td>" +
          "<td>" + row.checkerPct + "%</td>" +
          "</tr>"
        );
      }).join("");

      // head-to-head matrix (needs ≥ 2 rated rows with battles)
      const ratedRows = (data.leaderboard || []).filter(function (r) { return r.battles > 0; });
      const h2hSec = $("#h2h-section");
      if (h2hSec && (data.headToHead || []).length && ratedRows.length >= 2) {
        h2hSec.style.display = "";
        const nameOf = {};
        data.leaderboard.concat(data.unranked || []).forEach(function (m) { nameOf[m.key] = m.name; });
        const keys = [];
        data.headToHead.forEach(function (h) {
          if (keys.indexOf(h.a) < 0) keys.push(h.a);
          if (keys.indexOf(h.b) < 0) keys.push(h.b);
        });
        const cell = function (a, b) {
          if (a === b) return '<td class="h2h-diag"></td>';
          const rec = data.headToHead.find(function (h) { return (h.a === a && h.b === b) || (h.a === b && h.b === a); });
          if (!rec) return '<td class="h2h-none">·</td>';
          const w = rec.a === a ? rec.w : rec.l;
          const l = rec.a === a ? rec.l : rec.w;
          return "<td><b>" + w + "</b>–" + rec.d + "–<b>" + l + "</b></td>";
        };
        $("#h2h-host").innerHTML =
          '<table class="ledger h2h-table"><thead><tr><th></th>' +
          keys.map(function (k) { return "<th>" + esc(nameOf[k] || k) + "</th>"; }).join("") +
          "</tr></thead><tbody>" +
          keys.map(function (a) {
            return "<tr><th>" + esc(nameOf[a] || a) + "</th>" + keys.map(function (b) { return cell(a, b); }).join("") + "</tr>";
          }).join("") +
          "</tbody></table>" +
          '<p class="mono-note">row vs column · wins–draws–losses over shared levels · estimator: ' +
          esc(data.summary.ratingMethod || "pooled Bradley-Terry") + "</p>";
      }

      // capability profiles (needs a model with a non-empty profile)
      const capsSec = $("#caps-section");
      if (capsSec && data.leaderboard.some(function (r) { return (r.caps || []).length; })) {
        capsSec.style.display = "";
        $("#caps-host").innerHTML = data.leaderboard.map(function (row) {
          const bars = (row.caps || []).map(function (c) {
            return '<div class="caprow" title="' + esc(c.label) + ": " + c.pct +
              "% success on capability-tagged levels, intensity-weighted\">" +
              '<span class="caplab">' + esc(c.label) + "</span>" +
              '<span class="captrack"><i style="width:' + Math.max(2, c.pct) + '%"></i></span>' +
              "<b>" + c.pct + "%</b></div>";
          }).join("");
          return (
            '<div class="cap-card">' +
            '<div class="cap-head"><span class="model-name">' + esc(row.name) + "</span>" +
            '<span class="model-kind">' + row.solved + "/" + row.covered + " solved</span></div>" +
            (bars || '<p class="cap-empty">no capability-tagged levels played yet — run this model on more of the ladder to grow its profile</p>') +
            "</div>"
          );
        }).join("");
      }

      // failure taxonomy (needs at least one recorded failure anywhere)
      const failSec = $("#failure-section");
      if (failSec && data.leaderboard.some(function (r) {
        const f = r.failures;
        return f && (f.spikeDeaths + f.eggCracks + f.exhausted + f.dead + f.aborted + f.invalidActions) > 0;
      })) {
        failSec.style.display = "";
        $("#failure-host").innerHTML = data.leaderboard.map(function (row) {
          const f = row.failures || { spikeDeaths: 0, eggCracks: 0, exhausted: 0, dead: 0, aborted: 0, invalidActions: 0, invalidPct: 0 };
          const anyFail = f.spikeDeaths + f.eggCracks + f.exhausted + f.dead + f.aborted + f.invalidActions > 0;
          const chips = [
            f.spikeDeaths ? '<span class="fail-chip bad">🗡 spike deaths ' + f.spikeDeaths + "</span>" : "",
            f.eggCracks ? '<span class="fail-chip bad">🥚 eggs cracked ' + f.eggCracks + "</span>" : "",
            f.exhausted ? '<span class="fail-chip bad">⏳ turn budget exhausted ' + f.exhausted + "</span>" : "",
            f.dead ? '<span class="fail-chip bad">💀 hard deaths ' + f.dead + "</span>" : "",
            f.aborted ? '<span class="fail-chip warn">⚠ api aborts ' + f.aborted + "</span>" : "",
            f.invalidActions ? '<span class="fail-chip warn">✖ invalid actions ' + f.invalidActions + " (" + f.invalidPct + "% of steps)</span>" : "",
          ].filter(Boolean).join(" ");
          return (
            '<div class="fail-row">' +
            '<span class="model-name">' + esc(row.name) + "</span>" +
            (anyFail ? chips : '<span class="fail-chip ok">clean sweep — no recorded failures</span>') +
            "</div>"
          );
        }).join("");
      }

      // level table
      const lv = $("#levels tbody");
      lv.innerHTML = data.levels.map(function (l) {
        const diff = typeof l.difficulty === "number" ? l.difficulty : 0;
        const meter = Array.from({ length: 10 }, function (_, k) {
          return '<i class="' + (k < Math.round(diff) ? "on" : "") + '"></i>';
        }).join("");
        const runsCell = l.runs.length
          ? l.runs.map(function (r) {
              return '<a href="./run.html?m=' + encodeURIComponent(r.model) + "&l=" + encodeURIComponent(l.slug) + '">' +
                '<span class="verdict ' + esc(r.status) + '">' + esc(r.modelShort) + " · " + esc(r.status) +
                (typeof r.progress === "number" ? " · " + r.progress + "%" : "") + "</span></a>";
            }).join(" · ")
          : '<span style="color:var(--cream-faint)">awaiting first run</span>';
        const caps = capChips((l.capabilities || {}).tags);
        return (
          "<tr>" +
          '<td><span class="mono-note" style="border:0;padding:0;background:none">' + esc(l.slug) + "</span></td>" +
          "<td>" + esc(l.name) + "</td>" +
          '<td><span class="tierchip tier-' + esc(String(l.tier || "").toLowerCase()) + '">' + esc(l.tier || "\u2014") + "</span></td>" +
          '<td><span class="diff">' + meter + '<span class="val">' + (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : l.difficulty) + "/10</span></span></td>" +
          '<td class="num">' + l.minMoves + "</td>" +
          "<td>" + (caps || '<span style="color:var(--cream-faint)">—</span>') + "</td>" +
          "<td>" + runsCell + "</td>" +
          "</tr>"
        );
      }).join("");

      // mirror-variant registry (contamination check)
      const vn = $("#variants-note");
      if (vn && data.summary.variants && data.summary.variants.certified) {
        const v = data.summary.variants;
        vn.innerHTML = "🪞 <b>contamination check:</b> " + v.certified + "/" + v.total +
          " certified mirror twins (" + esc(v.method) + ")" +
          (v.fullParity ? " · <b>full par parity</b>" : "") +
          " — a model that memorized the original but cannot reason will fail its twin. " +
          'Method: <a href="./methodology.html">what the best game benchmarks taught us</a>.';
      }

      // methodology footnote numbers
      if ($("#gen-time")) $("#gen-time").textContent = data.generatedAt;

      // configured but not yet run — honesty strip under the board
      const un = $("#unranked-note");
      if (un) {
        un.innerHTML = (data.unranked && data.unranked.length)
          ? "configured, awaiting first run: " + data.unranked.map(function (m) {
              return '<span class="chip">' + esc(m.name) + (m.aaUrl ? ' <a style="color:var(--frost)" href="' + esc(m.aaUrl) + '" target="_blank" rel="noopener">AA ↗</a>' : "") + "</span>";
            }).join(" ") + ' — <a href="https://github.com/namandhakad712/WRYM#running-the-benchmark">run the benchmark locally</a> and push, or grab a <a href="./providers.html">free provider</a> and do it for $0.'
          : "";
      }
    }).catch(function (e) {
      const el = $("#leaderboard tbody");
      if (el) el.innerHTML = '<tr><td colspan="11">archive data failed to load: ' + esc(e.message) + "</td></tr>";
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
          : '<span style="color:var(--cream-faint);font-size:12px">awaiting first run</span>';
        return (
          '<div class="level-card' + (l.community ? " community" : "") + '">' +
          '<canvas data-level="' + i + '"></canvas>' +
          "<h3>" + esc(l.name) +
          ' <span class="tierchip tier-' + esc(String(l.tier || "").toLowerCase()) + '">' + esc(l.tier || "\u2014") + "</span>" +
          (l.community ? ' <span class="tierchip tier-community" title="submitted via the Level Forge">community' +
            (l.author ? " · " + esc(l.author) : "") + "</span>" : "") + "</h3>" +
          '<div class="slug">' + esc(l.slug) + " · budget " + l.turnLimit + " turns · par " + l.minMoves + " · score " +
          (typeof l.difficulty === "number" ? l.difficulty.toFixed(1) : l.difficulty) + '</div>' +
          '<div style="margin:6px 0 0"><a href="./play.html#play=' + encodeURIComponent(l.slug) + '" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--gold);text-decoration:none;border:1px solid rgba(255,207,51,.4);border-radius:8px;padding:4px 12px">▶ play this level</a></div>' +          '<div class="meta"><span class="diff">' +
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
      ["O", "Egg", "gravity-bound cargo — support below or it cracks"],
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
    Promise.all([
      fetchJSON("./data/runs/" + model + "__" + slug + ".json"),
      fetchJSON("./data/index.json").catch(function () { return null; }),
    ]).then(function (res) {
      renderRun(res[0], res[1]);
    }).catch(function () {
      $("#run-root").innerHTML = '<div class="notice"><span class="n-title">run not found</span>no archived run for <code>' +
        esc(model) + "</code> × <code>" + esc(slug) + "</code>. It may not have been played yet — see the index for coverage.</div>";
    });
  };

  /** BALROG-style progress, mirroring src/lib/wyrm/progress.ts:
   *  60% apples eaten + 25% goal reached + 15% distance closure. */
  function runProgressOf(run) {
    const grid = run.level.grid;
    const applesTotal = (grid.join("").match(/\*/g) || []).length;
    const appleFrac = applesTotal > 0 ? Math.min(1, run.result.applesEaten / applesTotal) : 1;
    const won = run.result.status === "won" ? 1 : 0;
    let closure = 0;
    try {
      let heart = null;
      for (let y = 0; y < grid.length && !heart; y++) {
        const x = grid[y].indexOf("X");
        if (x >= 0) heart = { x: x, y: y };
      }
      const headOf = function (s) {
        if (!s || !s.stateJson) return null;
        const st = JSON.parse(s.stateJson);
        return st.m && st.m[0] ? st.m[0] : null;
      };
      const first = headOf(run.steps[0]);
      const last = headOf(run.steps[run.steps.length - 1]) || first;
      if (heart && first && last) {
        const d0 = Math.abs(first.x - heart.x) + Math.abs(first.y - heart.y);
        const dF = Math.abs(last.x - heart.x) + Math.abs(last.y - heart.y);
        closure = d0 > 0 ? Math.max(0, Math.min(1, 1 - dF / d0)) : 1;
      }
    } catch (e) { /* closure stays 0 */ }
    return Math.round(60 * appleFrac + 25 * won + 15 * closure);
  }

  function renderRun(run, indexData) {
    $("#run-title").textContent = run.model.name + " × " + run.level.name;
    $("#run-crumbs").innerHTML =
      '<a href="./index.html">leaderboard</a> / <span>' + esc(run.model.key) + "</span> / <span>" + esc(run.level.slug) + "</span>";

    // progress + capability strip (BALROG partial credit, SmartPlay tags)
    const applesTotal = (run.level.grid.join("").match(/\*/g) || []).length;
    const progress = runProgressOf(run);
    const capsLevel = indexData && (indexData.levels || []).filter(function (l) { return l.slug === run.level.slug; })[0];
    const capTags = capsLevel && capsLevel.capabilities ? capsLevel.capabilities.tags : [];
    $("#run-status").innerHTML =
      '<span class="verdict ' + esc(run.result.status) + '">' + esc(run.result.status).toUpperCase() + "</span>" +
      ' <span style="color:var(--cream-faint)">· checker ' + esc(run.checker.verdict) +
      " · " + run.result.movesUsed + " moves (par " + run.level.minMoves + ", budget " + run.level.turnLimit + ")" +
      " · deaths " + run.result.deaths + " · attempts " + run.result.attempts +
      " · apples " + run.result.applesEaten + "/" + applesTotal + "</span>" +
      (capTags.length ? ' <span class="run-caps">' + capChips(capTags) + "</span>" : "") +
      '<div class="pbar big" title="progress — 60% apples · 25% goal · 15% distance closure"><i style="width:' +
      Math.max(2, progress) + '%"></i><span>progress ' + progress + "%</span></div>";

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

    // the scrubber must span the whole replay — without this the slider
    // knob sits dead at 0 and dragging does nothing
    $("#scrubber").max = String(Math.max(0, steps.length - 1));
    $("#scrubber").step = "1";

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
            const cls = e.type === "death" || e.type === "spike" || e.type === "egg-crack" ? "bad" : (e.type === "win" || e.type === "ate" ? "good" : "");
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
        case "egg-crack": return "EGG CRACKED — RUN LOST";
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
