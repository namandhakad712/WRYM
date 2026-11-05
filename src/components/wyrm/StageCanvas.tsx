"use client";

// ── WYRM.LAB · StageCanvas — the human-eye render ────────────────────
// THE WOIM LOOK. The same deterministic state the AI parses as ASCII is
// drawn here exactly like the real game (Steam app 4272020, dogspawn):
//
//  · layered soil strata — six palettes (moss, grass, clay, sand, rust,
//    slate) with wavy bands and fossil glyphs (spirals, fishbones,
//    daisies) carved by a deterministic hash, same on every machine
//  · tunnels are dark chambers with a soft inner ridge and an organic
//    carved edge against the soil — never a sterile grid
//  · the worm is THE worm: a salmon-pink tube (#f09c9c, pixel-verified),
//    a CORAL head segment + saddle on segments 1–3, a thin dark outline
//    like the real game, ONE big googly eye that tracks the move
//    direction, an occasional blink, and a white tail badge counting
//    its length
//  · elements are the real ones: glossy red apples, walnut boulders,
//    yellow floor buttons (they depress), golden bar gates that become
//    glowing portals, the pink heart goal with sparkles, diggable dirt,
//    cartoon steel spikes, wooden valve signs, frost tiles, plank
//    bridges, golden padlocks and keys
//  · dropped halves sleep where they fell — closed eye, breathing bubble
//  · turn transitions are tweened; events spawn juicy particles; win
//    rains hearts. The static terrain layer is cached offscreen.

import { useEffect, useRef } from "react";
import type { GameState, Pos, GameEvent } from "@/lib/wyrm/types";
import { doorsOpen, platesSatisfied } from "@/lib/wyrm/engine";
import { sfx } from "@/lib/wyrm/sound";

interface StageCanvasProps {
  state: GameState;
  transitionMs?: number;
  quality?: "high" | "low";
  className?: string;
  maxCellPx?: number;
  showCoords?: boolean;
  /** Play procedural SFX for the events of each transition. */
  sound?: boolean;
  /** Force a soil palette; default: deterministic pick per level. */
  theme?: "moss" | "grass" | "clay" | "sand" | "rust" | "slate";
}

// ── soil themes — the strata of the world ───────────────────────────
interface SoilTheme {
  base: string; wave1: string; wave2: string;
  glyph: string; tunnel: string; ridge: string; daisies?: boolean;
}
const THEMES: Record<string, SoilTheme> = {
  moss:  { base: "#586248", wave1: "#4a533c", wave2: "#687455", glyph: "rgba(50,58,40,0.45)", tunnel: "#1c1b18", ridge: "#282522" },
  grass: { base: "#7a965a", wave1: "#5c733e", wave2: "#8fae6c", glyph: "rgba(46,58,30,0.45)", tunnel: "#1e2b18", ridge: "#2a3a20", daisies: true },
  clay:  { base: "#874936", wave1: "#743d2c", wave2: "#9e5640", glyph: "rgba(68,30,20,0.45)", tunnel: "#1d1310", ridge: "#2a1a15" },
  sand:  { base: "#9c6b43", wave1: "#7a5032", wave2: "#b07f52", glyph: "rgba(60,36,18,0.40)", tunnel: "#3e2723", ridge: "#4d302a" },
  rust:  { base: "#a4443b", wave1: "#732820", wave2: "#b95a4e", glyph: "rgba(60,16,12,0.40)", tunnel: "#2b1010", ridge: "#3a1815" },
  slate: { base: "#2b3a42", wave1: "#3e5866", wave2: "#223038", glyph: "rgba(200,220,230,0.10)", tunnel: "#11151c", ridge: "#1a2129" },
};
const THEME_KEYS = ["moss", "grass", "clay", "sand", "rust", "slate"];

// ── the worm ────────────────────────────────────────────────────────
// Verified against every official capture (Nov 2026): salmon body
// #f09c9c, CORAL head segment + saddle 1–3, thin dark outline, one
// big googly eye with gleam + blink, white tail badge.
const WORM = {
  body: "#f09c9c",
  head: "#ea6a65",
  saddle: "#ea6a65",
  outline: "#2b1f1e",
  eyeRim: "#2b1c1d",
  pupil: "#0a0a0a",
  shadow: "rgba(0,0,0,0.30)",
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// deterministic per-cell noise
function cellRand(x: number, y: number, salt = 0) {
  let r = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) & 0x7fffffff;
  return () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// ── particles ───────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; gravity: number; kind: "ink" | "crumb" | "confetti" | "wash" | "sparkle" | "heart";
  rot: number; vrot: number;
}

