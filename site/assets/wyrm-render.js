/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-render.js — the WOIM-faithful board renderer (vanilla)
   Visual DNA extracted from the real game (Steam app 4272020, dogspawn):
   layered soil strata with fossil glyphs, carved dark tunnels, the
   salmon-pink worm (#f09c9c) with a CORAL head segment + saddle, a
   dark tube outline, one googly eye and a tail length badge, and the
   true element set — apples, walnuts, yellow floor buttons, golden
   bar gates, the heart goal, dirt, spikes, valves, ice, bridges,
   locks & keys. Every colour below was lifted from reference material
   (13 official 1920×1080 captures + the owner's build, Nov 2026).
   Exposes: WyrmRender.draw(canvas, st, opts)
            WyrmRender.spriteIcon(canvas, ch, size, opts)
            WyrmRender.THEMES · WyrmRender.themeFor(st)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── soil themes — one per stratum of the world ─────────────────── */
  var THEMES = {
    moss:  { base: "#586248", wave1: "#4a533c", wave2: "#687455",
             glyph: "rgba(50,58,40,0.45)", tunnel: "#1c1b18", ridge: "#282522" },
    grass: { base: "#7a965a", wave1: "#5c733e", wave2: "#8fae6c",
             glyph: "rgba(46,58,30,0.45)", tunnel: "#1e2b18", ridge: "#2a3a20", daisies: true },
    clay:  { base: "#874936", wave1: "#743d2c", wave2: "#9e5640",
             glyph: "rgba(68,30,20,0.45)", tunnel: "#1d1310", ridge: "#2a1a15" },
    sand:  { base: "#9c6b43", wave1: "#7a5032", wave2: "#b07f52",
             glyph: "rgba(60,36,18,0.40)", tunnel: "#3e2723", ridge: "#4d302a" },
    rust:  { base: "#a4443b", wave1: "#732820", wave2: "#b95a4e",
             glyph: "rgba(60,16,12,0.40)", tunnel: "#2b1010", ridge: "#3a1815" },
    slate: { base: "#2b3a42", wave1: "#3e5866", wave2: "#223038",
             glyph: "rgba(200,220,230,0.10)", tunnel: "#11151c", ridge: "#1a2129" },
  };
  var THEME_KEYS = ["moss", "grass", "clay", "sand", "rust", "slate"];

  function themeFor(st) {
    if (st.theme && THEMES[st.theme]) return THEMES[st.theme];
    var h = 0, s = (st.slug || (st.t || "").join("")) + "";
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; }
    return THEMES[THEME_KEYS[h % THEME_KEYS.length]];
  }

  /* ── the worm — salmon body, coral head + saddle, dark rim ─────── */
  var W = {
    body: "#f09c9c",       // salmon-pink (pixel-clustered across captures)
    head: "#ea6a65",       // coral — the head segment IS coral
    saddle: "#ea6a65",     // coral clitellum band on segments 1–3
    outline: "#2b1f1e",    // dark tube outline, like the real game
    eyeWhite: "#ffffff",
    eyeRim: "#2b1c1d",
    pupil: "#0a0a0a",
    gleam: "#ffffff",
    badge: "#ffffff",
    badgeInk: "#111111",
    shadow: "rgba(0,0,0,0.30)",
  };

  var VALVE_DIR = { ">": [1, 0], "<": [-1, 0], "^": [0, -1], "v": [0, 1] };

  function cellRand(x, y, salt) {
    var r = ((x * 73856093) ^ (y * 19349663) ^ ((salt || 0) * 83492791)) & 0x7fffffff;
    return function () { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  }

  function doorsOpen(st) {
    var plates = [];
    for (var y = 0; y < st.h; y++)
      for (var x = 0; x < st.w; x++)
        if (st.t[y][x] === "%") plates.push([x, y]);
    if (!plates.length) return true;
    var occ = occupied(st);
    for (var i = 0; i < plates.length; i++)
      if (!occ.has(plates[i][0] + "," + plates[i][1])) return false;
    return true;
  }
  function occupied(st) {
    var s = new Set();
    (st.c || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    (st.r || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    (st.m || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    return s;
  }

  /* ── main draw ──────────────────────────────────────────────────── */
  function draw(canvas, st, opts) {
    opts = opts || {};
    var cell = opts.cell || 40;
    var pad = opts.pad != null ? opts.pad : Math.round(cell * 0.55);
    var t = opts.t || 0;                       // ms clock; 0 → still frame
    var th = themeFor(st);
    var w = st.w * cell + pad * 2;
    var h = st.h * cell + pad * 2;
    var dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.aspectRatio = w + " / " + h;
    }
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    drawSoil(g, w, h, th, cell, st);
    drawTunnels(g, st, cell, pad, th);
    drawTerrain(g, st, cell, pad, th, t);
    drawEntities(g, st, cell, pad, t);
    drawWorm(g, st.m || [], cell, pad, t);
    drawFrame(g, w, h, cell, pad, th);

    if (st.s === "dead") {
      g.fillStyle = "rgba(10,8,6,0.35)"; g.fillRect(0, 0, w, h);
    } else if (st.s === "won") {
      var gl = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.62);
      gl.addColorStop(0, "rgba(255,150,190,0.30)");
      gl.addColorStop(1, "rgba(255,150,190,0)");
      g.fillStyle = gl; g.fillRect(0, 0, w, h);
      drawHeartsBurst(g, w, h, t);
    }
    return { width: w, height: h, cell: cell, pad: pad };
  }

  /* ── the underground: layered strata with fossil glyphs ─────────── */
  function drawSoil(g, w, h, th, cell, st) {
    g.fillStyle = th.base;
    g.fillRect(0, 0, w, h);

    var waveH = cell * 1.6, waveL = cell * 6.0, amp = cell * 0.55;
    // two alternating bands of darker / lighter earth
    for (var pass = 0; pass < 2; pass++) {
      g.fillStyle = pass === 0 ? th.wave1 : th.wave2;
      var step = waveH * 2.1, phase = pass * waveH;
      for (var y = -waveH + phase; y < h + waveH * 2; y += step) {
        g.beginPath();
        g.moveTo(0, y);
        for (var x = 0; x <= w + 40; x += 28) {
          g.lineTo(x, y + Math.sin((x / waveL) * Math.PI * 2 + pass * 1.7) * amp);
        }
        g.lineTo(w, y + waveH * 0.55);
        for (x = w; x >= 0; x -= 28) {
          g.lineTo(x, y + waveH * 0.55 + Math.sin((x / waveL) * Math.PI * 2 + pass * 1.7) * amp);
        }
        g.closePath();
        g.fill();
      }
    }

    // fossil glyphs — spirals, fishbones, insect trails, daisies
    var gw = cell * 3.6, gh = cell * 3.0;
    var cols = Math.ceil(w / gw) + 1, rows = Math.ceil(h / gh) + 1;
    g.lineCap = "round";
    for (var c2 = 0; c2 < cols; c2++) {
      for (var r2 = 0; r2 < rows; r2++) {
        var rnd = cellRand(c2, r2, 77);
        if (rnd() > 0.62) continue;
        var gx = c2 * gw + rnd() * gw * 0.7;
        var gy = r2 * gh + rnd() * gh * 0.7;
        var kind = Math.floor(rnd() * (th.daisies ? 4 : 3));
        g.save(); g.translate(gx, gy);
        if (kind === 0) {                       // ammonite spiral
          g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.5, cell * 0.05);
          g.beginPath();
          var turns = 2.2, rr = cell * 0.30;
          for (var a = 0; a < turns * Math.PI * 2; a += 0.25) {
            var rad = rr * (a / (turns * Math.PI * 2));
            var px = Math.cos(a) * rad, py = Math.sin(a) * rad;
            a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
          }
          g.stroke();
        } else if (kind === 1) {                // fishbone
          g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.4, cell * 0.045);
          g.beginPath();
          g.moveTo(-cell * 0.28, 0); g.lineTo(cell * 0.28, 0);
          g.moveTo(-cell * 0.10, -cell * 0.16); g.lineTo(-cell * 0.02, 0);
          g.moveTo(-cell * 0.10, cell * 0.16); g.lineTo(-cell * 0.02, 0);
          g.moveTo(cell * 0.08, -cell * 0.16); g.lineTo(cell * 0.16, 0);
          g.moveTo(cell * 0.08, cell * 0.16); g.lineTo(cell * 0.16, 0);
          g.stroke();
        } else if (kind === 2) {                // insect trail
          g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.2, cell * 0.04);
          g.beginPath(); g.arc(0, 0, cell * 0.05, 0, Math.PI * 2); g.stroke();
          g.beginPath();
          g.moveTo(-cell * 0.18, -cell * 0.10); g.lineTo(-cell * 0.05, 0);
          g.moveTo(cell * 0.18, -cell * 0.10); g.lineTo(cell * 0.05, 0);
          g.stroke();
        } else {                                // daisy (garden strata)
          g.fillStyle = "rgba(250,246,230,0.75)";
          for (var p = 0; p < 6; p++) {
            var an = (p / 6) * Math.PI * 2;
            g.beginPath();
            g.ellipse(Math.cos(an) * cell * 0.11, Math.sin(an) * cell * 0.11,
              cell * 0.075, cell * 0.045, an, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = "#f4c430";
          g.beginPath(); g.arc(0, 0, cell * 0.055, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
    }
    void st;
  }

  /* ── carved tunnels — dark earth with a soft inner ridge ────────── */
  function drawTunnels(g, st, cell, pad, th) {
    var i, x, y;
    var at = function (x2, y2) {
      return x2 >= 0 && y2 >= 0 && y2 < st.h && x2 < st.w ? st.t[y2][x2] : "#";
    };
    for (y = 0; y < st.h; y++) {
      for (x = 0; x < st.w; x++) {
        if (at(x, y) === "#") continue;
        var px = pad + x * cell, py = pad + y * cell;
        g.fillStyle = th.tunnel;
        g.fillRect(px - 1, py - 1, cell + 2, cell + 2);
        // inner strata ridge
        g.fillStyle = th.ridge;
        g.fillRect(px, py + cell * 0.36, cell, cell * 0.27);
      }
    }
    // organic carved edge against the soil
    g.strokeStyle = "rgba(12,9,6,0.85)";
    g.lineWidth = Math.max(3, cell * 0.11);
    g.lineCap = "round";
    for (y = 0; y < st.h; y++) {
      for (x = 0; x < st.w; x++) {
        if (at(x, y) === "#") continue;
        var px2 = pad + x * cell, py2 = pad + y * cell;
        if (at(x, y - 1) === "#") line(g, px2, py2, px2 + cell, py2);
        if (at(x, y + 1) === "#") line(g, px2, py2 + cell, px2 + cell, py2 + cell);
        if (at(x - 1, y) === "#") line(g, px2, py2, px2, py2 + cell);
        if (at(x + 1, y) === "#") line(g, px2 + cell, py2, px2 + cell, py2 + cell);
      }
    }
  }
  function line(g, x1, y1, x2, y2) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }

  /* ── terrain pieces ─────────────────────────────────────────────── */
  function drawTerrain(g, st, cell, pad, th, t) {
    var open = doorsOpen(st);
    var occupiedSet = occupied(st);
    for (var y = 0; y < st.h; y++) {
      for (var x = 0; x < st.w; x++) {
        var ch = st.t[y][x];
        var px = pad + x * cell, py = pad + y * cell;
        var cx = px + cell / 2, cy = py + cell / 2;
        if (ch === "+") drawDirt(g, px, py, cell, x, y);
        else if (ch === "%") drawButton(g, cx, cy, cell, occupiedSet.has(x + "," + y));
        else if (ch === "D") drawGate(g, px, py, cell, open);
        else if (ch === "X") drawHeartGoal(g, cx, cy, cell, t, x, y);
        else if (ch === "~") drawSpikes(g, px, py, cell, x, y);
        else if (ch === "_") drawIce(g, px, py, cell, x, y);
        else if (ch === "=") drawBridge(g, px, py, cell, x, y);
        else if (ch === "L") drawLock(g, cx, cy, cell);
        else if (VALVE_DIR[ch]) drawValve(g, cx, cy, cell, ch);
      }
    }
    void th;
  }

  /* dirt — the soft diggable earth block, lifted from the real game */
  function drawDirt(g, px, py, cell, x, y) {
    var rnd = cellRand(x, y, 5);
    var inset = cell * 0.06;
    var x0 = px + inset, y0 = py + inset, s = cell - inset * 2;
    var grad = g.createLinearGradient(x0, y0, x0, y0 + s);
    grad.addColorStop(0, "#9a7648");
    grad.addColorStop(0.55, "#7d5c34");
    grad.addColorStop(1, "#5f4426");
    roundRect(g, x0, y0, s, s, cell * 0.18);
    g.fillStyle = grad; g.fill();
    g.strokeStyle = "#4a3420"; g.lineWidth = 2; g.stroke();
    g.save();
    roundRect(g, x0, y0, s, s, cell * 0.18); g.clip();
    // pebbles + roots in the fresh earth
    for (var i = 0; i < 5; i++) {
      var bx = x0 + s * (0.15 + rnd() * 0.7), by = y0 + s * (0.15 + rnd() * 0.7);
      var br = s * (0.05 + rnd() * 0.06);
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2);
      g.fillStyle = rnd() > 0.5 ? "rgba(210,180,130,0.5)" : "rgba(58,42,24,0.5)";
      g.fill();
    }
    g.strokeStyle = "rgba(46,32,16,0.6)"; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x0 + s * 0.1, y0 + s * 0.35);
    g.quadraticCurveTo(x0 + s * 0.5, y0 + s * 0.5, x0 + s * 0.92, y0 + s * 0.3);
    g.stroke();
    g.restore();
  }

  /* the yellow floor button — press it with body or walnut */
  function drawButton(g, cx, cy, cell, pressed) {
    var rx = cell * 0.36, ry = cell * (pressed ? 0.20 : 0.30);
    var oy = pressed ? cell * 0.06 : 0;
    // rim
    g.beginPath();
    g.ellipse(cx, cy + oy, rx * 1.12, ry * 1.35 + cell * 0.04, 0, 0, Math.PI * 2);
    g.fillStyle = "#b88914"; g.fill();
    // platter
    g.beginPath();
    g.ellipse(cx, cy + oy - cell * 0.02, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = pressed ? "#e6b422" : "#ffcf33";
    g.fill();
    g.strokeStyle = "#b88914"; g.lineWidth = 2; g.stroke();
    // shine
    g.beginPath();
    g.ellipse(cx - rx * 0.25, cy + oy - ry * 0.55, rx * 0.42, ry * 0.32, -0.3, 0, Math.PI * 2);
    g.fillStyle = pressed ? "rgba(255,238,150,0.55)" : "#ffea75";
    g.fill();
  }

  /* the golden gate — bars when sealed, a glowing portal when open */
  function drawGate(g, px, py, cell, open) {
    var cx = px + cell / 2, cy = py + cell / 2;
    if (open) {
      var grad = g.createRadialGradient(cx, cy, cell * 0.05, cx, cy, cell * 0.62);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.45, "#fce570");
      grad.addColorStop(1, "#e8b630");
      roundRect(g, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.16);
      g.fillStyle = grad; g.fill();
      g.strokeStyle = "#b88914"; g.lineWidth = 2; g.stroke();
      return;
    }
    // sealed: dark chamber with golden bars
    g.fillStyle = "#161310";
    g.fillRect(px, py, cell, cell);
    g.fillStyle = "#d99f18";
    var n = 3, bw = cell * 0.13;
    for (var i = 0; i < n; i++) {
      var bx = px + cell * (0.5 + (i - 1) * 0.27) - bw / 2;
      g.fillRect(bx, py + cell * 0.08, bw, cell * 0.84);
      g.fillStyle = "#fce570";
      g.fillRect(bx + bw * 0.18, py + cell * 0.10, bw * 0.3, cell * 0.78);
      g.fillStyle = "#d99f18";
    }
    g.strokeStyle = "#8a6210"; g.lineWidth = 2;
    g.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
  }

  /* the heart goal — “WOIM IN LOVE!” */
  function drawHeartGoal(g, cx, cy, cell, t, x, y) {
    var size = cell * 0.42;
    var bob = t ? Math.sin(t * 0.003 + x) * cell * 0.05 : 0;
    var pulse = t ? 1 + Math.sin(t * 0.005) * 0.05 : 1;
    g.save();
    g.translate(cx, cy + bob);
    g.scale(pulse, pulse);
    // glow
    var gl = g.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.8);
    gl.addColorStop(0, "rgba(255,105,160,0.35)");
    gl.addColorStop(1, "rgba(255,105,160,0)");
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, size * 1.8, 0, Math.PI * 2); g.fill();
    // heart body
    g.beginPath();
    g.moveTo(0, size * 0.38);
    g.bezierCurveTo(-size * 0.95, -size * 0.28, -size * 0.72, -size * 1.02, 0, -size * 0.42);
    g.bezierCurveTo(size * 0.72, -size * 1.02, size * 0.95, -size * 0.28, 0, size * 0.38);
    g.fillStyle = "#ff3377"; g.fill();
    g.strokeStyle = "#d11a58"; g.lineWidth = 2; g.stroke();
    // shine
    g.fillStyle = "#ffb3cc";
    g.beginPath(); g.arc(-size * 0.3, -size * 0.38, size * 0.13, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(size * 0.34, -size * 0.05, size * 0.08, 0, Math.PI * 2); g.fill();
    g.restore();
    // orbiting sparkles
    g.fillStyle = "#ffd1e0";
    for (var i = 0; i < 3; i++) {
      var an = (t ? t * 0.002 : x * 2.1) + (i * Math.PI * 2) / 3;
      var sx = cx + Math.cos(an) * size * 0.95;
      var sy = cy + bob + Math.sin(an) * size * 0.95;
      g.beginPath();
      g.moveTo(sx, sy - 3.2); g.lineTo(sx + 1.6, sy - 1.1); g.lineTo(sx + 3.2, sy - 3.2);
      g.lineTo(sx + 1.1, sy + 0.4); g.lineTo(sx + 3.2, sy + 2.2); g.lineTo(sx, sy + 1.2);
      g.lineTo(sx - 3.2, sy + 2.2); g.lineTo(sx - 1.1, sy + 0.4); g.lineTo(sx - 3.2, sy - 3.2);
      g.lineTo(sx - 1.6, sy - 1.1);
      g.closePath(); g.fill();
    }
  }

  /* spikes — the one hazard, cartoon steel */
  function drawSpikes(g, px, py, cell, x, y) {
    var rnd = cellRand(x, y, 9);
    // base plate
    roundRect(g, px + cell * 0.08, py + cell * 0.72, cell * 0.84, cell * 0.16, cell * 0.05);
    g.fillStyle = "#4a4a52"; g.fill();
    g.strokeStyle = "#26262c"; g.lineWidth = 1.5; g.stroke();
    // three rounded teeth
    var tips = [0.26, 0.5, 0.74];
    for (var i = 0; i < tips.length; i++) {
      var tx = px + cell * tips[i];
      var ty = py + cell * (0.30 + rnd() * 0.08);
      var hw = cell * 0.085;
      g.beginPath();
      g.moveTo(tx - hw, py + cell * 0.74);
      g.quadraticCurveTo(tx - hw, ty + cell * 0.12, tx, ty);
      g.quadraticCurveTo(tx + hw, ty + cell * 0.12, tx + hw, py + cell * 0.74);
      g.closePath();
      var mg = g.createLinearGradient(tx - hw, 0, tx + hw, 0);
      mg.addColorStop(0, "#aab3bd"); mg.addColorStop(0.5, "#6d7681"); mg.addColorStop(1, "#454c55");
      g.fillStyle = mg; g.fill();
      g.strokeStyle = "#26262c"; g.lineWidth = 1.4; g.stroke();
    }
  }

  /* one-way valve — a wooden sign with a white chevron */
  function drawValve(g, cx, cy, cell, ch) {
    var d = VALVE_DIR[ch];
    roundRect(g, cx - cell * 0.36, cy - cell * 0.36, cell * 0.72, cell * 0.72, cell * 0.16);
    g.fillStyle = "#543b2d"; g.fill();
    g.strokeStyle = "#3a291e"; g.lineWidth = 2; g.stroke();
    roundRect(g, cx - cell * 0.28, cy - cell * 0.28, cell * 0.56, cell * 0.56, cell * 0.12);
    g.fillStyle = "#6b4c38"; g.fill();
    // chevron arrow
    var ax = d[0], ay = d[1];
    g.strokeStyle = "#fdeccc"; g.lineWidth = Math.max(2.5, cell * 0.09);
    g.lineCap = "round"; g.lineJoin = "round";
    var s = cell * 0.2;
    g.beginPath();
    g.moveTo(cx - ax * s - ay * s * 0.85, cy - ay * s + ax * s * 0.85);
    g.lineTo(cx + ax * s * 0.9, cy + ay * s * 0.9);
    g.lineTo(cx - ax * s + ay * s * 0.85, cy - ay * s - ax * s * 0.85);
    g.stroke();
  }

  /* ice — frictionless frost */
  function drawIce(g, px, py, cell, x, y) {
    var rnd = cellRand(x, y, 11);
    roundRect(g, px + 1.5, py + 1.5, cell - 3, cell - 3, cell * 0.14);
    var ig = g.createLinearGradient(px, py, px + cell, py + cell);
    ig.addColorStop(0, "#e8f7fe"); ig.addColorStop(0.5, "#c7e9f8"); ig.addColorStop(1, "#a5d8ef");
    g.fillStyle = ig; g.fill();
    g.strokeStyle = "#7fb8d4"; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(px + cell * 0.14, py + cell * 0.8); g.lineTo(px + cell * 0.14, py + cell * 0.2);
    g.lineTo(px + cell * 0.44, py + cell * 0.2);
    g.stroke();
    // frost crystals
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (var i = 0; i < 3; i++) {
      var gx = px + cell * (0.25 + rnd() * 0.5), gy = py + cell * (0.3 + rnd() * 0.45);
      var gr = cell * 0.045;
      g.beginPath();
      for (var k = 0; k < 6; k++) {
        var an = (k / 6) * Math.PI * 2;
        var rr = k % 2 === 0 ? gr * 1.7 : gr * 0.6;
        k === 0 ? g.moveTo(gx + Math.cos(an) * rr, gy + Math.sin(an) * rr)
                : g.lineTo(gx + Math.cos(an) * rr, gy + Math.sin(an) * rr);
      }
      g.closePath(); g.fill();
    }
  }

  /* crumbling bridge — warm planks */
  function drawBridge(g, px, py, cell, x, y) {
    var planks = 4, pw = (cell - 4) / planks;
    for (var i = 0; i < planks; i++) {
      var bx = px + 2 + i * pw;
      g.fillStyle = i % 2 === 0 ? "#a07a48" : "#8d6a3d";
      roundRect(g, bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68, 2);
      g.fill();
      g.strokeStyle = "#6b4c28"; g.lineWidth = 1; g.stroke();
      // nail
      g.fillStyle = "#4a3a22";
      g.beginPath(); g.arc(bx + pw / 2, py + cell * 0.5, cell * 0.03, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = "#5f4426"; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(px + 2, py + cell * 0.16); g.lineTo(px + cell - 2, py + cell * 0.16);
    g.moveTo(px + 2, py + cell * 0.84); g.lineTo(px + cell - 2, py + cell * 0.84);
    g.stroke();
    void x; void y;
  }

  /* the padlock — needs a key */
  function drawLock(g, cx, cy, cell) {
    var s = cell * 0.32;
    // shackle
    g.beginPath();
    g.arc(cx, cy - s * 0.55, s * 0.62, Math.PI, Math.PI * 2);
    g.strokeStyle = "#8a6210"; g.lineWidth = Math.max(3, cell * 0.08);
    g.stroke();
    // body
    roundRect(g, cx - s, cy - s * 0.35, s * 2, s * 1.55, s * 0.3);
    var lg = g.createLinearGradient(cx, cy - s * 0.35, cx, cy + s * 1.2);
    lg.addColorStop(0, "#f2c232"); lg.addColorStop(1, "#c9920f");
    g.fillStyle = lg; g.fill();
    g.strokeStyle = "#8a6210"; g.lineWidth = 2; g.stroke();
    // keyhole
    g.fillStyle = "#6b4a08";
    g.beginPath(); g.arc(cx, cy + s * 0.28, s * 0.2, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - s * 0.07, cy + s * 0.28, s * 0.14, s * 0.5);
  }

  /* ── entities ───────────────────────────────────────────────────── */
  function drawEntities(g, st, cell, pad, t) {
    (st.k || []).forEach(function (p) {
      drawKey(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell, t, p.x);
    });
    (st.a || []).forEach(function (p, i) {
      drawApple(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell * 0.42, t ? t * 0.003 + i * 1.3 : i * 1.3);
    });
    (st.c || []).forEach(function (p) {
      drawWalnut(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell * 0.40, p.x, p.y);
    });
    (st.r || []).forEach(function (p) {
      drawSleeper(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell);
    });
    (st.e || []).forEach(function (p, i) {
      var carried = (st.m || []).some(function (w) { return w.x === p.x && w.y === p.y + 1; });
      drawEgg(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell + cell * 0.08, cell * 0.34, i, carried, t);
    });
  }

  /* the egg — precious cargo; wobbles nervously while the worm carries it */
  function drawEgg(g, cx, cy, r, seed, carried, t) {
    var now = t || 0;
    var wobble = carried ? Math.sin(now * 0.012 + seed * 2.1) * r * 0.1 : Math.sin(now * 0.002 + seed) * r * 0.02;
    var rnd = cellRand(seed, 7, 33);
    g.save();
    g.translate(cx, cy);
    g.rotate(wobble * 0.3);
    g.fillStyle = "rgba(0,0,0,0.26)";
    g.beginPath(); g.ellipse(0, r * 1.0, r * 0.66, r * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.78, -r * 0.86, r * 0.86, r * 0.42, 0, r);
    g.bezierCurveTo(-r * 0.86, r * 0.42, -r * 0.78, -r * 0.86, 0, -r);
    var eg = g.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.1, 0, 0, r * 1.05);
    eg.addColorStop(0, "#ffffff"); eg.addColorStop(0.7, "#f7f1e6"); eg.addColorStop(1, "#e8dcc6");
    g.fillStyle = eg; g.fill();
    g.strokeStyle = "#8a7a66"; g.lineWidth = Math.max(1.6, r * 0.11); g.stroke();
    g.fillStyle = "rgba(190,168,132,0.55)";
    for (var i = 0; i < 5; i++) {
      var sx = (rnd() - 0.5) * r * 1.1, sy = (rnd() - 0.5) * r * 1.3;
      if (Math.hypot(sx / (r * 0.62), sy / (r * 0.9)) < 0.82) {
        g.beginPath(); g.ellipse(sx, sy, r * 0.09, r * 0.07, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath(); g.ellipse(-r * 0.3, -r * 0.36, r * 0.16, r * 0.26, -0.35, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  /* the apple — glossy red with a leaf, straight from the orchard */
  function drawApple(g, cx, cy, r, t, seed) {
    var bob = t ? Math.sin(t * 2.2 + seed) * r * 0.06 : 0;
    g.save();
    g.translate(cx, cy + bob);
    // shadow
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.beginPath(); g.ellipse(0, r * 0.95, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); g.fill();
    // stem
    g.strokeStyle = "#6b4226"; g.lineWidth = Math.max(2, r * 0.14); g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.08, -r * 1.05); g.stroke();
    // body
    g.beginPath();
    g.moveTo(0, -r * 0.42);
    g.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.12, r * 0.62, 0, r * 0.98);
    g.bezierCurveTo(-r * 1.12, r * 0.62, -r * 0.95, -r * 0.95, 0, -r * 0.42);
    g.fillStyle = "#e82f3a"; g.fill();
    g.strokeStyle = "#9c1c24"; g.lineWidth = 2; g.stroke();
    // shine
    g.fillStyle = "#ff878f";
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.25, r * 0.24, r * 0.14, -0.4, 0, Math.PI * 2); g.fill();
    // leaf
    g.fillStyle = "#5fb833";
    g.beginPath(); g.ellipse(r * 0.28, -r * 0.78, r * 0.32, r * 0.16, 0.6, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  /* the walnut — the game's pushable boulder */
  function drawWalnut(g, cx, cy, r, x, y) {
    var rnd = cellRand(x, y, 21);
    // shadow
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.beginPath(); g.ellipse(cx, cy + r * 0.9, r * 0.75, r * 0.24, 0, 0, Math.PI * 2); g.fill();
    // shell
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    var wg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
    wg.addColorStop(0, "#dda15e"); wg.addColorStop(0.65, "#c48957"); wg.addColorStop(1, "#9a683c");
    g.fillStyle = wg; g.fill();
    g.strokeStyle = "#7a4f28"; g.lineWidth = 2.2; g.stroke();
    // seam + bumps
    g.strokeStyle = "rgba(122,79,40,0.85)"; g.lineWidth = 1.6; g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - r * 0.42, cy - r * 0.52);
    g.quadraticCurveTo(cx + r * 0.1, cy + r * 0.1, cx - r * 0.18, cy + r * 0.62);
    g.stroke();
    for (var i = 0; i < 4; i++) {
      var bx = cx + (rnd() - 0.5) * r * 1.1, by = cy + (rnd() - 0.5) * r * 1.1;
      if (Math.hypot(bx - cx, by - cy) < r * 0.72) {
        g.beginPath(); g.arc(bx, by, r * 0.1, 0, Math.PI * 2);
        g.fillStyle = "rgba(122,79,40,0.35)"; g.fill();
      }
    }
  }

  /* the key */
  function drawKey(g, cx, cy, cell, t, seed) {
    var r = cell * 0.19;
    var bob = t ? Math.sin(t * 0.0028 + seed) * cell * 0.04 : 0;
    g.save();
    g.translate(cx, cy + bob);
    g.rotate(-0.6);
    g.strokeStyle = "#8a6210"; g.lineWidth = Math.max(3, cell * 0.10); g.lineCap = "round";
    g.beginPath(); g.arc(-cell * 0.13, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-cell * 0.13 + r, 0); g.lineTo(cell * 0.2, 0); g.stroke();
    g.beginPath();
    g.moveTo(cell * 0.2, 0); g.lineTo(cell * 0.2, cell * 0.1);
    g.moveTo(cell * 0.12, 0); g.lineTo(cell * 0.12, cell * 0.08);
    g.stroke();
    g.strokeStyle = "#f2c232"; g.lineWidth = Math.max(1.8, cell * 0.05);
    g.beginPath(); g.arc(-cell * 0.13, 0, r, -0.6, Math.PI * 1.4); g.stroke();
    g.restore();
  }

  /* a dropped half — a sleeping friend (“once part of you”) */
  function drawSleeper(g, cx, cy, cell) {
    var r = cell * 0.34;
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath(); g.ellipse(cx, cy + r * 0.8, r * 0.9, r * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx, cy, r + Math.max(1.2, r * 0.1), 0, Math.PI * 2);
    g.fillStyle = W.outline; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = W.body; g.fill();
    // closed sleeping eye
    g.strokeStyle = "#5c2a34"; g.lineWidth = Math.max(1.8, cell * 0.05); g.lineCap = "round";
    g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // tiny breath bubble
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath(); g.arc(cx + r * 0.55, cy - r * 0.55, r * 0.14, 0, Math.PI * 2); g.fill();
  }

  /* ── THE WORM — salmon tube, coral head + saddle, dark outline ──── */
  function drawWorm(g, cells, cell, pad, t) {
    if (!cells.length) return;
    var pts = cells.map(function (p) {
      return { x: pad + (p.x + 0.5) * cell, y: pad + (p.y + 0.5) * cell };
    });
    var wdt = cell * 0.72;
    var ol = Math.max(1.6, cell * 0.045); // dark outline width

    // ground shadow
    g.save();
    g.strokeStyle = W.shadow;
    g.lineWidth = wdt * 0.92;
    g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y + cell * 0.14);
    for (var i0 = 1; i0 < pts.length; i0++) g.lineTo(pts[i0].x, pts[i0].y + cell * 0.14);
    if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y + cell * 0.14);
    g.stroke();
    g.restore();

    g.lineCap = "round"; g.lineJoin = "round";

    // pass 1 — the dark outline under the whole tube (the game has one)
    g.strokeStyle = W.outline;
    g.lineWidth = wdt + ol * 2;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var i1 = 1; i1 < pts.length; i1++) g.lineTo(pts[i1].x, pts[i1].y);
    if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y);
    g.stroke();

    // pass 2 — colored tube: head is coral; saddle on 1–3; body salmon
    var segColor = function (i) { return i <= 3 ? W.saddle : W.body; };
    for (var j = pts.length - 1; j > 0; j--) {
      g.strokeStyle = segColor(j - 1);
      g.lineWidth = wdt;
      g.beginPath();
      g.moveTo(pts[j].x, pts[j].y);
      g.lineTo(pts[j - 1].x, pts[j - 1].y);
      g.stroke();
    }

    // pass 3 — knuckle joints, each with its dark ring
    for (var k = pts.length - 1; k >= 0; k--) {
      var r = wdt / 2;
      g.beginPath(); g.arc(pts[k].x, pts[k].y, r + ol, 0, Math.PI * 2);
      g.fillStyle = W.outline; g.fill();
      g.beginPath(); g.arc(pts[k].x, pts[k].y, r, 0, Math.PI * 2);
      g.fillStyle = segColor(k); g.fill();
    }

    // pass 4 — soft top light
    g.strokeStyle = "rgba(255,235,240,0.32)";
    g.lineWidth = wdt * 0.16;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y - wdt * 0.22);
    for (var m = 1; m < pts.length; m++) g.lineTo(pts[m].x, pts[m].y - wdt * 0.22);
    g.stroke();

    // look direction (head → neck)
    var dx = 1, dy = 0;
    if (pts.length > 1) {
      dx = pts[0].x - pts[1].x; dy = pts[0].y - pts[1].y;
      var mm = Math.hypot(dx, dy) || 1; dx /= mm; dy /= mm;
    }

    // tail badge — the length counter, like the real game
    if (pts.length >= 4) {
      var tail = pts[pts.length - 1];
      g.beginPath(); g.arc(tail.x, tail.y, cell * 0.24, 0, Math.PI * 2);
      g.fillStyle = W.badge; g.fill();
      g.strokeStyle = "#222222"; g.lineWidth = 2; g.stroke();
      g.fillStyle = W.badgeInk;
      g.font = "700 " + Math.floor(cell * 0.27) + "px Fredoka, 'Trebuchet MS', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(pts.length), tail.x, tail.y + 1);
    }

    // the head — one big googly eye
    var head = pts[0];
    var er = cell * 0.26;
    // blink cycle
    var blink = t ? (Math.sin(t * 0.0016 + 1.7) > 0.965 ? 0.12 : 1) : 1;
    g.beginPath(); g.arc(head.x, head.y, er, 0, Math.PI * 2);
    g.fillStyle = W.eyeWhite; g.fill();
    g.strokeStyle = W.eyeRim; g.lineWidth = Math.max(2, cell * 0.055); g.stroke();
    if (blink < 1) {
      g.strokeStyle = "#1a1a1a"; g.lineWidth = Math.max(2, cell * 0.06);
      g.beginPath();
      g.moveTo(head.x - er * 0.7, head.y); g.lineTo(head.x + er * 0.7, head.y);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(head.x + dx * er * 0.35, head.y + dy * er * 0.35, er * 0.52, 0, Math.PI * 2);
      g.fillStyle = W.pupil; g.fill();
      g.beginPath();
      g.arc(head.x + dx * er * 0.35 - er * 0.16, head.y + dy * er * 0.35 - er * 0.16, er * 0.17, 0, Math.PI * 2);
      g.fillStyle = W.gleam; g.fill();
    }
  }

  /* win confetti — tiny hearts */
  function drawHeartsBurst(g, w, h, t) {
    g.fillStyle = "rgba(255,120,170,0.9)";
    for (var i = 0; i < 7; i++) {
      var ph = t * 0.001 + i * 0.9;
      var yy = h * 0.3 + ((ph * 60 + i * 47) % (h * 0.5));
      var xx = w * (0.2 + 0.6 * ((i * 0.37 + ph * 0.1) % 1));
      var s = 3 + (i % 3);
      g.save(); g.translate(xx, yy); g.rotate(Math.sin(ph) * 0.4);
      g.beginPath();
      g.moveTo(0, s);
      g.bezierCurveTo(-s * 1.2, -s * 0.4, -s * 0.7, -s * 1.3, 0, -s * 0.5);
      g.bezierCurveTo(s * 0.7, -s * 1.3, s * 1.2, -s * 0.4, 0, s);
      g.fill();
      g.restore();
    }
  }

  /* ── frame — a soft game-card edge ─────────────────────────────── */
  function drawFrame(g, w, h, cell, pad, th) {
    var r = cell * 0.45;
    g.beginPath();
    roundRect(g, pad - cell * 0.18, pad - cell * 0.18,
      w - pad * 2 + cell * 0.36, h - pad * 2 + cell * 0.36, r);
    g.strokeStyle = "rgba(15,10,7,0.55)";
    g.lineWidth = Math.max(3, cell * 0.10);
    g.stroke();
    // vignette
    var vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.74);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.16)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    void th;
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ── spriteIcon — one element as a real mini game tile ──────────── */
  function spriteIcon(canvas, ch, size, opts) {
    opts = opts || {};
    var dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";
    }
    var g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    var th = opts.theme || THEMES.moss;
    var cx = size / 2, cy = size / 2;
    if (ch === "#") { drawSoilTileIcon(g, size, th, opts.seed || 0); return; }
    drawTunnelTileIcon(g, size, th);
    switch (ch) {
      case "+": drawDirt(g, 0, 0, size, opts.seed || 0, 1); break;
      case "%": drawButton(g, cx, cy, size, !!opts.pressed); break;
      case "D": drawGate(g, 0, 0, size, !!opts.open); break;
      case "X": drawHeartGoal(g, cx, cy, size, opts.t || 0, opts.seed || 0); break;
      case "~": drawSpikes(g, 0, 0, size, opts.seed || 0, 1); break;
      case "_": drawIce(g, 0, 0, size, opts.seed || 0, 1); break;
      case "=": drawBridge(g, 0, 0, size); break;
      case "L": drawLock(g, cx, cy, size); break;
      case ">": case "<": case "^": case "v": drawValve(g, cx, cy, size, ch); break;
      case "*": drawApple(g, cx, cy, size * 0.42, opts.t || 0, opts.seed || 0); break;
      case "$": drawWalnut(g, cx, cy, size * 0.40, opts.seed || 0, 1); break;
      case "k": drawKey(g, cx, cy, size, opts.t || 0, opts.seed || 0); break;
      case "O": drawEgg(g, cx, cy + size * 0.08, size * 0.34, (opts.seed || 0) % 9, false, opts.t || 0); break;
      case "@": drawWormHeadIcon(g, cx, cy, size); break;
      case "o": drawWormBodyIcon(g, cx, cy, size); break;
      default: break;
    }
  }

  function drawSoilTileIcon(g, size, th, seed) {
    g.fillStyle = th.base;
    g.fillRect(0, 0, size, size);
    var rnd = cellRand(seed, 3, 77);
    var y0 = size * (0.22 + rnd() * 0.4);
    var amp = size * 0.10, ph = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, y0);
    for (var x = 0; x <= size; x += size / 8) g.lineTo(x, y0 + Math.sin((x / size) * Math.PI * 2 + ph) * amp);
    g.lineTo(size, y0 + size * 0.26);
    for (var x2 = size; x2 >= 0; x2 -= size / 8) g.lineTo(x2, y0 + size * 0.26 + Math.sin((x2 / size) * Math.PI * 2 + ph) * amp);
    g.closePath();
    g.fillStyle = rnd() > 0.5 ? th.wave1 : th.wave2;
    g.fill();
    g.save();
    g.translate(size * (0.3 + rnd() * 0.4), size * (0.62 + rnd() * 0.2));
    g.strokeStyle = th.glyph;
    g.lineWidth = Math.max(1.2, size * 0.045);
    g.lineCap = "round";
    g.beginPath();
    var turns = 1.9, rr = size * 0.16;
    for (var a = 0; a < turns * Math.PI * 2; a += 0.3) {
      var rad = rr * (a / (turns * Math.PI * 2));
      var px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.stroke();
    g.restore();
  }

  function drawTunnelTileIcon(g, size, th) {
    g.fillStyle = th.tunnel;
    g.fillRect(0, 0, size, size);
    g.fillStyle = th.ridge;
    g.fillRect(0, size * 0.36, size, size * 0.27);
    g.strokeStyle = "rgba(12,9,6,0.85)";
    g.lineWidth = Math.max(2.5, size * 0.10);
    g.lineCap = "round";
    g.beginPath(); g.moveTo(1, 1); g.lineTo(size - 1, 1); g.stroke();
    g.beginPath(); g.moveTo(1, 1); g.lineTo(1, size - 1); g.stroke();
    g.beginPath(); g.moveTo(size - 1, size - 1); g.lineTo(1, size - 1); g.stroke();
    g.beginPath(); g.moveTo(size - 1, size - 1); g.lineTo(size - 1, 1); g.stroke();
  }

  function drawWormDiscIcon(g, cx, cy, r, color) {
    g.beginPath(); g.arc(cx, cy, r + Math.max(1.4, r * 0.10), 0, Math.PI * 2);
    g.fillStyle = W.outline; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.beginPath(); g.ellipse(cx, cy - r * 0.42, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,235,240,0.30)"; g.fill();
  }

  function drawWormHeadIcon(g, cx, cy, size) {
    var r = size * 0.37;
    var neck = { x: cx - size * 0.52, y: cy };
    g.lineCap = "round";
    g.strokeStyle = W.outline;
    g.lineWidth = r * 2 + Math.max(2.4, r * 0.2);
    g.beginPath(); g.moveTo(neck.x, neck.y); g.lineTo(cx, cy); g.stroke();
    g.strokeStyle = W.head;
    g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(neck.x, neck.y); g.lineTo(cx, cy); g.stroke();
    drawWormDiscIcon(g, neck.x, neck.y, r * 0.94, W.saddle);
    drawWormDiscIcon(g, cx, cy, r, W.head);
    var er = size * 0.24;
    g.beginPath(); g.arc(cx, cy, er, 0, Math.PI * 2);
    g.fillStyle = W.eyeWhite; g.fill();
    g.strokeStyle = W.eyeRim; g.lineWidth = Math.max(1.6, size * 0.045); g.stroke();
    g.beginPath(); g.arc(cx + er * 0.35, cy, er * 0.52, 0, Math.PI * 2);
    g.fillStyle = W.pupil; g.fill();
    g.beginPath(); g.arc(cx + er * 0.35 - er * 0.16, cy - er * 0.16, er * 0.17, 0, Math.PI * 2);
    g.fillStyle = W.gleam; g.fill();
  }

  function drawWormBodyIcon(g, cx, cy, size) {
    var r = size * 0.33;
    var ax = cx - size * 0.34, bx = cx + size * 0.34;
    g.lineCap = "round";
    g.strokeStyle = W.outline;
    g.lineWidth = r * 2 + Math.max(2.4, r * 0.2);
    g.beginPath(); g.moveTo(ax, cy); g.lineTo(bx, cy); g.stroke();
    g.strokeStyle = W.saddle;
    g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(ax, cy); g.lineTo((ax + bx) / 2, cy); g.stroke();
    g.strokeStyle = W.body;
    g.lineWidth = r * 2;
    g.beginPath(); g.moveTo((ax + bx) / 2, cy); g.lineTo(bx, cy); g.stroke();
    drawWormDiscIcon(g, ax, cy, r, W.saddle);
    drawWormDiscIcon(g, bx, cy, r, W.body);
  }

  window.WyrmRender = { draw: draw, THEMES: THEMES, themeFor: themeFor, spriteIcon: spriteIcon };
})();
