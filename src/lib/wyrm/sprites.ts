// ── WYRM · sprites.ts — the canonical element sprite painter ────────
// One source of truth for how every WOIM element looks as a standalone
// tile. Used by the Feature Builder palette, the forge editor grid and
// any icon surface. Every constant was lifted from the real game
// (Steam app 4272020, dogspawn) via screenshot color-picking + vision
// analysis — see docs/WOIM_DESIGN_BIBLE.md.
//
// The worm (verified Nov 2026 against all 13 official 1920×1080
// screenshots + the owner's reference build):
//   body   #f09c9c  salmon-pink (pixel-clustered across every capture)
//   head   #ea6a65  coral — the head segment IS coral in the real game
//   saddle #ea6a65  coral clitellum on segments 1–3
//   outline #2b1f1e  thin dark outline around the whole tube
//   one big googly eye · black pupil w/ gleam · white tail badge

export interface SoilTheme {
  base: string; wave1: string; wave2: string;
  glyph: string; tunnel: string; ridge: string; daisies?: boolean;
}

export const SOIL_THEMES: Record<string, SoilTheme> = {
  moss:  { base: "#586248", wave1: "#4a533c", wave2: "#687455", glyph: "rgba(50,58,40,0.45)", tunnel: "#1c1b18", ridge: "#282522" },
  grass: { base: "#7a965a", wave1: "#5c733e", wave2: "#8fae6c", glyph: "rgba(46,58,30,0.45)", tunnel: "#1e2b18", ridge: "#2a3a20", daisies: true },
  clay:  { base: "#874936", wave1: "#743d2c", wave2: "#9e5640", glyph: "rgba(68,30,20,0.45)", tunnel: "#1d1310", ridge: "#2a1a15" },
  sand:  { base: "#9c6b43", wave1: "#7a5032", wave2: "#b07f52", glyph: "rgba(60,36,18,0.40)", tunnel: "#3e2723", ridge: "#4d302a" },
  rust:  { base: "#a4443b", wave1: "#732820", wave2: "#b95a4e", glyph: "rgba(60,16,12,0.40)", tunnel: "#2b1010", ridge: "#3a1815" },
  slate: { base: "#2b3a42", wave1: "#3e5866", wave2: "#223038", glyph: "rgba(200,220,230,0.10)", tunnel: "#11151c", ridge: "#1a2129" },
};
export const THEME_KEYS = Object.keys(SOIL_THEMES);

export const WORM_SPRITE = {
  body: "#f09c9c",        // salmon-pink — pixel-verified
  head: "#ea6a65",        // coral head segment
  saddle: "#ea6a65",      // coral clitellum, segments 1–3
  outline: "#2b1f1e",     // dark tube outline (real game has one)
  eyeWhite: "#ffffff",
  eyeRim: "#2b1c1d",
  pupil: "#0a0a0a",
  gleam: "#ffffff",
  badge: "#ffffff",
  badgeInk: "#111111",
  shadow: "rgba(0,0,0,0.30)",
};

export const VALVE_DIR: Record<string, [number, number]> = {
  ">": [1, 0], "<": [-1, 0], "^": [0, -1], v: [0, 1],
};

// deterministic per-cell noise — same art on every machine
export function cellRand(x: number, y: number, salt = 0) {
  let r = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) & 0x7fffffff;
  return () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export interface SpriteOpts {
  theme?: SoilTheme;
  /** plate is weighed down */
  pressed?: boolean;
  /** gate bars are open */
  open?: boolean;
  /** ms clock for gentle idle animation (0 = still) */
  t?: number;
  /** glyph seed */
  seed?: number;
}

/* ── backgrounds ─────────────────────────────────────────────────── */

