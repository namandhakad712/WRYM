/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-render.js — the engraved-plate board renderer (vanilla)
   A faithful port of the dashboard's StageCanvas: parchment ground,
   cross-hatched bedrock, real material icons, and ONE earthworm with
   annular rings, a blunt snout and shy bead eyes — never a snake.
   Exposes: WyrmRender.draw(canvas, state, opts)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const C = {
    page: "#f4eddd", pageLo: "#ece2cc", pageHi: "#faf5e9",
    ink: "#221c14", inkSoft: "#3a3226",
    wax: "#a33327", waxDeep: "#7c221a",
    sepia: "#8a6a42", sepiaDark: "#6b4f2e",
    ice: "#dfe9ec", iceEdge: "#9fb6bd",
    wood: "#a07a48", woodDark: "#77572f",
    apple: "#b03a2a", appleHi: "#d0604f", appleLeaf: "#5a7242",
    wormBody: "#c9917a", wormBodyLo: "#a56d58", wormBelly: "#dcae9a",
    wormRing: "#8f5a44", wormEdge: "#5c3a2c", wormEye: "#2b201a",
    soil: "#6e4f30", soilDark: "#4c3722", soilHi: "#8a6a42", pebble: "#9a8a72",
    woodDoor: "#8a6238", woodDoorDark: "#5f4224",
    iron: "#4a4a52", ironHi: "#7a7a86",
    brassPlate: "#b09248", brassDark: "#7c6528",
    burrow: "#2e2317",
  };

  function cellRand(x, y, salt) {
    let r = ((x * 73856093) ^ (y * 19349663) ^ ((salt || 0) * 83492791)) & 0x7fffffff;
    return function () { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  }

  const VALVE_DIR = { ">": [1, 0], "<": [-1, 0], "^": [0, -1], "v": [0, 1] };

  /** Is a plate-door currently passable? doorsOpen(state). */
  function doorsOpen(st) {
    const plates = [];
    for (let y = 0; y < st.h; y++)
      for (let x = 0; x < st.w; x++)
        if (st.t[y][x] === "%") plates.push([x, y]);
    if (!plates.length) return true;
    const w = occupied(st);
    return plates.every(function (p) { return w.has(p[0] + "," + p[1]); });
  }
  function occupied(st) {
    const s = new Set();
    (st.c || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    (st.r || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    (st.m || []).forEach(function (p) { s.add(p.x + "," + p.y); });
    return s;
  }

  /**
   * Draw one game state onto a canvas.
   * st: serialized state JSON (w,h,t,c,a,k,kh,r,p,m,n,tl,s)
   * opts: { pad, cell (optional fixed cell px), quality, showCoords }
   */
  function draw(canvas, st, opts) {
    opts = opts || {};
    const quality = opts.quality || "high";
    const pad = opts.pad != null ? opts.pad : 22;
    const cell = opts.cell || 40;
    const w = st.w * cell + pad * 2;
    const h = st.h * cell + pad * 2;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.aspectRatio = w + " / " + h;
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // parchment
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, C.pageHi); bg.addColorStop(0.5, C.page); bg.addColorStop(1, C.pageLo);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const fr = cellRand(7, 13);
    const flecks = (w * h) / 900;
    for (let i = 0; i < flecks; i++) {
      const fx = fr() * w, fy = fr() * h;
      g.fillStyle = fr() > 0.6 ? "rgba(120,96,60,0.05)" : "rgba(34,28,20,0.03)";
      g.fillRect(fx, fy, 1 + fr() * 1.6, 0.8 + fr());
    }

    // terrain
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const t = st.t[y][x];
        const px = pad + x * cell, py = pad + y * cell;
        if (t === "#") {
          const isPit = (st.p || []).some(function (p) { return p.x === x && p.y === y; });
          drawRock(g, px, py, cell, x, y, st, isPit);
        } else {
          drawGround(g, px, py, cell, x, y, t, st);
        }
      }
    }

    // entities
    (st.k || []).forEach(function (p) { drawKey(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell, 1); });
    (st.a || []).forEach(function (p, i) { drawApple(g, pad + (p.x + 0.5) * cell, pad + (p.y + 0.5) * cell, cell, i * 1.3); });
    (st.c || []).forEach(function (p) { drawCrate(g, pad + p.x * cell, pad + p.y * cell, cell, p.x, p.y); });
    (st.r || []).forEach(function (p) { drawRemain(g, pad + p.x * cell, pad + p.y * cell, cell, p.x, p.y); });

    // the worm
    drawWorm(g, st.m || [], cell, pad);

    // frame — fine double rule
    g.strokeStyle = C.ink; g.lineWidth = 1.6;
    g.strokeRect(pad - 8.5, pad - 8.5, w - pad * 2 + 17, h - pad * 2 + 17);
    g.strokeStyle = "rgba(34,28,20,0.45)"; g.lineWidth = 0.7;
    g.strokeRect(pad - 5.5, pad - 5.5, w - pad * 2 + 11, h - pad * 2 + 11);

    // status vignettes
    if (st.s === "dead") {
      g.fillStyle = "rgba(58,50,38,0.22)"; g.fillRect(0, 0, w, h);
    } else if (st.s === "won") {
      const gl = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      gl.addColorStop(0, "rgba(217,198,138,0.30)"); gl.addColorStop(1, "rgba(217,198,138,0)");
      g.fillStyle = gl; g.fillRect(0, 0, w, h);
    }
    return { width: w, height: h, cell: cell, pad: pad };
  }

  function drawGround(g, px, py, cell, x, y, t, st) {
    if ((x + y) % 2 === 0) {
      g.fillStyle = "rgba(34,28,20,0.022)";
      g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    }
    g.strokeStyle = "rgba(34,28,20,0.055)"; g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
    g.fillStyle = "rgba(34,28,20,0.10)";
    g.beginPath(); g.arc(px + cell / 2, py + cell / 2, 0.9, 0, Math.PI * 2); g.fill();

    if (t === "+") drawDirt(g, px, py, cell, x, y);
    else if (t === "%") drawPlate(g, px, py, cell);
    else if (t === "~") drawSpikes(g, px, py, cell, x, y);
    else if (t === "X") drawExit(g, px, py, cell);
    else if (t === "D") drawDoor(g, px, py, cell, st);
    else if (t === "_") drawIce(g, px, py, cell, x, y);
    else if (t === "=") drawBridge(g, px, py, cell, x, y);
    else if (t === "L") drawLock(g, px, py, cell);
    else if (VALVE_DIR[t]) drawValve(g, px, py, cell, t);
  }

  function drawRock(g, px, py, cell, x, y, st, isPit) {
    g.save();
    g.beginPath(); g.rect(px, py, cell, cell); g.clip();
    if (isPit) {
      g.fillStyle = "#e6dcc4"; g.fillRect(px, py, cell, cell);
      const c = px + cell / 2, cy = py + cell / 2;
      g.beginPath(); g.ellipse(c, cy, cell * 0.38, cell * 0.34, 0, 0, Math.PI * 2);
      g.fillStyle = "#3a3226"; g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
      g.strokeStyle = "rgba(244,237,221,0.25)"; g.lineWidth = 0.8;
      for (let i = -cell; i < cell; i += 4.5) {
        g.beginPath();
        g.moveTo(c - cell * 0.4 + i, cy + cell * 0.4);
        g.lineTo(c - cell * 0.4 + i + cell * 0.5, cy - cell * 0.4);
        g.stroke();
      }
      g.restore(); return;
    }
    g.fillStyle = "#3d352a"; g.fillRect(px, py, cell, cell);
    const rand = cellRand(x, y, 3);
    const phase = rand() * 4;
    g.strokeStyle = "rgba(244,237,221,0.16)"; g.lineWidth = 1;
    for (let i = -cell; i < cell * 2; i += 4.5) {
      g.beginPath();
      g.moveTo(px + i + phase, py - 1);
      g.lineTo(px + i + phase - cell * 0.35, py + cell + 1);
      g.stroke();
    }
    g.strokeStyle = "rgba(244,237,221,0.07)";
    for (let i = -cell; i < cell * 2; i += 6.5) {
      g.beginPath();
      g.moveTo(px + i + phase, py + cell + 1);
      g.lineTo(px + i + phase - cell * 0.35, py - 1);
      g.stroke();
    }
    const above = y > 0 ? st.t[y - 1][x] : "#";
    if (above !== "#") {
      g.strokeStyle = "rgba(34,28,20,0.95)"; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(px, py + 1); g.lineTo(px + cell, py + 1); g.stroke();
      g.strokeStyle = "rgba(244,237,221,0.32)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, py + 2.6); g.lineTo(px + cell, py + 2.6); g.stroke();
    }
    g.restore();
  }

  function drawDirt(g, px, py, cell, x, y) {
    const rand = cellRand(x, y, 5);
    const inset = cell * 0.08;
    const x0 = px + inset, y0 = py + inset, x1 = px + cell - inset, y1 = py + cell - inset;
    g.beginPath();
    const steps = 7, wob = cell * 0.07;
    for (let i = 0; i <= steps; i++) { const t = i / steps; const wx = x0 + (x1 - x0) * t, wy = y0 + (rand() - 0.5) * wob; i === 0 ? g.moveTo(wx, wy) : g.lineTo(wx, wy); }
    for (let i = 0; i <= steps; i++) { const t = i / steps; g.lineTo(x1 + (rand() - 0.5) * wob, y0 + (y1 - y0) * t); }
    for (let i = 0; i <= steps; i++) { const t = i / steps; g.lineTo(x1 - (x1 - x0) * t, y1 + (rand() - 0.5) * wob); }
    for (let i = 0; i <= steps; i++) { const t = i / steps; g.lineTo(x0 + (rand() - 0.5) * wob, y1 - (y1 - y0) * t); }
    g.closePath();
    const sg = g.createLinearGradient(x0, y0, x0, y1);
    sg.addColorStop(0, C.soilHi); sg.addColorStop(0.55, C.soil); sg.addColorStop(1, C.soilDark);
    g.fillStyle = sg; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 5; i++) {
      const bx = x0 + cell * (0.15 + rand() * 0.7), by = y0 + cell * (0.15 + rand() * 0.7), br = cell * (0.09 + rand() * 0.1);
      g.beginPath(); g.arc(bx, by, br, Math.PI, Math.PI * 2);
      g.fillStyle = "rgba(190,160,110,0.35)"; g.fill();
      g.strokeStyle = "rgba(60,44,26,0.4)"; g.lineWidth = 0.8; g.stroke();
    }
    g.strokeStyle = "rgba(40,28,16,0.55)"; g.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) {
      let cx = x0 + cell * (0.1 + rand() * 0.8), cy = y0 + cell * (0.15 + rand() * 0.3);
      g.beginPath(); g.moveTo(cx, cy);
      for (let s = 0; s < 3; s++) { cx += (rand() - 0.5) * cell * 0.24; cy += cell * 0.12; g.lineTo(cx, cy); }
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const bx = x0 + cell * (0.15 + rand() * 0.7), by = y0 + cell * (0.2 + rand() * 0.6), br = cell * (0.045 + rand() * 0.035);
      g.beginPath(); g.ellipse(bx, by, br, br * 0.8, rand() * Math.PI, 0, Math.PI * 2);
      g.fillStyle = C.pebble; g.fill();
      g.strokeStyle = "rgba(60,50,40,0.6)"; g.lineWidth = 0.6; g.stroke();
    }
    g.strokeStyle = "rgba(150,110,64,0.8)"; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(x0 + cell * 0.08, y0 + cell * (0.3 + rand() * 0.3));
    g.quadraticCurveTo(x0 + cell * 0.5, y0 + cell * (0.35 + rand() * 0.4), x1 - cell * 0.06, y0 + cell * (0.45 + rand() * 0.3));
    g.stroke();
    g.fillStyle = "rgba(46,34,20,0.5)";
    for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 0.6 + rand() * 0.8, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.strokeStyle = C.soilDark; g.lineWidth = 1.3; g.stroke();
  }

  function drawPlate(g, px, py, cell) {
    const c = px + cell / 2, cy = py + cell / 2, r = cell * 0.32;
    g.beginPath(); g.arc(c + 1, cy + 1.5, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(34,28,20,0.18)"; g.fill();
    const pg = g.createRadialGradient(c - r * 0.35, cy - r * 0.35, r * 0.15, c, cy, r);
    pg.addColorStop(0, "#d8bc74"); pg.addColorStop(0.6, C.brassPlate); pg.addColorStop(1, C.brassDark);
    g.beginPath(); g.arc(c, cy, r, 0, Math.PI * 2); g.fillStyle = pg; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.arc(c, cy, r * 0.78, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255,244,214,0.5)"; g.lineWidth = 1; g.stroke();
    g.beginPath();
    g.moveTo(c, cy - r * 0.34); g.lineTo(c + r * 0.34, cy); g.lineTo(c, cy + r * 0.34); g.lineTo(c - r * 0.34, cy);
    g.closePath();
    g.strokeStyle = "rgba(76,58,20,0.75)"; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = "rgba(76,58,20,0.28)"; g.fill();
    g.fillStyle = C.iron;
    [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].forEach(function (p) {
      g.beginPath(); g.arc(c + r * p[0], cy + r * p[1], r * 0.1, 0, Math.PI * 2); g.fill();
    });
  }

  function drawSpikes(g, px, py, cell, x, y) {
    const rand = cellRand(x, y, 9);
    const bh = cell * 0.16;
    g.fillStyle = "rgba(52,52,60,0.9)";
    g.fillRect(px + cell * 0.08, py + cell * 0.74, cell * 0.84, bh);
    g.strokeStyle = C.ink; g.lineWidth = 1.1;
    g.strokeRect(px + cell * 0.08, py + cell * 0.74, cell * 0.84, bh);
    g.fillStyle = C.ironHi;
    [0.16, 0.84].forEach(function (bx) {
      g.beginPath(); g.arc(px + cell * bx, py + cell * 0.74 + bh / 2, cell * 0.028, 0, Math.PI * 2); g.fill();
    });
    const tips = [[0.24, 0.45], [0.42, 0.33], [0.6, 0.41], [0.78, 0.49]];
    tips.forEach(function (tp) {
      const tipX = px + cell * tp[0], tipY = py + cell * (tp[1] + rand() * 0.06);
      const halfW = cell * 0.055, baseY = py + cell * 0.76;
      g.beginPath();
      g.moveTo(tipX - halfW, baseY);
      g.quadraticCurveTo(tipX - halfW * 0.8, (tipY + baseY) / 2, tipX, tipY);
      g.quadraticCurveTo(tipX + halfW * 0.8, (tipY + baseY) / 2, tipX + halfW, baseY);
      g.closePath();
      const mg = g.createLinearGradient(tipX - halfW, 0, tipX + halfW, 0);
      mg.addColorStop(0, "#8b939e"); mg.addColorStop(0.45, "#5c6670"); mg.addColorStop(1, "#3a4048");
      g.fillStyle = mg; g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 0.9; g.stroke();
      g.beginPath();
      g.moveTo(tipX - halfW * 0.5, baseY - cell * 0.04);
      g.lineTo(tipX - halfW * 0.12, tipY + cell * 0.06);
      g.strokeStyle = "rgba(235,240,246,0.65)"; g.lineWidth = 0.8; g.stroke();
    });
  }

  function drawExit(g, px, py, cell) {
    const c = px + cell / 2, cy = py + cell / 2;
    const rx = cell * 0.34, ry = cell * 0.26;
    g.beginPath(); g.arc(c, cy, cell * 0.42, 0, Math.PI * 2);
    g.strokeStyle = "rgba(34,28,20,0.4)"; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.ellipse(c, cy + cell * 0.02, rx * 1.3, ry * 1.45, 0, 0, Math.PI * 2);
    g.fillStyle = C.soil; g.fill();
    g.strokeStyle = C.soilDark; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.ellipse(c, cy + cell * 0.02, rx * 1.08, ry * 1.18, 0, Math.PI * 0.95, Math.PI * 2.05);
    g.strokeStyle = "rgba(178,142,96,0.75)"; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.ellipse(c, cy + cell * 0.03, rx, ry, 0, 0, Math.PI * 2);
    const hg = g.createRadialGradient(c, cy + cell * 0.05, cell * 0.03, c, cy + cell * 0.03, rx);
    hg.addColorStop(0, "#0d0a06"); hg.addColorStop(0.75, C.burrow); hg.addColorStop(1, "#4a3a26");
    g.fillStyle = hg; g.fill();
    g.strokeStyle = C.soilDark; g.lineWidth = 1.1; g.stroke();
    const rand = cellRand(3, 9, 21);
    g.strokeStyle = "rgba(92,66,40,0.7)"; g.lineWidth = 0.9;
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (0.15 + rand() * 0.7) + (rand() > 0.5 ? Math.PI : 0);
      const r1 = rx * 1.25;
      g.beginPath();
      g.moveTo(c + Math.cos(ang) * r1 * 0.9, cy + Math.sin(ang) * ry * 1.3);
      g.quadraticCurveTo(c + Math.cos(ang) * r1 * 1.25, cy + Math.sin(ang) * ry * 1.7, c + Math.cos(ang + (rand() - 0.5) * 0.4) * r1 * 1.5, cy + Math.sin(ang) * ry * 1.9);
      g.stroke();
    }
    g.fillStyle = "rgba(52,38,22,0.8)";
    for (let i = 0; i < 6; i++) {
      const ang = rand() * Math.PI * 2;
      g.beginPath();
      g.arc(c + Math.cos(ang) * rx * (1.35 + rand() * 0.35), cy + Math.sin(ang) * ry * (1.5 + rand() * 0.4), 0.8 + rand(), 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawDoor(g, px, py, cell, st) {
    const open = doorsOpen(st);
    const f = cell * 0.06;
    g.fillStyle = "#cfc4a6"; g.fillRect(px, py, cell, cell);
    g.strokeStyle = "rgba(34,28,20,0.5)"; g.lineWidth = 0.8;
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(px, py + (cell * i) / 3); g.lineTo(px + f, py + (cell * i) / 3);
      g.moveTo(px + cell - f, py + (cell * i) / 3); g.lineTo(px + cell, py + (cell * i) / 3);
      g.stroke();
    }
    g.fillStyle = open ? "rgba(30,24,16,0.85)" : "rgba(52,42,28,0.9)";
    g.fillRect(px + f, py + f, cell - f * 2, cell - f * 2);
    if (open) {
      g.save();
      g.translate(px + f, py + cell * 0.5);
      g.transform(1, 0, -0.38, 1, 0, 0);
      const dw = (cell - f * 2) * 0.34;
      g.fillStyle = C.woodDoor; g.fillRect(0, -cell * 0.44, dw, cell * 0.88);
      g.strokeStyle = C.woodDoorDark; g.lineWidth = 1; g.strokeRect(0, -cell * 0.44, dw, cell * 0.88);
      g.beginPath(); g.moveTo(dw * 0.5, -cell * 0.44); g.lineTo(dw * 0.5, cell * 0.44); g.stroke();
      g.restore();
      g.fillStyle = "rgba(244,237,221,0.10)";
      g.fillRect(px + f + dw * 0.4, py + f, cell - f * 2 - dw * 0.5, cell - f * 2);
    } else {
      const dx = px + f, dy = py + f, dw = cell - f * 2, dh = cell - f * 2;
      const planks = 3, pw = dw / planks;
      for (let i = 0; i < planks; i++) {
        const wx = dx + i * pw;
        g.fillStyle = i % 2 === 0 ? C.woodDoor : "#7d5730";
        g.fillRect(wx, dy, pw, dh);
        const rand = cellRand(i, 7, 31);
        g.strokeStyle = "rgba(74,52,26,0.5)"; g.lineWidth = 0.7;
        for (let k = 0; k < 2; k++) {
          const gy = dy + dh * (0.25 + rand() * 0.5);
          g.beginPath();
          g.moveTo(wx + 1.5, gy);
          g.bezierCurveTo(wx + pw * 0.4, gy + 1.5, wx + pw * 0.6, gy - 1.5, wx + pw - 1.5, gy);
          g.stroke();
        }
      }
      g.strokeStyle = C.woodDoorDark; g.lineWidth = 1;
      for (let i = 1; i < planks; i++) { g.beginPath(); g.moveTo(dx + i * pw, dy); g.lineTo(dx + i * pw, dy + dh); g.stroke(); }
      g.strokeStyle = C.ink; g.lineWidth = 1.4; g.strokeRect(dx, dy, dw, dh);
      g.fillStyle = C.iron;
      [dy + dh * 0.22, dy + dh * 0.72].forEach(function (by) {
        g.fillRect(dx - 1, by, dw + 2, cell * 0.075);
        g.strokeStyle = C.ink; g.lineWidth = 0.8; g.strokeRect(dx - 1, by, dw + 2, cell * 0.075);
        g.fillStyle = C.ironHi;
        [dx + dw * 0.18, dx + dw * 0.82].forEach(function (rx) {
          g.beginPath(); g.arc(rx, by + cell * 0.037, cell * 0.018, 0, Math.PI * 2); g.fill();
        });
        g.fillStyle = C.iron;
      });
      g.strokeStyle = "#3d3d45"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(dx + dw * 0.74, dy + dh * 0.47, cell * 0.055, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(dx + dw * 0.26, dy + dh * 0.47, cell * 0.075, 0, Math.PI * 2);
      g.fillStyle = C.wax; g.fill();
      g.strokeStyle = C.waxDeep; g.lineWidth = 1; g.stroke();
      const k = cell * 0.028;
      g.beginPath();
      g.moveTo(dx + dw * 0.26 - k, dy + dh * 0.47 - k); g.lineTo(dx + dw * 0.26 + k, dy + dh * 0.47 + k);
      g.moveTo(dx + dw * 0.26 + k, dy + dh * 0.47 - k); g.lineTo(dx + dw * 0.26 - k, dy + dh * 0.47 + k);
      g.strokeStyle = "rgba(244,237,221,0.85)"; g.lineWidth = 0.9; g.stroke();
    }
    g.strokeStyle = C.ink; g.lineWidth = 1.5;
    g.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
  }

  function drawIce(g, px, py, cell, x, y) {
    const m = 1.5;
    g.beginPath(); g.rect(px + m, py + m, cell - m * 2, cell - m * 2);
    const ig = g.createLinearGradient(px, py, px + cell, py + cell);
    ig.addColorStop(0, "#eef6f8"); ig.addColorStop(0.5, C.ice); ig.addColorStop(1, "#cfe0e6");
    g.fillStyle = ig; g.fill();
    g.strokeStyle = C.iceEdge; g.lineWidth = 1.1; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + m + 1.5, py + cell - m - 1.5); g.lineTo(px + m + 1.5, py + m + 1.5); g.lineTo(px + cell - m - 1.5, py + m + 1.5);
    g.stroke();
    g.strokeStyle = "rgba(130,160,172,0.55)";
    g.beginPath();
    g.moveTo(px + cell - m - 1.5, py + m + 1.5); g.lineTo(px + cell - m - 1.5, py + cell - m - 1.5); g.lineTo(px + m + 1.5, py + cell - m - 1.5);
    g.stroke();
    const rand = cellRand(x, y, 11);
    g.strokeStyle = "rgba(120,155,168,0.6)"; g.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      let ax = px + cell * (0.15 + rand() * 0.6), ay = py + cell * (0.15 + rand() * 0.2);
      g.beginPath(); g.moveTo(ax, ay);
      for (let s = 0; s < 3; s++) { ax += (rand() - 0.35) * cell * 0.22; ay += cell * (0.12 + rand() * 0.14); g.lineTo(ax, ay); }
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 3; i++) {
      const gx = px + cell * (0.2 + rand() * 0.6), gy = py + cell * (0.2 + rand() * 0.6), gr = cell * 0.05;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2;
        const rr = k % 2 === 0 ? gr * 1.8 : gr * 0.55;
        if (k === 0) g.moveTo(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr); else g.lineTo(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr);
      }
      g.closePath(); g.fill();
    }
  }

  function drawBridge(g, px, py, cell, x, y) {
    g.fillStyle = "rgba(34,28,20,0.16)"; g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    g.fillStyle = C.woodDark;
    g.fillRect(px + 3, py + cell * 0.2, cell - 6, cell * 0.08);
    g.fillRect(px + 3, py + cell * 0.72, cell - 6, cell * 0.08);
    const planks = 4, pw = (cell - 6) / planks;
    for (let i = 0; i < planks; i++) {
      const bx = px + 3 + i * pw;
      g.fillStyle = C.wood;
      g.fillRect(bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68);
      g.strokeStyle = C.woodDark; g.lineWidth = 0.9;
      g.strokeRect(bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68);
      const rand = cellRand(x, y, i + 17);
      g.strokeStyle = "rgba(119,87,47,0.55)"; g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(bx + 2, py + cell * (0.3 + rand() * 0.1));
      g.lineTo(bx + pw - 3, py + cell * (0.55 + rand() * 0.1));
      g.stroke();
    }
    g.strokeStyle = "#a68a55"; g.lineWidth = 1.2;
    for (let i = 0; i <= planks; i++) {
      const rx = px + 3 + i * pw;
      g.beginPath();
      g.moveTo(rx - 2, py + cell * 0.22); g.lineTo(rx + 2, py + cell * 0.72);
      g.moveTo(rx + 2, py + cell * 0.22); g.lineTo(rx - 2, py + cell * 0.72);
      g.stroke();
    }
  }

  function drawLock(g, px, py, cell) {
    const c = px + cell / 2;
    g.fillStyle = "rgba(34,28,20,0.06)"; g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    const shR = cell * 0.19, shY = py + cell * 0.42;
    g.beginPath(); g.arc(c, shY, shR, Math.PI, Math.PI * 2);
    g.lineTo(c + shR, shY + cell * 0.12); g.lineTo(c - shR, shY + cell * 0.12);
    g.strokeStyle = C.iron; g.lineWidth = cell * 0.07; g.lineCap = "round"; g.stroke();
    g.beginPath(); g.arc(c, shY, shR, Math.PI * 1.12, Math.PI * 1.55);
    g.strokeStyle = C.ironHi; g.lineWidth = cell * 0.024; g.stroke();
    const bw = cell * 0.5, bh = cell * 0.38, bx = c - bw / 2, by = py + cell * 0.5;
    const bg = g.createLinearGradient(bx, by, bx + bw, by + bh);
    bg.addColorStop(0, "#d4b168"); bg.addColorStop(0.55, C.brassPlate); bg.addColorStop(1, C.brassDark);
    g.beginPath();
    g.moveTo(bx + 3, by);
    g.arcTo(bx + bw, by, bx + bw, by + bh, 3); g.arcTo(bx + bw, by + bh, bx, by + bh, 3);
    g.arcTo(bx, by + bh, bx, by, 3); g.arcTo(bx, by, bx + bw, by, 3);
    g.closePath();
    g.fillStyle = bg; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(c, by + bh * 0.42, cell * 0.045, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(c - cell * 0.02, by + bh * 0.45); g.lineTo(c + cell * 0.02, by + bh * 0.45);
    g.lineTo(c + cell * 0.014, by + bh * 0.82); g.lineTo(c - cell * 0.014, by + bh * 0.82);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(80,60,20,0.8)";
    [bx + bw * 0.14, bx + bw * 0.86].forEach(function (rx) {
      g.beginPath(); g.arc(rx, by + bh * 0.5, cell * 0.018, 0, Math.PI * 2); g.fill();
    });
  }

  function drawValve(g, px, py, cell, t) {
    const c = px + cell / 2, cy = py + cell / 2;
    const m = cell * 0.12;
    g.beginPath();
    g.moveTo(px + m + 2, py + m); g.lineTo(px + cell - m - 2, py + m);
    g.lineTo(px + cell - m, py + m + 2); g.lineTo(px + cell - m, py + cell - m - 2);
    g.lineTo(px + cell - m - 2, py + cell - m); g.lineTo(px + m + 2, py + cell - m);
    g.lineTo(px + m, py + cell - m - 2); g.lineTo(px + m, py + m + 2);
    g.closePath();
    g.fillStyle = "#d4c9ab"; g.fill();
    g.strokeStyle = "rgba(34,28,20,0.65)"; g.lineWidth = 1.1; g.stroke();
    g.save();
    g.translate(c, cy);
    const d = VALVE_DIR[t] || [1, 0];
    g.rotate(Math.atan2(d[1], d[0]));
    g.translate(-c, -cy);
    g.strokeStyle = "rgba(80,60,30,0.35)"; g.lineWidth = 2.6;
    g.lineCap = "round"; g.lineJoin = "round";
    [-cell * 0.1, cell * 0.12].forEach(function (off) {
      g.beginPath();
      g.moveTo(c - cell * 0.1 + off, cy - cell * 0.17);
      g.lineTo(c + cell * 0.1 + off, cy);
      g.lineTo(c - cell * 0.1 + off, cy + cell * 0.17);
      g.stroke();
    });
    g.strokeStyle = "rgba(163,51,39,0.9)"; g.lineWidth = 1.7;
    [-cell * 0.1, cell * 0.12].forEach(function (off) {
      g.beginPath();
      g.moveTo(c - cell * 0.1 + off - 0.6, cy - cell * 0.17 - 0.6);
      g.lineTo(c + cell * 0.1 + off - 0.6, cy - 0.6);
      g.lineTo(c - cell * 0.1 + off - 0.6, cy + cell * 0.17 - 0.6);
      g.stroke();
    });
    g.restore();
  }

  function drawCrate(g, px, py, cell, x, y) {
    const m = cell * 0.14;
    const x0 = px + m, y0 = py + m, cw = cell - m * 2;
    g.fillStyle = "rgba(34,28,20,0.16)"; g.fillRect(x0 + 1.5, y0 + 2, cw, cw);
    g.fillStyle = "#c9a56a"; g.fillRect(x0, y0, cw, cw);
    const rand = cellRand(x, y, 41);
    g.strokeStyle = "rgba(122,90,50,0.5)"; g.lineWidth = 0.7;
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x0 + 1, y0 + (cw * i) / 3); g.lineTo(x0 + cw - 1, y0 + (cw * i) / 3); g.stroke(); }
    for (let i = 0; i < 2; i++) {
      const gy = y0 + cw * (0.2 + rand() * 0.6);
      g.beginPath(); g.moveTo(x0 + 2, gy);
      g.bezierCurveTo(x0 + cw * 0.3, gy + 1.4, x0 + cw * 0.6, gy - 1.4, x0 + cw - 2, gy);
      g.stroke();
    }
    g.strokeStyle = "#8a6434"; g.lineWidth = cell * 0.075; g.strokeRect(x0, y0, cw, cw);
    g.lineWidth = cell * 0.055;
    g.beginPath();
    g.moveTo(x0 + 1, y0 + 1); g.lineTo(x0 + cw - 1, y0 + cw - 1);
    g.moveTo(x0 + cw - 1, y0 + 1); g.lineTo(x0 + 1, y0 + cw - 1);
    g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.strokeRect(x0, y0, cw, cw);
    g.fillStyle = C.ink;
    [[x0, y0], [x0 + cw, y0], [x0, y0 + cw], [x0 + cw, y0 + cw]].forEach(function (p) {
      g.beginPath(); g.arc(p[0], p[1], cell * 0.042, 0, Math.PI * 2); g.fill();
    });
  }

  function drawApple(g, c, cy, cell, i) {
    const r = cell * 0.26;
    const bob = Math.sin(i * 1.1) * cell * 0.015;
    cy += bob;
    g.beginPath(); g.ellipse(c, cy + r * 0.95, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(34,28,20,0.14)"; g.fill();
    g.beginPath();
    g.moveTo(c, cy - r * 0.72);
    g.bezierCurveTo(c + r * 0.95, cy - r * 1.15, c + r * 1.18, cy + r * 0.5, c + r * 0.28, cy + r * 0.98);
    g.bezierCurveTo(c + r * 0.1, cy + r * 1.1, c - r * 0.1, cy + r * 1.1, c - r * 0.28, cy + r * 0.98);
    g.bezierCurveTo(c - r * 1.18, cy + r * 0.5, c - r * 0.95, cy - r * 1.15, c, cy - r * 0.72);
    g.closePath();
    const ag = g.createRadialGradient(c - r * 0.35, cy - r * 0.4, r * 0.15, c, cy + r * 0.1, r * 1.25);
    ag.addColorStop(0, C.appleHi); ag.addColorStop(0.65, C.apple); ag.addColorStop(1, "#7c2318");
    g.fillStyle = ag; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.ellipse(c - r * 0.38, cy - r * 0.3, r * 0.22, r * 0.32, -0.6, 0, Math.PI * 2);
    g.fillStyle = "rgba(250,245,233,0.55)"; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.lineCap = "round";
    g.beginPath(); g.moveTo(c, cy - r * 0.78);
    g.quadraticCurveTo(c + r * 0.18, cy - r * 1.3, c + r * 0.08, cy - r * 1.5);
    g.stroke();
    g.fillStyle = C.appleLeaf;
    g.beginPath(); g.ellipse(c + r * 0.42, cy - r * 1.28, r * 0.34, r * 0.16, -0.5, 0, Math.PI * 2); g.fill();
  }

  function drawKey(g, c, cy, cell) {
    const r = cell * 0.24;
    g.beginPath(); g.ellipse(c, cy + r * 0.9, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(34,28,20,0.13)"; g.fill();
    g.save(); g.translate(c, cy); g.rotate(-0.6);
    const kg = g.createLinearGradient(-r, -r, r, r);
    kg.addColorStop(0, "#d4b168"); kg.addColorStop(0.5, C.brassPlate); kg.addColorStop(1, C.brassDark);
    g.strokeStyle = kg; g.lineCap = "round";
    g.beginPath(); g.moveTo(-r * 0.1, 0); g.lineTo(r * 1.05, 0); g.lineWidth = r * 0.28; g.stroke();
    g.beginPath(); g.arc(-r * 0.55, 0, r * 0.52, 0, Math.PI * 2); g.lineWidth = r * 0.24; g.stroke();
    g.beginPath();
    g.moveTo(r * 0.62, 0); g.lineTo(r * 0.62, r * 0.46);
    g.moveTo(r * 0.95, 0); g.lineTo(r * 0.95, r * 0.38);
    g.lineWidth = r * 0.22; g.stroke();
    g.beginPath(); g.arc(-r * 0.55, -r * 0.1, r * 0.5, Math.PI * 1.15, Math.PI * 1.5);
    g.strokeStyle = "rgba(250,242,220,0.8)"; g.lineWidth = r * 0.1; g.stroke();
    g.restore();
  }

  function drawRemain(g, px, py, cell, x, y) {
    const c = px + cell / 2, cy = py + cell / 2;
    const w = cell * 0.52;
    g.save(); g.translate(c, cy);
    g.rotate((((x * 7 + y * 13) % 4) * 0.5) - 0.75);
    g.beginPath(); g.ellipse(0, 0, w, w * 0.56, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(146,112,96,0.85)"; g.fill();
    g.strokeStyle = "rgba(74,50,38,0.9)"; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(74,50,38,0.55)"; g.lineWidth = 0.9;
    [-w * 0.45, -w * 0.15, w * 0.15, w * 0.45].forEach(function (off) {
      g.beginPath(); g.moveTo(off, -w * 0.42);
      g.quadraticCurveTo(off + w * 0.06, 0, off, w * 0.42);
      g.stroke();
    });
    g.beginPath();
    g.moveTo(w * 0.72, -w * 0.3); g.lineTo(w * 0.98, -w * 0.08); g.lineTo(w * 0.8, w * 0.05);
    g.lineTo(w * 1.02, w * 0.22); g.lineTo(w * 0.68, w * 0.32);
    g.strokeStyle = "rgba(74,50,38,0.95)"; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = "rgba(58,40,30,0.85)"; g.fill();
    g.restore();
  }

  /** THE WORM — Lumbricus, drawn in ink over rose-tan. */
  function drawWorm(g, cells, cell, pad) {
    if (!cells || !cells.length) return;
    const pts = cells.map(function (p) { return { x: pad + (p.x + 0.5) * cell, y: pad + (p.y + 0.5) * cell }; });

    // ground shadow
    g.save();
    g.strokeStyle = "rgba(34,28,20,0.13)";
    g.lineWidth = cell * 0.5; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    g.moveTo(pts[0].x + 2, pts[0].y + cell * 0.16);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 2, pts[i].y + cell * 0.16);
    if (pts.length === 1) g.lineTo(pts[0].x + 2.1, pts[0].y + cell * 0.16);
    g.stroke();
    g.restore();

    const maxW = cell * 0.56;
    g.lineCap = "round"; g.lineJoin = "round";
    function widthAt(i) {
      const frac = i / Math.max(1, pts.length - 1);
      const base = maxW * (0.42 + 0.58 * (1 - frac));
      const clit = Math.exp(-Math.pow((frac - 0.22) / 0.09, 2));
      return base * (1 + clit * 0.16);
    }
    // outline tube
    for (let i = pts.length - 1; i > 0; i--) {
      g.strokeStyle = C.wormEdge;
      g.lineWidth = widthAt(i) + 2.4;
      g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i - 1].x, pts[i - 1].y); g.stroke();
    }
    // body tube
    for (let i = pts.length - 1; i > 0; i--) {
      const grad = g.createLinearGradient(pts[i].x, pts[i].y - widthAt(i), pts[i].x, pts[i].y + widthAt(i));
      grad.addColorStop(0, C.wormBody); grad.addColorStop(0.55, C.wormBodyLo); grad.addColorStop(1, C.wormBelly);
      g.strokeStyle = grad;
      g.lineWidth = widthAt(i);
      g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i - 1].x, pts[i - 1].y); g.stroke();
    }
    // annular rings
    g.strokeStyle = C.wormRing;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      const seg = Math.hypot(dx, dy) || 1;
      const nx = -dy / seg, ny = dx / seg;
      for (let r = 1; r <= 3; r++) {
        const tt = r / 4;
        const mx = pts[i].x + dx * tt, my = pts[i].y + dy * tt;
        const w0 = widthAt(i + tt) * 0.42;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(mx - nx * w0, my - ny * w0);
        g.quadraticCurveTo(mx + (dx / seg) * w0 * 0.3, my + (dy / seg) * w0 * 0.3, mx + nx * w0, my + ny * w0);
        g.stroke();
      }
    }
    // slime sheen
    g.strokeStyle = "rgba(250,240,228,0.34)";
    g.lineWidth = maxW * 0.13;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y - maxW * 0.18);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y - maxW * 0.18);
    g.stroke();

    // head — blunt snout, bead eyes, small mouth
    const head = pts[0];
    let dirX = 1, dirY = 0;
    if (pts.length > 1) {
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const m = Math.hypot(dx, dy) || 1;
      dirX = dx / m; dirY = dy / m;
    }
    const hr = widthAt(0) * 0.62;
    const ang = Math.atan2(dirY, dirX);
    g.beginPath();
    g.ellipse(head.x + dirX * hr * 0.18, head.y + dirY * hr * 0.18, hr * 1.06, hr * 0.94, ang, 0, Math.PI * 2);
    const hg = g.createLinearGradient(head.x, head.y - hr, head.x, head.y + hr);
    hg.addColorStop(0, C.wormBody); hg.addColorStop(0.6, C.wormBodyLo); hg.addColorStop(1, C.wormBelly);
    g.fillStyle = hg; g.fill();
    g.strokeStyle = C.wormEdge; g.lineWidth = 2; g.stroke();
    g.beginPath();
    g.ellipse(head.x + dirX * hr * 0.92, head.y + dirY * hr * 0.92, hr * 0.34, hr * 0.5, ang, 0, Math.PI * 2);
    g.fillStyle = C.wormBodyLo; g.fill();
    g.strokeStyle = C.wormEdge; g.lineWidth = 1.2; g.stroke();

    const ex = -dirY, ey = dirX;
    const eo = hr * 0.34, ef = hr * 0.34;
    [-1, 1].forEach(function (side) {
      const px = head.x + ex * eo * side + dirX * ef;
      const py = head.y + ey * eo * side + dirY * ef;
      g.beginPath(); g.ellipse(px, py, hr * 0.115, hr * 0.115, 0, 0, Math.PI * 2);
      g.fillStyle = C.wormEye; g.fill();
      g.beginPath();
      g.arc(px - hr * 0.03 + dirX * hr * 0.02, py - hr * 0.03 + dirY * hr * 0.02, hr * 0.032, 0, Math.PI * 2);
      g.fillStyle = "rgba(250,245,233,0.85)"; g.fill();
    });
    g.beginPath();
    g.ellipse(head.x + dirX * hr * 1.02, head.y + dirY * hr * 1.02, hr * 0.09, hr * 0.13, ang, 0, Math.PI * 2);
    g.strokeStyle = C.wormEdge; g.lineWidth = 1; g.stroke();
  }

  window.WyrmRender = { draw: draw, C: C };
})();