export function StageCanvas({
  state,
  transitionMs = 260,
  quality = "high",
  className,
  maxCellPx = 56,
  showCoords = false,
  sound = false,
  theme,
}: StageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const animRef = useRef({
    worm: [] as { x: number; y: number }[],
    crates: [] as { x: number; y: number }[],
    remains: [] as { x: number; y: number; born: number }[],
    keys: [] as { x: number; y: number; born: number }[],
    t0: 0,
    dirX: 1, dirY: 0,
    lastTurn: -1,
    lastLevelKey: "",
    slideUntil: 0,
  });
  const fx = useRef<Particle[]>([]);
  const staticLayer = useRef<HTMLCanvasElement | null>(null);
  const staticKey = useRef("");
  const sizeRef = useRef({ cell: 40, w: 0, h: 0, pad: 12 });
  const themeRef = useRef<SoilTheme>(THEMES.moss);

  // ── state change detection: set up the tween ──────────────────────
  if (state !== stateRef.current) {
    const prev = stateRef.current;
    const a = animRef.current;
    const now = performance.now();
    const levelKey = `${state.width}x${state.height}:${state.terrain.map((r) => r.join("")).join("")}`;

    const snapTurn = Math.min(1, (now - a.t0) / transitionMs);
    const e = easeOutCubic(snapTurn);
    const fromWorm = prev.worm.map((p, i) => {
      const to = a.worm[i] ?? { x: p.x, y: p.y };
      return { x: lerp(p.x, to.x, e), y: lerp(p.y, to.y, e) };
    });
    const fromCrates = prev.crates.map((p, i) => {
      const to = a.crates[i] ?? { x: p.x, y: p.y };
      return { x: lerp(p.x, to.x, e), y: lerp(p.y, to.y, e) };
    });

    if (levelKey !== a.lastLevelKey) {
      // new board — snap instantly, no tween; pick its soil
      let hsh = 0;
      const s = levelKey;
      for (let i = 0; i < s.length; i++) hsh = (hsh * 31 + s.charCodeAt(i)) & 0x7fffffff;
      themeRef.current = THEMES[theme ?? THEME_KEYS[hsh % THEME_KEYS.length]];
      a.worm = state.worm.map((p) => ({ ...p }));
      a.crates = state.crates.map((p) => ({ ...p }));
      a.remains = state.remains.map((p) => ({ ...p, born: 0 }));
      a.keys = state.keys.map((p) => ({ ...p, born: 0 }));
      a.t0 = now - transitionMs;
      staticKey.current = "";
    } else {
      a.worm = fromWorm;
      a.crates = fromCrates;
      while (a.worm.length < state.worm.length) a.worm.push({ ...a.worm[a.worm.length - 1] });
      a.worm.length = state.worm.length;
      while (a.crates.length < state.crates.length) a.crates.push({ ...state.crates[a.crates.length] });
      a.crates.length = state.crates.length;
      const prevR = a.remains;
      a.remains = state.remains.map((p, i) =>
        prevR[i] ? { x: prevR[i].x, y: prevR[i].y, born: prevR[i].born } : { x: p.x, y: p.y, born: now },
      );
      const prevK = a.keys;
      a.keys = state.keys.map((p, i) =>
        prevK[i] ? { x: prevK[i].x, y: prevK[i].y, born: prevK[i].born } : { x: p.x, y: p.y, born: now },
      );
      a.t0 = now;
      if (state.worm.length > 1) {
        const dx = state.worm[0].x - state.worm[1].x;
        const dy = state.worm[0].y - state.worm[1].y;
        if (dx !== 0 || dy !== 0) {
          const m = Math.hypot(dx, dy) || 1;
          a.dirX = dx / m; a.dirY = dy / m;
        }
      }
      spawnEventFx(state.lastEvents, state);
      if (sound) sfx.playEvents(state.lastEvents);
      if (state.lastEvents.some((ev) => ev.type === "slide")) a.slideUntil = now + 420;
      // apples that vanished since the previous state → juicy burst
      if (prev.apples.length > state.apples.length) {
        const gone = prev.apples.filter((p) => !state.apples.some((q) => q.x === p.x && q.y === p.y));
        gone.forEach((p) => burstAt(p, "apple"));
      }
    }
    a.lastTurn = state.turn;
    a.lastLevelKey = levelKey;
    stateRef.current = state;
  }

  function cellPx(): number {
    const { cell } = sizeRef.current;
    return cell;
  }
  function cx(p: Pos): number { return (p.x + 0.5) * cellPx(); }
  function cy(p: Pos): number { return (p.y + 0.5) * cellPx(); }

  function burstAt(p: Pos, kind: "apple" | "dig" | "split" | "win" | "death" | "push" | "crumble" | "key" | "unlock" | "slide") {
    if (quality === "low" && !["apple", "win", "death"].includes(kind)) return;
    const x = cx(p), y = cy(p), cell = cellPx();
    const defs: Record<string, { n: number; colors: string[]; speed: number; gravity: number; kind: Particle["kind"]; size: number }> = {
      apple: { n: 16, colors: ["#e82f3a", "#ff878f", "#9c1c24", "#5fb833"], speed: 2.2, gravity: 0.09, kind: "crumb", size: 0.07 },
      dig: { n: 14, colors: ["#8a6a42", "#5f4426", "#9a7648"], speed: 1.8, gravity: 0.11, kind: "crumb", size: 0.08 },
      split: { n: 14, colors: ["#f09c9c", "#ea6a65", "#c95167"], speed: 2.0, gravity: 0.10, kind: "crumb", size: 0.07 },
      win: { n: 40, colors: ["#ff3377", "#ff8fb3", "#ffcf33", "#f09c9c", "#ffffff"], speed: 3.0, gravity: 0.06, kind: "heart", size: 0.11 },
      death: { n: 16, colors: ["rgba(20,14,10,0.5)", "rgba(20,14,10,0.4)", "rgba(20,14,10,0.3)"], speed: 1.2, gravity: -0.01, kind: "wash", size: 0.18 },
      push: { n: 6, colors: ["rgba(196,137,87,0.45)", "rgba(122,79,40,0.3)"], speed: 0.9, gravity: 0.02, kind: "wash", size: 0.10 },
      crumble: { n: 16, colors: ["#8d6a3d", "#6b4c28", "#a07a48"], speed: 1.9, gravity: 0.12, kind: "crumb", size: 0.09 },
      key: { n: 12, colors: ["#ffcf33", "#f2c232", "#ffffff"], speed: 1.4, gravity: -0.005, kind: "sparkle", size: 0.06 },
      unlock: { n: 10, colors: ["#d99f18", "#fce570", "#8a6210"], speed: 1.6, gravity: 0.05, kind: "sparkle", size: 0.06 },
      slide: { n: 10, colors: ["#c7e9f8", "#ffffff"], speed: 1.2, gravity: 0.0, kind: "sparkle", size: 0.06 },
    };
    const d = defs[kind];
    for (let i = 0; i < d.n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = d.speed * (0.4 + Math.random() * 0.9) * (cell / 40);
      fx.current.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - d.speed * 0.3,
        life: 0, maxLife: 500 + Math.random() * 600,
        size: cell * d.size * (0.6 + Math.random() * 0.8),
        color: d.colors[(Math.random() * d.colors.length) | 0],
        gravity: d.gravity, kind: d.kind,
        rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  function spawnEventFx(events: GameEvent[], s: GameState) {
    for (const ev of events) {
      if (ev.type === "ate") burstAt(ev.at, "apple");
      else if (ev.type === "dig") burstAt(ev.at, "dig");
      else if (ev.type === "split") {
        const tail = s.worm[s.worm.length - 1];
        if (tail) burstAt(tail, "split");
      } else if (ev.type === "push") burstAt(ev.to, "push");
      else if (ev.type === "death") burstAt(ev.at, "death");
      else if (ev.type === "win") burstAt(ev.at, "win");
      else if (ev.type === "crumble") burstAt(ev.at, "crumble");
      else if (ev.type === "key") burstAt(ev.at, "key");
      else if (ev.type === "unlock") burstAt(ev.at, "unlock");
      else if (ev.type === "slide") {
        const head = s.worm[0];
        if (head) burstAt(head, "slide");
      } else if (ev.type === "move") {
        const tail = s.worm[s.worm.length - 1];
        if (tail && quality === "high" && Math.random() < 0.4) burstAt(tail, "push");
      }
    }
  }

  // ── the render loop ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let alive = true;

    const measure = () => {
      const s = stateRef.current;
      const availW = wrap.clientWidth || 480;
      const cell = Math.max(16, Math.min(maxCellPx, Math.floor(availW / s.width)));
      const pad = quality === "low" ? 10 : Math.round(cell * 0.55);
      const w = s.width * cell + pad * 2;
      const h = s.height * cell + pad * 2;
      sizeRef.current = { cell, w, h, pad };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticKey.current = "";
    };

    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    measure();

    // ── static layer: soil strata · carved tunnels · terrain ────────
    const buildStatic = () => {
      const s = stateRef.current;
      const th = themeRef.current;
      const { cell, w, h, pad } = sizeRef.current;
      const key = `${w}x${h}:${s.terrain.map((r) => r.join("")).join("")}`;
      if (key === staticKey.current && staticLayer.current) return;

      const off = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      off.width = w * dpr;
      off.height = h * dpr;
      const g = off.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawSoil(g, w, h, th, cell);
      drawTunnels(g, s, cell, pad, th);

      const open = doorsOpen(s);
      const occ = new Set<string>();
      s.crates.forEach((p) => occ.add(`${p.x},${p.y}`));
      s.remains.forEach((p) => occ.add(`${p.x},${p.y}`));
      s.worm.forEach((p) => occ.add(`${p.x},${p.y}`));
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          const t = s.terrain[y][x];
          const px = pad + x * cell, py = pad + y * cell;
          const ccx = px + cell / 2, ccy = py + cell / 2;
          if (t === "+") drawDirt(g, px, py, cell, x, y);
          else if (t === "%") drawButton(g, ccx, ccy, cell, occ.has(`${x},${y}`));
          else if (t === "D") drawGate(g, px, py, cell, open);
          else if (t === "X") drawHeart(g, ccx, ccy, cell, 0, x, y, true);
          else if (t === "~") drawSpikes(g, px, py, cell, x, y);
          else if (t === "_") drawIce(g, px, py, cell, x, y);
          else if (t === "=") drawBridge(g, px, py, cell);
          else if (t === "L") drawLock(g, ccx, ccy, cell);
          else if (t === ">" || t === "<" || t === "^" || t === "v") drawValve(g, ccx, ccy, cell, t);
        }
      }
      // pits — collapsed bridges leave dark holes
      s.pits?.forEach((p) => {
        const px = pad + p.x * cell, py = pad + p.y * cell;
        g.fillStyle = "rgba(10,7,5,0.85)";
        roundRect(g, px + 2, py + 2, cell - 4, cell - 4, cell * 0.2);
        g.fill();
      });

      drawFrame(g, w, h, cell, pad);
      staticLayer.current = off;
      staticKey.current = key;
    };

    /** layered soil strata with fossil glyphs */
    const drawSoil = (g: CanvasRenderingContext2D, w: number, h: number, th: SoilTheme, cell: number) => {
      g.fillStyle = th.base;
      g.fillRect(0, 0, w, h);
      const waveH = cell * 1.6, waveL = cell * 6.0, amp = cell * 0.55;
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = pass === 0 ? th.wave1 : th.wave2;
        const step = waveH * 2.1, phase = pass * waveH;
        for (let y = -waveH + phase; y < h + waveH * 2; y += step) {
          g.beginPath();
          g.moveTo(0, y);
          for (let x = 0; x <= w + 40; x += 28) {
            g.lineTo(x, y + Math.sin((x / waveL) * Math.PI * 2 + pass * 1.7) * amp);
          }
          g.lineTo(w, y + waveH * 0.55);
          for (let x = w; x >= 0; x -= 28) {
            g.lineTo(x, y + waveH * 0.55 + Math.sin((x / waveL) * Math.PI * 2 + pass * 1.7) * amp);
          }
          g.closePath();
          g.fill();
        }
      }
      // fossil glyphs
      const gw = cell * 3.6, gh = cell * 3.0;
      const cols = Math.ceil(w / gw) + 1, rows = Math.ceil(h / gh) + 1;
      g.lineCap = "round";
      for (let c2 = 0; c2 < cols; c2++) {
        for (let r2 = 0; r2 < rows; r2++) {
          const rnd = cellRand(c2, r2, 77);
          if (rnd() > 0.62) continue;
          const gx = c2 * gw + rnd() * gw * 0.7;
          const gy = r2 * gh + rnd() * gh * 0.7;
          const kind = Math.floor(rnd() * (th.daisies ? 4 : 3));
          g.save(); g.translate(gx, gy);
          if (kind === 0) {
            g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.5, cell * 0.05);
            g.beginPath();
            const turns = 2.2, rr = cell * 0.3;
            for (let a = 0; a < turns * Math.PI * 2; a += 0.25) {
              const rad = rr * (a / (turns * Math.PI * 2));
              const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
              if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.stroke();
          } else if (kind === 1) {
            g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.4, cell * 0.045);
            g.beginPath();
            g.moveTo(-cell * 0.28, 0); g.lineTo(cell * 0.28, 0);
            g.moveTo(-cell * 0.1, -cell * 0.16); g.lineTo(-cell * 0.02, 0);
            g.moveTo(-cell * 0.1, cell * 0.16); g.lineTo(-cell * 0.02, 0);
            g.moveTo(cell * 0.08, -cell * 0.16); g.lineTo(cell * 0.16, 0);
            g.moveTo(cell * 0.08, cell * 0.16); g.lineTo(cell * 0.16, 0);
            g.stroke();
          } else if (kind === 2) {
            g.strokeStyle = th.glyph; g.lineWidth = Math.max(1.2, cell * 0.04);
            g.beginPath(); g.arc(0, 0, cell * 0.05, 0, Math.PI * 2); g.stroke();
            g.beginPath();
            g.moveTo(-cell * 0.18, -cell * 0.1); g.lineTo(-cell * 0.05, 0);
            g.moveTo(cell * 0.18, -cell * 0.1); g.lineTo(cell * 0.05, 0);
            g.stroke();
          } else {
            g.fillStyle = "rgba(250,246,230,0.75)";
            for (let p = 0; p < 6; p++) {
              const an = (p / 6) * Math.PI * 2;
              g.beginPath();
              g.ellipse(Math.cos(an) * cell * 0.11, Math.sin(an) * cell * 0.11, cell * 0.075, cell * 0.045, an, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = "#f4c430";
            g.beginPath(); g.arc(0, 0, cell * 0.055, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        }
      }
    };

    /** tunnels: dark chambers, soft ridge, carved edges */
    const drawTunnels = (g: CanvasRenderingContext2D, s: GameState, cell: number, pad: number, th: SoilTheme) => {
      const at = (x: number, y: number) => (x >= 0 && y >= 0 && y < s.height && x < s.width ? s.terrain[y][x] : "#") as string;
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          if (at(x, y) === "#") continue;
          const px = pad + x * cell, py = pad + y * cell;
          g.fillStyle = th.tunnel;
          g.fillRect(px - 1, py - 1, cell + 2, cell + 2);
          g.fillStyle = th.ridge;
          g.fillRect(px, py + cell * 0.36, cell, cell * 0.27);
        }
      }
      g.strokeStyle = "rgba(12,9,6,0.85)";
      g.lineWidth = Math.max(3, cell * 0.11);
      g.lineCap = "round";
      const ln = (x1: number, y1: number, x2: number, y2: number) => {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      };
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          if (at(x, y) === "#") continue;
          const px = pad + x * cell, py = pad + y * cell;
          if (at(x, y - 1) === "#") ln(px, py, px + cell, py);
          if (at(x, y + 1) === "#") ln(px, py + cell, px + cell, py + cell);
          if (at(x - 1, y) === "#") ln(px, py, px, py + cell);
          if (at(x + 1, y) === "#") ln(px + cell, py, px + cell, py + cell);
        }
      }
    };

    /** diggable dirt block */
    const drawDirt = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
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
        g.beginPath(); g.arc(bx, by, s * (0.05 + rnd() * 0.06), 0, Math.PI * 2);
        g.fillStyle = rnd() > 0.5 ? "rgba(210,180,130,0.5)" : "rgba(58,42,24,0.5)";
        g.fill();
      }
      g.strokeStyle = "rgba(46,32,16,0.6)"; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0 + s * 0.1, y0 + s * 0.35);
      g.quadraticCurveTo(x0 + s * 0.5, y0 + s * 0.5, x0 + s * 0.92, y0 + s * 0.3);
      g.stroke();
      g.restore();
    };

    /** yellow floor button — depresses when weighted */
    const drawButton = (g: CanvasRenderingContext2D, ccx: number, ccy: number, cell: number, pressed: boolean) => {
      const rx = cell * 0.36, ry = cell * (pressed ? 0.2 : 0.3);
      const oy = pressed ? cell * 0.06 : 0;
      g.beginPath();
      g.ellipse(ccx, ccy + oy, rx * 1.12, ry * 1.35 + cell * 0.04, 0, 0, Math.PI * 2);
      g.fillStyle = "#b88914"; g.fill();
      g.beginPath();
      g.ellipse(ccx, ccy + oy - cell * 0.02, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = pressed ? "#e6b422" : "#ffcf33";
      g.fill();
      g.strokeStyle = "#b88914"; g.lineWidth = 2; g.stroke();
      g.beginPath();
      g.ellipse(ccx - rx * 0.25, ccy + oy - ry * 0.55, rx * 0.42, ry * 0.32, -0.3, 0, Math.PI * 2);
      g.fillStyle = pressed ? "rgba(255,238,150,0.55)" : "#ffea75";
      g.fill();
    };

    /** golden gate: bars sealed → glowing portal open */
    const drawGate = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, open: boolean) => {
      const ccx = px + cell / 2, ccy = py + cell / 2;
      if (open) {
        const grad = g.createRadialGradient(ccx, ccy, cell * 0.05, ccx, ccy, cell * 0.62);
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
        g.fillRect(bx + bw * 0.18, py + cell * 0.1, bw * 0.3, cell * 0.78);
        g.fillStyle = "#d99f18";
      }
      g.strokeStyle = "#8a6210"; g.lineWidth = 2;
      g.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
    };

    /** the heart goal */
    const drawHeart = (g: CanvasRenderingContext2D, ccx: number, ccy: number, cell: number, t: number, x: number, y: number, still = false) => {
      const size = cell * 0.42;
      const bob = still ? 0 : Math.sin(t * 0.003 + x) * cell * 0.05;
      const pulse = still ? 1 : 1 + Math.sin(t * 0.005) * 0.05;
      g.save();
      g.translate(ccx, ccy + bob);
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
      g.fillStyle = "#ffd1e0";
      for (let i = 0; i < 3; i++) {
        const an = (still ? x * 2.1 : t * 0.002) + (i * Math.PI * 2) / 3;
        const sx = ccx + Math.cos(an) * size * 0.95;
        const sy = ccy + bob + Math.sin(an) * size * 0.95;
        g.beginPath();
        g.moveTo(sx, sy - 3.2); g.lineTo(sx + 1.6, sy - 1.1); g.lineTo(sx + 3.2, sy - 3.2);
        g.lineTo(sx + 1.1, sy + 0.4); g.lineTo(sx + 3.2, sy + 2.2); g.lineTo(sx, sy + 1.2);
        g.lineTo(sx - 3.2, sy + 2.2); g.lineTo(sx - 1.1, sy + 0.4); g.lineTo(sx - 3.2, sy - 3.2);
        g.lineTo(sx - 1.6, sy - 1.1);
        g.closePath(); g.fill();
      }
      void y;
    };

    /** cartoon steel spikes */
    const drawSpikes = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
      const rnd = cellRand(x, y, 9);
      roundRect(g, px + cell * 0.08, py + cell * 0.72, cell * 0.84, cell * 0.16, cell * 0.05);
      g.fillStyle = "#4a4a52"; g.fill();
      g.strokeStyle = "#26262c"; g.lineWidth = 1.5; g.stroke();
      const tips = [0.26, 0.5, 0.74];
      for (const tp of tips) {
        const tx = px + cell * tp;
        const ty = py + cell * (0.3 + rnd() * 0.08);
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
    };

    /** wooden one-way valve sign */
    const drawValve = (g: CanvasRenderingContext2D, ccx: number, ccy: number, cell: number, t: string) => {
      const d = t === ">" ? [1, 0] : t === "<" ? [-1, 0] : t === "^" ? [0, -1] : [0, 1];
      roundRect(g, ccx - cell * 0.36, ccy - cell * 0.36, cell * 0.72, cell * 0.72, cell * 0.16);
      g.fillStyle = "#543b2d"; g.fill();
      g.strokeStyle = "#3a291e"; g.lineWidth = 2; g.stroke();
      roundRect(g, ccx - cell * 0.28, ccy - cell * 0.28, cell * 0.56, cell * 0.56, cell * 0.12);
      g.fillStyle = "#6b4c38"; g.fill();
      const ax = d[0], ay = d[1];
      g.strokeStyle = "#fdeccc"; g.lineWidth = Math.max(2.5, cell * 0.09);
      g.lineCap = "round"; g.lineJoin = "round";
      const s = cell * 0.2;
      g.beginPath();
      g.moveTo(ccx - ax * s - ay * s * 0.85, ccy - ay * s + ax * s * 0.85);
      g.lineTo(ccx + ax * s * 0.9, ccy + ay * s * 0.9);
      g.lineTo(ccx - ax * s + ay * s * 0.85, ccy - ay * s - ax * s * 0.85);
      g.stroke();
    };

    /** frost tile */
    const drawIce = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
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
    };

    /** plank bridge */
    const drawBridge = (g: CanvasRenderingContext2D, px: number, py: number, cell: number) => {
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
      g.beginPath();
      g.moveTo(px + 2, py + cell * 0.16); g.lineTo(px + cell - 2, py + cell * 0.16);
      g.moveTo(px + 2, py + cell * 0.84); g.lineTo(px + cell - 2, py + cell * 0.84);
      g.stroke();
    };

    /** golden padlock */
    const drawLock = (g: CanvasRenderingContext2D, ccx: number, ccy: number, cell: number) => {
      const s = cell * 0.32;
      g.beginPath();
      g.arc(ccx, ccy - s * 0.55, s * 0.62, Math.PI, Math.PI * 2);
      g.strokeStyle = "#8a6210"; g.lineWidth = Math.max(3, cell * 0.08);
      g.stroke();
      roundRect(g, ccx - s, ccy - s * 0.35, s * 2, s * 1.55, s * 0.3);
      const lg = g.createLinearGradient(ccx, ccy - s * 0.35, ccx, ccy + s * 1.2);
      lg.addColorStop(0, "#f2c232"); lg.addColorStop(1, "#c9920f");
      g.fillStyle = lg; g.fill();
      g.strokeStyle = "#8a6210"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#6b4a08";
      g.beginPath(); g.arc(ccx, ccy + s * 0.28, s * 0.2, 0, Math.PI * 2); g.fill();
      g.fillRect(ccx - s * 0.07, ccy + s * 0.28, s * 0.14, s * 0.5);
    };

    /** the game-card frame */
    const drawFrame = (g: CanvasRenderingContext2D, w: number, h: number, cell: number, pad: number) => {
      g.beginPath();
      roundRect(g, pad - cell * 0.18, pad - cell * 0.18, w - pad * 2 + cell * 0.36, h - pad * 2 + cell * 0.36, cell * 0.45);
      g.strokeStyle = "rgba(15,10,7,0.55)";
      g.lineWidth = Math.max(3, cell * 0.1);
      g.stroke();
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.74);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.16)");
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    };

    // ── dynamic entities (redrawn every frame) ─────────────────────
    const drawApple = (g: CanvasRenderingContext2D, gx: number, gy: number, cell: number, bobSeed: number) => {
      const { pad } = sizeRef.current;
      const r = cell * 0.42;
      const ccx = pad + (gx + 0.5) * cell, ccy = pad + (gy + 0.5) * cell;
      const bob = Math.sin(performance.now() * 0.003 + bobSeed) * r * 0.06;
      g.save();
      g.translate(ccx, ccy + bob);
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
    };

    const drawWalnut = (g: CanvasRenderingContext2D, gx: number, gy: number, cell: number) => {
      const { pad } = sizeRef.current;
      const r = cell * 0.4;
      const ccx = pad + (gx + 0.5) * cell, ccy = pad + (gy + 0.5) * cell;
      const rnd = cellRand(gx, gy, 21);
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.beginPath(); g.ellipse(ccx, ccy + r * 0.9, r * 0.75, r * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(ccx, ccy, r, 0, Math.PI * 2);
      const wg = g.createRadialGradient(ccx - r * 0.3, ccy - r * 0.35, r * 0.15, ccx, ccy, r);
      wg.addColorStop(0, "#dda15e"); wg.addColorStop(0.65, "#c48957"); wg.addColorStop(1, "#9a683c");
      g.fillStyle = wg; g.fill();
      g.strokeStyle = "#7a4f28"; g.lineWidth = 2.2; g.stroke();
      g.strokeStyle = "rgba(122,79,40,0.85)"; g.lineWidth = 1.6; g.lineCap = "round";
      g.beginPath();
      g.moveTo(ccx - r * 0.42, ccy - r * 0.52);
      g.quadraticCurveTo(ccx + r * 0.1, ccy + r * 0.1, ccx - r * 0.18, ccy + r * 0.62);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        const bx = ccx + (rnd() - 0.5) * r * 1.1, by = ccy + (rnd() - 0.5) * r * 1.1;
        if (Math.hypot(bx - ccx, by - ccy) < r * 0.72) {
          g.beginPath(); g.arc(bx, by, r * 0.1, 0, Math.PI * 2);
          g.fillStyle = "rgba(122,79,40,0.35)"; g.fill();
        }
      }
    };

    const drawKey = (g: CanvasRenderingContext2D, gx: number, gy: number, cell: number, born: number) => {
      const { pad } = sizeRef.current;
      const ccx = pad + (gx + 0.5) * cell, ccy = pad + (gy + 0.5) * cell;
      const r = cell * 0.19;
      const age = Math.min(1, (performance.now() - born) / 400);
      const bob = Math.sin(performance.now() * 0.0028 + gx) * cell * 0.04;
      g.save();
      g.translate(ccx, ccy + bob + (1 - age) * -cell * 0.3);
      g.rotate(-0.6);
      g.globalAlpha = age;
      g.strokeStyle = "#8a6210"; g.lineWidth = Math.max(3, cell * 0.1); g.lineCap = "round";
      g.beginPath(); g.arc(-cell * 0.13, 0, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-cell * 0.13 + r, 0); g.lineTo(cell * 0.2, 0); g.stroke();
      g.beginPath();
      g.moveTo(cell * 0.2, 0); g.lineTo(cell * 0.2, cell * 0.1);
      g.moveTo(cell * 0.12, 0); g.lineTo(cell * 0.12, cell * 0.08);
      g.stroke();
      g.strokeStyle = "#f2c232"; g.lineWidth = Math.max(1.8, cell * 0.05);
      g.beginPath(); g.arc(-cell * 0.13, 0, r, -0.6, Math.PI * 1.4); g.stroke();
      g.restore();
    };

    /** a dropped half sleeps where it fell */
    const drawRemain = (g: CanvasRenderingContext2D, gx: number, gy: number, cell: number, born: number) => {
      const { pad } = sizeRef.current;
      const ccx = pad + (gx + 0.5) * cell, ccy = pad + (gy + 0.5) * cell;
      const r = cell * 0.34;
      const age = Math.min(1, (performance.now() - born) / 500);
      g.globalAlpha = age;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath(); g.ellipse(ccx, ccy + r * 0.8, r * 0.9, r * 0.25, 0, 0, Math.PI * 2); g.fill();
      const breathe = 1 + Math.sin(performance.now() * 0.002) * 0.04;
      g.beginPath(); g.arc(ccx, ccy, r * breathe + Math.max(1.2, r * 0.1), 0, Math.PI * 2);
      g.fillStyle = WORM.outline; g.fill();
      g.beginPath(); g.arc(ccx, ccy, r * breathe, 0, Math.PI * 2);
      g.fillStyle = "#f09c9c"; g.fill();
      g.strokeStyle = "#5c2a34"; g.lineWidth = Math.max(1.8, cell * 0.05); g.lineCap = "round";
      g.beginPath(); g.arc(ccx - r * 0.25, ccy - r * 0.15, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath(); g.arc(ccx + r * 0.55, ccy - r * 0.55, r * 0.14, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    };

    /** THE WORM — salmon tube, coral head + saddle, dark outline,
     *  one googly eye, tail badge. Drawn like the real game. */
    const drawWorm = (g: CanvasRenderingContext2D, cells: { x: number; y: number }[], cell: number, t: number, sliding: boolean) => {
      if (cells.length === 0) return;
      const { pad } = sizeRef.current;
      const pts = cells.map((p) => ({ x: pad + (p.x + 0.5) * cell, y: pad + (p.y + 0.5) * cell }));
      const wdt = cell * 0.72;
      const ol = Math.max(1.6, cell * 0.045); // dark outline width

      // ground shadow
      g.save();
      g.strokeStyle = WORM.shadow;
      g.lineWidth = wdt * 0.92;
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y + cell * 0.14);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y + cell * 0.14);
      if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y + cell * 0.14);
      g.stroke();
      g.restore();

      g.lineCap = "round"; g.lineJoin = "round";

      // pass 1 — the dark outline under the whole tube (the game has one)
      g.strokeStyle = WORM.outline;
      g.lineWidth = wdt + ol * 2;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y);
      g.stroke();

      // pass 2 — colored tube: head is coral; saddle on 1–3; body salmon
      const segColor = (i: number) => (i <= 3 ? WORM.saddle : WORM.body);
      for (let i = pts.length - 1; i > 0; i--) {
        g.strokeStyle = segColor(i - 1);
        g.lineWidth = wdt;
        g.beginPath();
        g.moveTo(pts[i].x, pts[i].y);
        g.lineTo(pts[i - 1].x, pts[i - 1].y);
        g.stroke();
      }

      // pass 3 — knuckle joints, each with its dark ring
      for (let i = pts.length - 1; i >= 0; i--) {
        const r = wdt / 2;
        g.beginPath(); g.arc(pts[i].x, pts[i].y, r + ol, 0, Math.PI * 2);
        g.fillStyle = WORM.outline; g.fill();
        g.beginPath(); g.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
        g.fillStyle = segColor(i); g.fill();
      }

      // pass 4 — soft top light
      g.strokeStyle = "rgba(255,235,240,0.32)";
      g.lineWidth = wdt * 0.16;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y - wdt * 0.22);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y - wdt * 0.22);
      g.stroke();

      // look direction
      const a = animRef.current;
      let dx = a.dirX, dy = a.dirY;
      if (pts.length > 1) {
        const ddx = pts[0].x - pts[1].x, ddy = pts[0].y - pts[1].y;
        if (ddx !== 0 || ddy !== 0) {
          const m = Math.hypot(ddx, ddy) || 1;
          dx = ddx / m; dy = ddy / m;
        }
      }

      // tail badge — the length counter
      if (pts.length >= 4) {
        const tail = pts[pts.length - 1];
        g.beginPath(); g.arc(tail.x, tail.y, cell * 0.24, 0, Math.PI * 2);
        g.fillStyle = "#ffffff"; g.fill();
        g.strokeStyle = "#222222"; g.lineWidth = 2; g.stroke();
        g.fillStyle = "#111111";
        g.font = `700 ${Math.floor(cell * 0.27)}px Fredoka, "Trebuchet MS", sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(pts.length), tail.x, tail.y + 1);
      }

      // the head — ONE big googly eye
      const head = pts[0];
      const er = cell * 0.26;
      const blink = Math.sin(t * 0.0016 + 1.7) > 0.965 ? 0.12 : 1;
      g.beginPath(); g.arc(head.x, head.y, er, 0, Math.PI * 2);
      g.fillStyle = "#ffffff"; g.fill();
      g.strokeStyle = WORM.eyeRim; g.lineWidth = Math.max(2, cell * 0.055); g.stroke();
      if (blink < 1) {
        g.strokeStyle = "#1a1a1a"; g.lineWidth = Math.max(2, cell * 0.06);
        g.beginPath();
        g.moveTo(head.x - er * 0.7, head.y); g.lineTo(head.x + er * 0.7, head.y);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(head.x + dx * er * 0.35, head.y + dy * er * 0.35, er * 0.52, 0, Math.PI * 2);
        g.fillStyle = WORM.pupil; g.fill();
        g.beginPath();
        g.arc(head.x + dx * er * 0.35 - er * 0.16, head.y + dy * er * 0.35 - er * 0.16, er * 0.17, 0, Math.PI * 2);
        g.fillStyle = "#ffffff"; g.fill();
      }

      // sliding: frosty speed streaks behind the head
      if (sliding) {
        g.strokeStyle = "rgba(199,233,248,0.6)";
        g.lineWidth = 1.6;
        for (let i = 1; i < Math.min(3, pts.length); i++) {
          g.beginPath();
          g.moveTo(pts[i].x - dx * cell * 0.32, pts[i].y - dy * cell * 0.32);
          g.lineTo(pts[i].x + dx * cell * 0.18, pts[i].y + dy * cell * 0.18);
          g.stroke();
        }
      }
    };

    /** draw one frame */
    const frame = (now: number) => {
      if (!alive) return;
      const s = stateRef.current;
      const a = animRef.current;
      const { cell, w, h } = sizeRef.current;
      buildStatic();

      ctx.clearRect(0, 0, w, h);
      if (staticLayer.current) ctx.drawImage(staticLayer.current, 0, 0, w, h);

      const e = easeOutCubic(Math.min(1, (now - a.t0) / transitionMs));
      const wormCells = a.worm.map((p, i) => {
        const to = s.worm[i] ?? p;
        return { x: lerp(p.x, to.x, e), y: lerp(p.y, to.y, e) };
      });
      const sliding = now < a.slideUntil;

      a.keys.forEach((k, i) => {
        const to = s.keys[i];
        if (to) drawKey(ctx, to.x, to.y, cell, k.born || now);
      });
      s.apples.forEach((p, i) => drawApple(ctx, p.x, p.y, cell, i * 1.3));
      a.crates.forEach((c, i) => {
        const to = s.crates[i] ?? c;
        drawWalnut(ctx, lerp(c.x, to.x, e), lerp(c.y, to.y, e), cell);
      });
      a.remains.forEach((r, i) => {
        const to = s.remains[i] ?? r;
        drawRemain(ctx, to.x, to.y, cell, r.born || now);
      });

      drawWorm(ctx, wormCells, cell, now, sliding);

      // status vignette: death = dark, win = rosy glow
      if (s.status === "dead") {
        ctx.fillStyle = "rgba(10,8,6,0.35)";
        ctx.fillRect(0, 0, w, h);
      } else if (s.status === "won") {
        const gl = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
        gl.addColorStop(0, "rgba(255,150,190,0.30)");
        gl.addColorStop(1, "rgba(255,150,190,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(0, 0, w, h);
      }

      // particles
      const dt = 16;
      for (let i = fx.current.length - 1; i >= 0; i--) {
        const p = fx.current[i];
        p.life += dt;
        if (p.life >= p.maxLife) { fx.current.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        p.vy += p.gravity;
        p.rot += p.vrot;
        const alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === "ink" || p.kind === "crumb") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "confetti") {
          ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
        } else if (p.kind === "heart") {
          const s2 = p.size;
          ctx.beginPath();
          ctx.moveTo(0, s2);
          ctx.bezierCurveTo(-s2 * 1.2, -s2 * 0.4, -s2 * 0.7, -s2 * 1.3, 0, -s2 * 0.5);
          ctx.bezierCurveTo(s2 * 0.7, -s2 * 1.3, s2 * 1.2, -s2 * 0.4, 0, s2);
          ctx.fill();
        } else if (p.kind === "wash") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "sparkle") {
          ctx.beginPath();
          for (let k2 = 0; k2 < 4; k2++) {
            const ang = (k2 / 4) * Math.PI * 2;
            const rr = k2 % 2 === 0 ? p.size * 1.6 : p.size * 0.5;
            if (k2 === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [quality, maxCellPx, transitionMs, sound, theme]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%" }}>
      <canvas ref={canvasRef} className="block w-full h-auto" style={{ imageRendering: "auto" }} />
    </div>
  );
}