/** A soil tile: theme base + one wavy strata band + one fossil glyph. */
export function drawSoilTile(g: CanvasRenderingContext2D, px: number, py: number, cell: number, th: SoilTheme, seed = 0) {
  g.fillStyle = th.base;
  g.fillRect(px, py, cell, cell);
  // wavy band across the tile
  const rnd = cellRand(seed, 3, 77);
  const y0 = py + cell * (0.22 + rnd() * 0.4);
  const amp = cell * 0.10, ph = rnd() * Math.PI * 2;
  g.beginPath();
  g.moveTo(px, y0);
  for (let x = 0; x <= cell; x += cell / 8) g.lineTo(px + x, y0 + Math.sin((x / cell) * Math.PI * 2 + ph) * amp);
  g.lineTo(px + cell, y0 + cell * 0.26);
  for (let x = cell; x >= 0; x -= cell / 8) g.lineTo(px + x, y0 + cell * 0.26 + Math.sin((x / cell) * Math.PI * 2 + ph) * amp);
  g.closePath();
  g.fillStyle = rnd() > 0.5 ? th.wave1 : th.wave2;
  g.fill();
  // one fossil glyph
  g.save();
  g.translate(px + cell * (0.3 + rnd() * 0.4), py + cell * (0.62 + rnd() * 0.2));
  g.strokeStyle = th.glyph;
  g.lineWidth = Math.max(1.2, cell * 0.045);
  g.lineCap = "round";
  const kind = Math.floor(rnd() * 3);
  if (kind === 0) { // ammonite spiral
    g.beginPath();
    const turns = 1.9, rr = cell * 0.16;
    for (let a = 0; a < turns * Math.PI * 2; a += 0.3) {
      const rad = rr * (a / (turns * Math.PI * 2));
      const x2 = Math.cos(a) * rad, y2 = Math.sin(a) * rad;
      if (a === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
    }
    g.stroke();
  } else if (kind === 1) { // fishbone
    g.beginPath();
    g.moveTo(-cell * 0.15, 0); g.lineTo(cell * 0.15, 0);
    g.moveTo(-cell * 0.05, -cell * 0.09); g.lineTo(0, 0);
    g.moveTo(-cell * 0.05, cell * 0.09); g.lineTo(0, 0);
    g.moveTo(cell * 0.05, -cell * 0.09); g.lineTo(cell * 0.1, 0);
    g.moveTo(cell * 0.05, cell * 0.09); g.lineTo(cell * 0.1, 0);
    g.stroke();
  } else { // insect trail
    g.beginPath(); g.arc(0, 0, cell * 0.03, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(-cell * 0.1, -cell * 0.05); g.lineTo(-cell * 0.03, 0);
    g.moveTo(cell * 0.1, -cell * 0.05); g.lineTo(cell * 0.03, 0);
    g.stroke();
  }
  g.restore();
}

/** A carved tunnel tile: dark chamber, inner ridge, organic carved edges. */
export function drawTunnelTile(g: CanvasRenderingContext2D, px: number, py: number, cell: number, th: SoilTheme) {
  g.fillStyle = th.tunnel;
  g.fillRect(px, py, cell, cell);
  g.fillStyle = th.ridge;
  g.fillRect(px, py + cell * 0.36, cell, cell * 0.27);
  // carved edges (top + left reads as dug-out)
  g.strokeStyle = "rgba(12,9,6,0.85)";
  g.lineWidth = Math.max(2.5, cell * 0.10);
  g.lineCap = "round";
  g.beginPath(); g.moveTo(px + 1, py + 1); g.lineTo(px + cell - 1, py + 1); g.stroke();
  g.beginPath(); g.moveTo(px + 1, py + 1); g.lineTo(px + 1, py + cell - 1); g.stroke();
  g.beginPath(); g.moveTo(px + cell - 1, py + cell - 1); g.lineTo(px + 1, py + cell - 1); g.stroke();
  g.beginPath(); g.moveTo(px + cell - 1, py + cell - 1); g.lineTo(px + cell - 1, py + 1); g.stroke();
}

/* ── elements (recipes mirror the game renderer exactly) ─────────── */

export function drawDirt(g: CanvasRenderingContext2D, px: number, py: number, cell: number, x = 0, y = 0) {
  const rnd = cellRand(x, y, 5);
  const inset = cell * 0.06;
  const x0 = px + inset, y0 = py + inset, s = cell - inset * 2;
  const grad = g.createLinearGradient(x0, y0, x0, y0 + s);
  grad.addColorStop(0, "#9a7648");
  grad.addColorStop(0.55, "#7d5c34");
  grad.addColorStop(1, "#5f4426");
  roundRect(g, x0, y0, s, s, cell * 0.18);
  g.fillStyle = grad; g.fill();
  g.strokeStyle = "#4a3420"; g.lineWidth = 2; g.stroke();
  g.save();
  roundRect(g, x0, y0, s, s, cell * 0.18); g.clip();
  for (let i = 0; i < 5; i++) {
    const bx = x0 + s * (0.15 + rnd() * 0.7), by = y0 + s * (0.15 + rnd() * 0.7);
    const br = s * (0.05 + rnd() * 0.06);
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

export function drawButton(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number, pressed: boolean) {
  const rx = cell * 0.36, ry = cell * (pressed ? 0.20 : 0.30);
  const oy = pressed ? cell * 0.06 : 0;
  g.beginPath();
  g.ellipse(cx, cy + oy, rx * 1.12, ry * 1.35 + cell * 0.04, 0, 0, Math.PI * 2);
  g.fillStyle = "#b88914"; g.fill();
  g.beginPath();
  g.ellipse(cx, cy + oy - cell * 0.02, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = pressed ? "#e6b422" : "#ffcf33";
  g.fill();
  g.strokeStyle = "#b88914"; g.lineWidth = 2; g.stroke();
  g.beginPath();
  g.ellipse(cx - rx * 0.25, cy + oy - ry * 0.55, rx * 0.42, ry * 0.32, -0.3, 0, Math.PI * 2);
  g.fillStyle = pressed ? "rgba(255,238,150,0.55)" : "#ffea75";
  g.fill();
}

export function drawGate(g: CanvasRenderingContext2D, px: number, py: number, cell: number, open: boolean) {
  const cx = px + cell / 2, cy = py + cell / 2;
  if (open) {
    const grad = g.createRadialGradient(cx, cy, cell * 0.05, cx, cy, cell * 0.62);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, "#fce570");
    grad.addColorStop(1, "#e8b630");
    roundRect(g, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.16);
    g.fillStyle = grad; g.fill();
    g.strokeStyle = "#b88914"; g.lineWidth = 2; g.stroke();
    return;
  }
  g.fillStyle = "#161310";
  g.fillRect(px, py, cell, cell);
  g.fillStyle = "#d99f18";
  const n = 3, bw = cell * 0.13;
  for (let i = 0; i < n; i++) {
    const bx = px + cell * (0.5 + (i - 1) * 0.27) - bw / 2;
    g.fillRect(bx, py + cell * 0.08, bw, cell * 0.84);
    g.fillStyle = "#fce570";
    g.fillRect(bx + bw * 0.18, py + cell * 0.10, bw * 0.3, cell * 0.78);
    g.fillStyle = "#d99f18";
  }
  g.strokeStyle = "#8a6210"; g.lineWidth = 2;
  g.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
}

export function drawHeartGoal(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number, t = 0, x = 0) {
  const size = cell * 0.42;
  const bob = t ? Math.sin(t * 0.003 + x) * cell * 0.05 : 0;
  const pulse = t ? 1 + Math.sin(t * 0.005) * 0.05 : 1;
  g.save();
  g.translate(cx, cy + bob);
  g.scale(pulse, pulse);
  const gl = g.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.8);
  gl.addColorStop(0, "rgba(255,105,160,0.35)");
  gl.addColorStop(1, "rgba(255,105,160,0)");
  g.fillStyle = gl;
  g.beginPath(); g.arc(0, 0, size * 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(0, size * 0.38);
  g.bezierCurveTo(-size * 0.95, -size * 0.28, -size * 0.72, -size * 1.02, 0, -size * 0.42);
  g.bezierCurveTo(size * 0.72, -size * 1.02, size * 0.95, -size * 0.28, 0, size * 0.38);
  g.fillStyle = "#ff3377"; g.fill();
  g.strokeStyle = "#d11a58"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "#ffb3cc";
  g.beginPath(); g.arc(-size * 0.3, -size * 0.38, size * 0.13, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(size * 0.34, -size * 0.05, size * 0.08, 0, Math.PI * 2); g.fill();
  g.restore();
  if (t) {
    g.fillStyle = "#ffd1e0";
    for (let i = 0; i < 3; i++) {
      const an = t * 0.002 + (i * Math.PI * 2) / 3;
      const sx = cx + Math.cos(an) * size * 0.95;
      const sy = cy + bob + Math.sin(an) * size * 0.95;
      g.fillRect(sx - 1.8, sy - 1.8, 3.6, 3.6);
    }
  }
}

export function drawSpikes(g: CanvasRenderingContext2D, px: number, py: number, cell: number, x = 0, y = 0) {
  const rnd = cellRand(x, y, 9);
  roundRect(g, px + cell * 0.08, py + cell * 0.72, cell * 0.84, cell * 0.16, cell * 0.05);
  g.fillStyle = "#4a4a52"; g.fill();
  g.strokeStyle = "#26262c"; g.lineWidth = 1.5; g.stroke();
  const tips = [0.26, 0.5, 0.74];
  for (let i = 0; i < tips.length; i++) {
    const tx = px + cell * tips[i];
    const ty = py + cell * (0.30 + rnd() * 0.08);
    const hw = cell * 0.085;
    g.beginPath();
    g.moveTo(tx - hw, py + cell * 0.74);
    g.quadraticCurveTo(tx - hw, ty + cell * 0.12, tx, ty);
    g.quadraticCurveTo(tx + hw, ty + cell * 0.12, tx + hw, py + cell * 0.74);
    g.closePath();
    const mg = g.createLinearGradient(tx - hw, 0, tx + hw, 0);
    mg.addColorStop(0, "#aab3bd"); mg.addColorStop(0.5, "#6d7681"); mg.addColorStop(1, "#454c55");
    g.fillStyle = mg; g.fill();
    g.strokeStyle = "#26262c"; g.lineWidth = 1.4; g.stroke();
  }
}

export function drawValve(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number, ch: string) {
  const d = VALVE_DIR[ch] ?? [1, 0];
  roundRect(g, cx - cell * 0.36, cy - cell * 0.36, cell * 0.72, cell * 0.72, cell * 0.16);
  g.fillStyle = "#543b2d"; g.fill();
  g.strokeStyle = "#3a291e"; g.lineWidth = 2; g.stroke();
  roundRect(g, cx - cell * 0.28, cy - cell * 0.28, cell * 0.56, cell * 0.56, cell * 0.12);
  g.fillStyle = "#6b4c38"; g.fill();
  const ax = d[0], ay = d[1];
  g.strokeStyle = "#fdeccc"; g.lineWidth = Math.max(2.5, cell * 0.09);
  g.lineCap = "round"; g.lineJoin = "round";
  const s = cell * 0.2;
  g.beginPath();
  g.moveTo(cx - ax * s - ay * s * 0.85, cy - ay * s + ax * s * 0.85);
  g.lineTo(cx + ax * s * 0.9, cy + ay * s * 0.9);
  g.lineTo(cx - ax * s + ay * s * 0.85, cy - ay * s - ax * s * 0.85);
  g.stroke();
}

export function drawIce(g: CanvasRenderingContext2D, px: number, py: number, cell: number, x = 0, y = 0) {
  const rnd = cellRand(x, y, 11);
  roundRect(g, px + 1.5, py + 1.5, cell - 3, cell - 3, cell * 0.14);
  const ig = g.createLinearGradient(px, py, px + cell, py + cell);
  ig.addColorStop(0, "#e8f7fe"); ig.addColorStop(0.5, "#c7e9f8"); ig.addColorStop(1, "#a5d8ef");
  g.fillStyle = ig; g.fill();
  g.strokeStyle = "#7fb8d4"; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(px + cell * 0.14, py + cell * 0.8); g.lineTo(px + cell * 0.14, py + cell * 0.2);
  g.lineTo(px + cell * 0.44, py + cell * 0.2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 3; i++) {
    const gx = px + cell * (0.25 + rnd() * 0.5), gy = py + cell * (0.3 + rnd() * 0.45);
    const gr = cell * 0.045;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const an = (k / 6) * Math.PI * 2;
      const rr = k % 2 === 0 ? gr * 1.7 : gr * 0.6;
      if (k === 0) g.moveTo(gx + Math.cos(an) * rr, gy + Math.sin(an) * rr);
      else g.lineTo(gx + Math.cos(an) * rr, gy + Math.sin(an) * rr);
    }
    g.closePath(); g.fill();
  }
}

export function drawBridge(g: CanvasRenderingContext2D, px: number, py: number, cell: number) {
  const planks = 4, pw = (cell - 4) / planks;
  for (let i = 0; i < planks; i++) {
    const bx = px + 2 + i * pw;
    g.fillStyle = i % 2 === 0 ? "#a07a48" : "#8d6a3d";
    roundRect(g, bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68, 2);
    g.fill();
    g.strokeStyle = "#6b4c28"; g.lineWidth = 1; g.stroke();
    g.fillStyle = "#4a3a22";
    g.beginPath(); g.arc(bx + pw / 2, py + cell * 0.5, cell * 0.03, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "#5f4426"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(px + 2, py + cell * 0.16); g.lineTo(px + cell - 2, py + cell * 0.16);
  g.moveTo(px + 2, py + cell * 0.84); g.lineTo(px + cell - 2, py + cell * 0.84);
  g.stroke();
}

export function drawLock(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number) {
  const s = cell * 0.32;
  g.beginPath();
  g.arc(cx, cy - s * 0.55, s * 0.62, Math.PI, Math.PI * 2);
  g.strokeStyle = "#8a6210"; g.lineWidth = Math.max(3, cell * 0.08);
  g.stroke();
  roundRect(g, cx - s, cy - s * 0.35, s * 2, s * 1.55, s * 0.3);
  const lg = g.createLinearGradient(cx, cy - s * 0.35, cx, cy + s * 1.2);
  lg.addColorStop(0, "#f2c232"); lg.addColorStop(1, "#c9920f");
  g.fillStyle = lg; g.fill();
  g.strokeStyle = "#8a6210"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "#6b4a08";
  g.beginPath(); g.arc(cx, cy + s * 0.28, s * 0.2, 0, Math.PI * 2); g.fill();
  g.fillRect(cx - s * 0.07, cy + s * 0.28, s * 0.14, s * 0.5);
}

export function drawApple(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, t = 0, seed = 0) {
  const bob = t ? Math.sin(t * 2.2 + seed) * r * 0.06 : 0;
  g.save();
  g.translate(cx, cy + bob);
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.beginPath(); g.ellipse(0, r * 0.95, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#6b4226"; g.lineWidth = Math.max(2, r * 0.14); g.lineCap = "round";
  g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.08, -r * 1.05); g.stroke();
  g.beginPath();
  g.moveTo(0, -r * 0.42);
  g.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.12, r * 0.62, 0, r * 0.98);
  g.bezierCurveTo(-r * 1.12, r * 0.62, -r * 0.95, -r * 0.95, 0, -r * 0.42);
  g.fillStyle = "#e82f3a"; g.fill();
  g.strokeStyle = "#9c1c24"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "#ff878f";
  g.beginPath(); g.ellipse(-r * 0.38, -r * 0.25, r * 0.24, r * 0.14, -0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#5fb833";
  g.beginPath(); g.ellipse(r * 0.28, -r * 0.78, r * 0.32, r * 0.16, 0.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function drawWalnut(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, x = 0, y = 0) {
  const rnd = cellRand(x, y, 21);
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.beginPath(); g.ellipse(cx, cy + r * 0.9, r * 0.75, r * 0.24, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  const wg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
  wg.addColorStop(0, "#dda15e"); wg.addColorStop(0.65, "#c48957"); wg.addColorStop(1, "#9a683c");
  g.fillStyle = wg; g.fill();
  g.strokeStyle = "#7a4f28"; g.lineWidth = 2.2; g.stroke();
  g.strokeStyle = "rgba(122,79,40,0.85)"; g.lineWidth = 1.6; g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx - r * 0.42, cy - r * 0.52);
  g.quadraticCurveTo(cx + r * 0.1, cy + r * 0.1, cx - r * 0.18, cy + r * 0.62);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const bx = cx + (rnd() - 0.5) * r * 1.1, by = cy + (rnd() - 0.5) * r * 1.1;
    if (Math.hypot(bx - cx, by - cy) < r * 0.72) {
      g.beginPath(); g.arc(bx, by, r * 0.1, 0, Math.PI * 2);
      g.fillStyle = "rgba(122,79,40,0.35)"; g.fill();
    }
  }
}

export function drawKey(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number, t = 0, seed = 0) {
  const r = cell * 0.19;
  const bob = t ? Math.sin(t * 0.0028 + seed) * cell * 0.04 : 0;
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

/* ── worm pieces (the real worm: coral head, salmon body, dark rim) ─ */

/** A worm segment disc with the game's dark outline. */
export function drawWormDisc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.beginPath(); g.arc(cx, cy, r + Math.max(1.4, r * 0.10), 0, Math.PI * 2);
  g.fillStyle = WORM_SPRITE.outline; g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  // soft top light
  g.beginPath(); g.ellipse(cx, cy - r * 0.42, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,235,240,0.30)"; g.fill();
}

/** The head piece for icons: coral head + googly eye + neck segment. */
export function drawWormHeadPiece(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number, dir: [number, number] = [1, 0]) {
  const r = cell * 0.37;
  const neck = { x: cx - dir[0] * cell * 0.52, y: cy - dir[1] * cell * 0.52 };
  // connecting tube (dark outline pass, then fill)
  g.lineCap = "round";
  g.strokeStyle = WORM_SPRITE.outline;
  g.lineWidth = r * 2 + Math.max(2.4, r * 0.2);
  g.beginPath(); g.moveTo(neck.x, neck.y); g.lineTo(cx, cy); g.stroke();
  g.strokeStyle = WORM_SPRITE.head;
  g.lineWidth = r * 2;
  g.beginPath(); g.moveTo(neck.x, neck.y); g.lineTo(cx, cy); g.stroke();
  drawWormDisc(g, neck.x, neck.y, r * 0.94, WORM_SPRITE.saddle);
  drawWormDisc(g, cx, cy, r, WORM_SPRITE.head);
  // the ONE googly eye
  const er = cell * 0.24;
  g.beginPath(); g.arc(cx, cy, er, 0, Math.PI * 2);
  g.fillStyle = WORM_SPRITE.eyeWhite; g.fill();
  g.strokeStyle = WORM_SPRITE.eyeRim; g.lineWidth = Math.max(1.6, cell * 0.045); g.stroke();
  g.beginPath();
  g.arc(cx + dir[0] * er * 0.35, cy + dir[1] * er * 0.35, er * 0.52, 0, Math.PI * 2);
  g.fillStyle = WORM_SPRITE.pupil; g.fill();
  g.beginPath();
  g.arc(cx + dir[0] * er * 0.35 - er * 0.16, cy + dir[1] * er * 0.35 - er * 0.16, er * 0.17, 0, Math.PI * 2);
  g.fillStyle = WORM_SPRITE.gleam; g.fill();
}

/** The body piece for icons: saddle segment + pink segment, outlined. */
export function drawWormBodyPiece(g: CanvasRenderingContext2D, cx: number, cy: number, cell: number) {
  const r = cell * 0.33;
  const a = { x: cx - cell * 0.34, y: cy };
  const b = { x: cx + cell * 0.34, y: cy };
  g.lineCap = "round";
  g.strokeStyle = WORM_SPRITE.outline;
  g.lineWidth = r * 2 + Math.max(2.4, r * 0.2);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.strokeStyle = WORM_SPRITE.saddle;
  g.lineWidth = r * 2;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2); g.stroke();
  g.strokeStyle = WORM_SPRITE.body;
  g.beginPath(); g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); g.lineTo(b.x, b.y); g.stroke();
  drawWormDisc(g, a.x, a.y, r, WORM_SPRITE.saddle);
  drawWormDisc(g, b.x, b.y, r, WORM_SPRITE.body);
}

/* ── the one-cell sprite: background + element, for palettes & grid ─ */

export function drawSpriteCell(
  g: CanvasRenderingContext2D,
  ch: string,
  px: number, py: number, cell: number,
  opts: SpriteOpts = {},
) {
  const th = opts.theme ?? SOIL_THEMES.moss;
  const t = opts.t ?? 0;
  const cx = px + cell / 2, cy = py + cell / 2;
  // background
  if (ch === "#") {
    drawSoilTile(g, px, py, cell, th, opts.seed ?? 0);
    return;
  }
  drawTunnelTile(g, px, py, cell, th);
  // element
  switch (ch) {
    case "+": drawDirt(g, px, py, cell, opts.seed ?? 0, 1); break;
    case "%": drawButton(g, cx, cy, cell, !!opts.pressed); break;
    case "D": drawGate(g, px, py, cell, !!opts.open); break;
    case "X": drawHeartGoal(g, cx, cy, cell, t, opts.seed ?? 0); break;
    case "~": drawSpikes(g, px, py, cell, opts.seed ?? 0, 1); break;
    case "_": drawIce(g, px, py, cell, opts.seed ?? 0, 1); break;
    case "=": drawBridge(g, px, py, cell); break;
    case "L": drawLock(g, cx, cy, cell); break;
    case ">": case "<": case "^": case "v": drawValve(g, cx, cy, cell, ch); break;
    case "*": drawApple(g, cx, cy, cell * 0.42, t, opts.seed ?? 0); break;
    case "$": drawWalnut(g, cx, cy, cell * 0.40, opts.seed ?? 0, 1); break;
    case "k": drawKey(g, cx, cy, cell, t, opts.seed ?? 0); break;
    case "@": drawWormHeadPiece(g, cx, cy, cell); break;
    case "o": drawWormBodyPiece(g, cx, cy, cell); break;
    default: break; // plain tunnel
  }
}

/** Paint a single sprite into a standalone canvas (icon helper, DPR-aware). */
export function paintSprite(
  canvas: HTMLCanvasElement,
  ch: string,
  size: number,
  opts: SpriteOpts & { dpr?: number } = {},
) {
  const dpr = opts.dpr ?? Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  drawSpriteCell(g, ch, 0, 0, size, opts);
}
