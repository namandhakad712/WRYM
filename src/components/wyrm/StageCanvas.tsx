"use client";

// ── WYRM.LAB · StageCanvas — the human-eye render ────────────────────
// THE FIELD NOTEBOOK. The same deterministic state the AI parses as
// ASCII is drawn here as a page from a naturalist's engraving portfolio:
//
//  · parchment ground with fiber mottling and a fine double-rule frame
//  · bedrock rendered in cross-hatched ink, the classic engraving idiom
//  · the worm is ONE continuous ink creature — a tapered spline body
//    with segment sutures, a proud head, patient blinking eyes
//  · turn transitions are tweened (easeOutCubic); crates glide;
//    apples cast a wax-red presence; the exit is a sealed stamp
//  · every game event spawns ink: splashes, sepia crumbs, debris when
//    a bridge collapses, a red flourish on victory, grey wash on death
//  · the static terrain layer is cached offscreen and only redrawn
//    when the terrain mutates (dig / crumble / unlock)
//
// Pure client component. No assets are loaded — everything is drawn.

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
}

// ── palette · ink on paper ───────────────────────────────────────────
const C = {
  // paper
  page: "#f4eddd",
  pageLo: "#ece2cc",
  pageHi: "#faf5e9",
  fiber: "rgba(120,96,60,0.05)",
  // ink
  ink: "#221c14",
  inkSoft: "#3a3226",
  inkFaint: "rgba(34,28,20,0.16)",
  inkGhost: "rgba(34,28,20,0.07)",
  hatch: "rgba(34,28,20,0.55)",
  hatch2: "rgba(34,28,20,0.28)",
  // wax red — the single accent, used with restraint
  wax: "#a33327",
  waxDeep: "#7c221a",
  waxHi: "#c9584a",
  // supporting tints
  sepia: "#8a6a42",
  sepiaDark: "#6b4f2e",
  ice: "#dfe9ec",
  iceEdge: "#9fb6bd",
  iceCrystal: "rgba(120,150,160,0.5)",
  wood: "#a07a48",
  woodDark: "#77572f",
  brass: "#9c7c2f",
  // entities
  apple: "#b03a2a",
  appleHi: "#d0604f",
  appleLeaf: "#5a7242",
  remain: "rgba(90,82,68,0.85)",
  remainEdge: "rgba(60,54,44,0.9)",
  // ── naturalist's earthworm (Lumbricus) — rose-tan body, brown ink ──
  wormBody: "#c9917a",      // dorsal rose-tan
  wormBodyLo: "#a56d58",    // shaded flank
  wormBelly: "#dcae9a",     // pale ventral side
  wormRing: "#8f5a44",      // annular suture ink
  wormEdge: "#5c3a2c",      // body outline (iron-gall over rose)
  wormHi: "#eec3ad",        // slime sheen
  wormEye: "#2b201a",       // bead eye
  // ── real materials ──
  soil: "#6e4f30",          // fresh earth
  soilDark: "#4c3722",
  soilHi: "#8a6a42",
  pebble: "#9a8a72",
  root: "#7a5a38",
  woodDoor: "#8a6238",
  woodDoorDark: "#5f4224",
  iron: "#4a4a52",
  ironHi: "#7a7a86",
  brassPlate: "#b09248",
  brassDark: "#7c6528",
  burrow: "#2e2317",        // the exit — a hole in the earth
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// deterministic per-cell noise
function cellRand(x: number, y: number, salt = 0) {
  let r = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) & 0x7fffffff;
  return () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// ── particles ────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; gravity: number; kind: "ink" | "crumb" | "confetti" | "wash" | "sparkle";
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
      // new board — snap instantly, no tween
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
      // apples that vanished since the previous state → ink burst
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
      apple: { n: 16, colors: [C.wax, C.waxHi, C.waxDeep, C.ink], speed: 2.2, gravity: 0.09, kind: "ink", size: 0.07 },
      dig: { n: 14, colors: [C.sepia, C.sepiaDark, C.inkSoft], speed: 1.8, gravity: 0.11, kind: "crumb", size: 0.08 },
      split: { n: 14, colors: [C.ink, C.inkSoft, "#4a4234"], speed: 2.0, gravity: 0.10, kind: "ink", size: 0.07 },
      win: { n: 46, colors: [C.wax, C.waxHi, C.brass, C.ink, "#d9c68a"], speed: 3.2, gravity: 0.06, kind: "confetti", size: 0.10 },
      death: { n: 16, colors: ["rgba(90,82,68,0.5)", "rgba(60,54,44,0.45)", "rgba(34,28,20,0.3)"], speed: 1.2, gravity: -0.01, kind: "wash", size: 0.18 },
      push: { n: 6, colors: ["rgba(138,106,66,0.4)", "rgba(34,28,20,0.2)"], speed: 0.9, gravity: 0.02, kind: "wash", size: 0.10 },
      crumble: { n: 16, colors: [C.inkSoft, "#57503c", C.sepia], speed: 1.9, gravity: 0.12, kind: "crumb", size: 0.09 },
      key: { n: 12, colors: [C.wax, C.waxHi, C.brass], speed: 1.4, gravity: -0.005, kind: "sparkle", size: 0.06 },
      unlock: { n: 10, colors: [C.ink, C.inkSoft], speed: 1.6, gravity: 0.05, kind: "ink", size: 0.06 },
      slide: { n: 10, colors: [C.iceEdge, "rgba(159,182,189,0.6)"], speed: 1.2, gravity: 0.0, kind: "sparkle", size: 0.06 },
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
      const pad = quality === "low" ? 10 : 22;
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

    // ── static layer: parchment / hatched rock / decor / frame ──────
    const buildStatic = () => {
      const s = stateRef.current;
      const { cell, w, h, pad } = sizeRef.current;
      const key = `${w}x${h}:${s.terrain.map((r) => r.join("")).join("")}`;
      if (key === staticKey.current && staticLayer.current) return;

      const off = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      off.width = w * dpr;
      off.height = h * dpr;
      const g = off.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // parchment ground with slow mottling
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, C.pageHi);
      bg.addColorStop(0.5, C.page);
      bg.addColorStop(1, C.pageLo);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // fiber flecks
      const fr = cellRand(7, 13);
      const flecks = quality === "high" ? (w * h) / 900 : (w * h) / 2200;
      for (let i = 0; i < flecks; i++) {
        const fxp = fr() * w, fyp = fr() * h;
        g.fillStyle = fr() > 0.6 ? C.fiber : "rgba(34,28,20,0.03)";
        g.fillRect(fxp, fyp, 1 + fr() * 1.6, 0.8 + fr());
      }

      // cells
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          const t = s.terrain[y][x];
          const px = pad + x * cell;
          const py = pad + y * cell;
          if (t === "#") {
            // pits (crumbled bridges) get a round hatched hole
            const isPit = s.pits?.some((p) => p.x === x && p.y === y);
            drawRock(g, px, py, cell, x, y, s, isPit);
          } else {
            drawGround(g, px, py, cell, x, y, t, s);
          }
        }
      }

      // plate engraved rings
      const ps = platesSatisfied(s);
      void ps;

      // the plate frame: fine double rule, like an engraving plate
      g.strokeStyle = C.ink;
      g.lineWidth = 1.6;
      g.strokeRect(pad - 8.5, pad - 8.5, w - pad * 2 + 17, h - pad * 2 + 17);
      g.strokeStyle = "rgba(34,28,20,0.45)";
      g.lineWidth = 0.7;
      g.strokeRect(pad - 5.5, pad - 5.5, w - pad * 2 + 11, h - pad * 2 + 11);

      // corner ticks
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      const t0 = 10;
      const corners: [number, number, number, number][] = [
        [pad - 8.5, pad - 8.5, 1, 1], [w - pad + 8.5, pad - 8.5, -1, 1],
        [pad - 8.5, h - pad + 8.5, 1, -1], [w - pad + 8.5, h - pad + 8.5, -1, -1],
      ];
      for (const [cxx, cyy, sx, sy] of corners) {
        g.beginPath();
        g.moveTo(cxx + sx * t0, cyy);
        g.lineTo(cxx, cyy);
        g.lineTo(cxx, cyy + sy * t0);
        g.stroke();
      }

      // soft page shadow at the edges
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(80,60,30,0.10)");
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);

      staticLayer.current = off;
      staticKey.current = key;
    };

    /** open ground: paper with a whisper of a grid dot */
    const drawGround = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number, t: string, s: GameState) => {
      // faint checker to help the eye track distance
      if ((x + y) % 2 === 0) {
        g.fillStyle = "rgba(34,28,20,0.022)";
        g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      }
      // hairline cell rule
      g.strokeStyle = "rgba(34,28,20,0.055)";
      g.lineWidth = 1;
      g.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      // center dot
      g.fillStyle = "rgba(34,28,20,0.10)";
      g.beginPath();
      g.arc(px + cell / 2, py + cell / 2, 0.9, 0, Math.PI * 2);
      g.fill();

      if (t === "+") drawDirt(g, px, py, cell, x, y);
      if (t === "%") drawPlate(g, px, py, cell);
      if (t === "~") drawSpikes(g, px, py, cell, x, y);
      if (t === "X") drawExitStamp(g, px, py, cell);
      if (t === "D") drawDoor(g, px, py, cell, s);
      if (t === "_") drawIce(g, px, py, cell, x, y);
      if (t === "=") drawBridge(g, px, py, cell, x, y);
      if (t === "L") drawLock(g, px, py, cell);
      if (t === ">" || t === "<" || t === "^" || t === "v") drawValve(g, px, py, cell, t);
    };

    /** bedrock: cross-hatched ink, the engraver's wall */
    const drawRock = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number, s: GameState, isPit: boolean) => {
      g.save();
      g.beginPath();
      g.rect(px, py, cell, cell);
      g.clip();

      if (isPit) {
        // a hole in the page: dark pit with hatch walls
        g.fillStyle = "#e6dcc4";
        g.fillRect(px, py, cell, cell);
        const c = px + cell / 2, cyp = py + cell / 2;
        g.beginPath();
        g.ellipse(c, cyp, cell * 0.38, cell * 0.34, 0, 0, Math.PI * 2);
        g.fillStyle = "#3a3226";
        g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 1.4;
        g.stroke();
        // hatching inside the pit
        g.strokeStyle = "rgba(244,237,221,0.25)";
        g.lineWidth = 0.8;
        for (let i = -cell; i < cell; i += 4.5) {
          g.beginPath();
          g.moveTo(c - cell * 0.4 + i, cyp + cell * 0.4);
          g.lineTo(c - cell * 0.4 + i + cell * 0.5, cyp - cell * 0.4);
          g.stroke();
        }
        g.restore();
        return;
      }

      // solid engraved umber block (not black — engraving walls have weight
      // but let the hatch breathe)
      g.fillStyle = "#3d352a";
      g.fillRect(px, py, cell, cell);
      // diagonal hatching in a lighter ink for texture
      g.strokeStyle = "rgba(244,237,221,0.16)";
      g.lineWidth = 1;
      const rand = cellRand(x, y, 3);
      const phase = rand() * 4;
      for (let i = -cell; i < cell * 2; i += 4.5) {
        g.beginPath();
        g.moveTo(px + i + phase, py - 1);
        g.lineTo(px + i + phase - cell * 0.35, py + cell + 1);
        g.stroke();
      }
      // fine cross-hatch, second direction, fainter
      if (quality === "high") {
        g.strokeStyle = "rgba(244,237,221,0.07)";
        for (let i = -cell; i < cell * 2; i += 6.5) {
          g.beginPath();
          g.moveTo(px + i + phase, py + cell + 1);
          g.lineTo(px + i + phase - cell * 0.35, py - 1);
          g.stroke();
        }
      }
      // top highlight edge when open sky above
      const above = y > 0 ? s.terrain[y - 1][x] : "#";
      if (above !== "#") {
        g.strokeStyle = "rgba(34,28,20,0.95)";
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(px, py + 1);
        g.lineTo(px + cell, py + 1);
        g.stroke();
        g.strokeStyle = "rgba(244,237,221,0.32)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px, py + 2.6);
        g.lineTo(px + cell, py + 2.6);
        g.stroke();
      }
      g.restore();
    };

    /** dirt: a real mound of diggable earth — clods, pebbles, a root,
     *  cracks; torn irregular silhouette so it reads as soft soil. */
    const drawDirt = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
      const rand = cellRand(x, y, 5);
      const inset = cell * 0.08;
      const x0 = px + inset, y0 = py + inset, x1 = px + cell - inset, y1 = py + cell - inset;
      // torn mound silhouette (deterministic wobble on every edge)
      g.beginPath();
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wx = x0 + (x1 - x0) * t;
        const wy = y0 + (rand() - 0.5) * cell * 0.07;
        i === 0 ? g.moveTo(wx, wy) : g.lineTo(wx, wy);
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wy = y0 + (y1 - y0) * t;
        const wx = x1 + (rand() - 0.5) * cell * 0.07;
        g.lineTo(wx, wy);
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wx = x1 - (x1 - x0) * t;
        const wy = y1 + (rand() - 0.5) * cell * 0.07;
        g.lineTo(wx, wy);
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wy = y1 - (y1 - y0) * t;
        const wx = x0 + (rand() - 0.5) * cell * 0.07;
        g.lineTo(wx, wy);
      }
      g.closePath();
      // earth gradient: dark loam low, dry topsoil high
      const sg = g.createLinearGradient(x0, y0, x0, y1);
      sg.addColorStop(0, C.soilHi);
      sg.addColorStop(0.55, C.soil);
      sg.addColorStop(1, C.soilDark);
      g.fillStyle = sg;
      g.fill();
      g.save();
      g.clip();
      // clod bumps — lighter domes of soil
      const clods = quality === "high" ? 5 : 3;
      for (let i = 0; i < clods; i++) {
        const bx = x0 + cell * (0.15 + rand() * 0.7);
        const by = y0 + cell * (0.15 + rand() * 0.7);
        const br = cell * (0.09 + rand() * 0.1);
        g.beginPath();
        g.arc(bx, by, br, Math.PI, Math.PI * 2);
        g.fillStyle = "rgba(190,160,110,0.35)";
        g.fill();
        g.strokeStyle = "rgba(60,44,26,0.4)";
        g.lineWidth = 0.8;
        g.stroke();
      }
      // cracks — dark jagged strokes
      g.strokeStyle = "rgba(40,28,16,0.55)";
      g.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        let cx2 = x0 + cell * (0.1 + rand() * 0.8);
        let cy2 = y0 + cell * (0.15 + rand() * 0.3);
        g.beginPath();
        g.moveTo(cx2, cy2);
        for (let s = 0; s < 3; s++) {
          cx2 += (rand() - 0.5) * cell * 0.24;
          cy2 += cell * 0.12;
          g.lineTo(cx2, cy2);
        }
        g.stroke();
      }
      // pebbles — small pale stones with a shadow side
      const pebbles = quality === "high" ? 3 : 2;
      for (let i = 0; i < pebbles; i++) {
        const bx = x0 + cell * (0.15 + rand() * 0.7);
        const by = y0 + cell * (0.2 + rand() * 0.6);
        const br = cell * (0.045 + rand() * 0.035);
        g.beginPath();
        g.ellipse(bx, by, br, br * 0.8, rand() * Math.PI, 0, Math.PI * 2);
        g.fillStyle = C.pebble;
        g.fill();
        g.strokeStyle = "rgba(60,50,40,0.6)";
        g.lineWidth = 0.6;
        g.stroke();
      }
      // a root fiber threading through
      g.strokeStyle = "rgba(150,110,64,0.8)";
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(x0 + cell * 0.08, y0 + cell * (0.3 + rand() * 0.3));
      g.quadraticCurveTo(x0 + cell * 0.5, y0 + cell * (0.35 + rand() * 0.4), x1 - cell * 0.06, y0 + cell * (0.45 + rand() * 0.3));
      g.stroke();
      // crumb stipple
      g.fillStyle = "rgba(46,34,20,0.5)";
      const crumbs = quality === "high" ? 12 : 6;
      for (let i = 0; i < crumbs; i++) {
        g.beginPath();
        g.arc(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 0.6 + rand() * 0.8, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // outline the torn mound
      g.strokeStyle = C.soilDark;
      g.lineWidth = 1.3;
      g.stroke();
    };

    /** pressure plate: a real riveted brass plate set into the floor */
    const drawPlate = (g: CanvasRenderingContext2D, px: number, py: number, cell: number) => {
      const c = px + cell / 2, cyp = py + cell / 2;
      const r = cell * 0.32;
      // socket shadow — the plate sits recessed
      g.beginPath();
      g.arc(c + 1, cyp + 1.5, r, 0, Math.PI * 2);
      g.fillStyle = "rgba(34,28,20,0.18)";
      g.fill();
      // brass disc with a machined bevel
      const pg = g.createRadialGradient(c - r * 0.35, cyp - r * 0.35, r * 0.15, c, cyp, r);
      pg.addColorStop(0, "#d8bc74");
      pg.addColorStop(0.6, C.brassPlate);
      pg.addColorStop(1, C.brassDark);
      g.beginPath();
      g.arc(c, cyp, r, 0, Math.PI * 2);
      g.fillStyle = pg;
      g.fill();
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      g.stroke();
      // bevel ring
      g.beginPath();
      g.arc(c, cyp, r * 0.78, 0, Math.PI * 2);
      g.strokeStyle = "rgba(255,244,214,0.5)";
      g.lineWidth = 1;
      g.stroke();
      // engraved diamond — the mechanism mark
      g.beginPath();
      g.moveTo(c, cyp - r * 0.34);
      g.lineTo(c + r * 0.34, cyp);
      g.lineTo(c, cyp + r * 0.34);
      g.lineTo(c - r * 0.34, cyp);
      g.closePath();
      g.strokeStyle = "rgba(76,58,20,0.75)";
      g.lineWidth = 1.1;
      g.stroke();
      g.fillStyle = "rgba(76,58,20,0.28)";
      g.fill();
      // four rivets
      g.fillStyle = C.iron;
      for (const [rx, ry] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
        g.beginPath();
        g.arc(c + r * rx, cyp + r * ry, r * 0.1, 0, Math.PI * 2);
        g.fill();
      }
    };

    /** spikes: real steel thorns on a riveted base plate */
    const drawSpikes = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
      const rand = cellRand(x, y, 9);
      // base plate — dark steel strip bolted to the floor
      const bh = cell * 0.16;
      g.fillStyle = "rgba(52,52,60,0.9)";
      g.fillRect(px + cell * 0.08, py + cell * 0.74, cell * 0.84, bh);
      g.strokeStyle = C.ink;
      g.lineWidth = 1.1;
      g.strokeRect(px + cell * 0.08, py + cell * 0.74, cell * 0.84, bh);
      // plate bolts
      g.fillStyle = C.ironHi;
      for (const bx of [0.16, 0.84]) {
        g.beginPath();
        g.arc(px + cell * bx, py + cell * 0.74 + bh / 2, cell * 0.028, 0, Math.PI * 2);
        g.fill();
      }
      // four tapered steel spikes with a lit left edge
      const tips: [number, number][] = [
        [0.24, 0.42 + rand() * 0.06],
        [0.42, 0.3 + rand() * 0.06],
        [0.6, 0.38 + rand() * 0.06],
        [0.78, 0.46 + rand() * 0.06],
      ];
      for (const [tx, ty] of tips) {
        const tipX = px + cell * tx;
        const tipY = py + cell * ty;
        const halfW = cell * 0.055;
        const baseY = py + cell * 0.76;
        g.beginPath();
        g.moveTo(tipX - halfW, baseY);
        g.quadraticCurveTo(tipX - halfW * 0.8, (tipY + baseY) / 2, tipX, tipY);
        g.quadraticCurveTo(tipX + halfW * 0.8, (tipY + baseY) / 2, tipX + halfW, baseY);
        g.closePath();
        const mg = g.createLinearGradient(tipX - halfW, 0, tipX + halfW, 0);
        mg.addColorStop(0, "#8b939e");
        mg.addColorStop(0.45, "#5c6670");
        mg.addColorStop(1, "#3a4048");
        g.fillStyle = mg;
        g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 0.9;
        g.stroke();
        // glint on the left facet
        g.beginPath();
        g.moveTo(tipX - halfW * 0.5, baseY - cell * 0.04);
        g.lineTo(tipX - halfW * 0.12, tipY + cell * 0.06);
        g.strokeStyle = "rgba(235,240,246,0.65)";
        g.lineWidth = 0.8;
        g.stroke();
      }
    };

    /** exit: the burrow — a real hole in the earth, the way out */
    const drawExitStamp = (g: CanvasRenderingContext2D, px: number, py: number, cell: number) => {
      const c = px + cell / 2, cyp = py + cell / 2;
      const rx = cell * 0.34, ry = cell * 0.26;
      // dashed ink halo — affordance for the wandering eye
      g.beginPath();
      g.arc(c, cyp, cell * 0.42, 0, Math.PI * 2);
      g.strokeStyle = "rgba(34,28,20,0.4)";
      g.lineWidth = 1;
      g.setLineDash([3, 3]);
      g.stroke();
      g.setLineDash([]);
      // raised earth rim — soil pushed outward by the digger
      g.beginPath();
      g.ellipse(c, cyp + cell * 0.02, rx * 1.3, ry * 1.45, 0, 0, Math.PI * 2);
      g.fillStyle = C.soil;
      g.fill();
      g.strokeStyle = C.soilDark;
      g.lineWidth = 1.2;
      g.stroke();
      // inner rim highlight (top-lit)
      g.beginPath();
      g.ellipse(c, cyp + cell * 0.02, rx * 1.08, ry * 1.18, 0, Math.PI * 0.95, Math.PI * 2.05);
      g.strokeStyle = "rgba(178,142,96,0.75)";
      g.lineWidth = 1.6;
      g.stroke();
      // the tunnel mouth — deep dark with a faint depth curve
      g.beginPath();
      g.ellipse(c, cyp + cell * 0.03, rx, ry, 0, 0, Math.PI * 2);
      const hg = g.createRadialGradient(c, cyp + cell * 0.05, cell * 0.03, c, cyp + cell * 0.03, rx);
      hg.addColorStop(0, "#0d0a06");
      hg.addColorStop(0.75, C.burrow);
      hg.addColorStop(1, "#4a3a26");
      g.fillStyle = hg;
      g.fill();
      g.strokeStyle = C.soilDark;
      g.lineWidth = 1.1;
      g.stroke();
      // radiating rootlets & crumbs around the rim
      const rand = cellRand(3, 9, 21);
      g.strokeStyle = "rgba(92,66,40,0.7)";
      g.lineWidth = 0.9;
      for (let i = 0; i < 5; i++) {
        const ang = Math.PI * (0.15 + rand() * 0.7) + (rand() > 0.5 ? Math.PI : 0);
        const r1 = rx * 1.25;
        g.beginPath();
        g.moveTo(c + Math.cos(ang) * r1 * 0.9, cyp + Math.sin(ang) * ry * 1.3);
        g.quadraticCurveTo(
          c + Math.cos(ang) * r1 * 1.25, cyp + Math.sin(ang) * ry * 1.7,
          c + Math.cos(ang + (rand() - 0.5) * 0.4) * r1 * 1.5, cyp + Math.sin(ang) * ry * 1.9,
        );
        g.stroke();
      }
      g.fillStyle = "rgba(52,38,22,0.8)";
      for (let i = 0; i < 6; i++) {
        const ang = rand() * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(ang) * rx * (1.35 + rand() * 0.35), cyp + Math.sin(ang) * ry * (1.5 + rand() * 0.4), 0.8 + rand(), 0, Math.PI * 2);
        g.fill();
      }
    };

    /** door: a real timber door in an engraved stone frame — iron bands,
     *  ring handle, hinges; open = swung planks over a dark passage. */
    const drawDoor = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, s: GameState) => {
      const open = doorsOpen(s);
      const f = cell * 0.06; // frame width
      // ── stone frame (always) ──
      g.fillStyle = "#cfc4a6";
      g.fillRect(px, py, cell, cell);
      g.strokeStyle = "rgba(34,28,20,0.5)";
      g.lineWidth = 0.8;
      // masonry joints on the frame
      for (let i = 1; i < 3; i++) {
        g.beginPath();
        g.moveTo(px, py + (cell * i) / 3);
        g.lineTo(px + f, py + (cell * i) / 3);
        g.moveTo(px + cell - f, py + (cell * i) / 3);
        g.lineTo(px + cell, py + (cell * i) / 3);
        g.stroke();
      }
      // passage behind the door
      g.fillStyle = open ? "rgba(30,24,16,0.85)" : "rgba(52,42,28,0.9)";
      g.fillRect(px + f, py + f, cell - f * 2, cell - f * 2);
      if (open) {
        // ── open: the door swung aside (foreshortened plank panel) ──
        g.save();
        g.translate(px + f, py + cell * 0.5);
        g.transform(1, 0, -0.38, 1, 0, 0); // skew = perspective swing
        const dw = (cell - f * 2) * 0.34;
        g.fillStyle = C.woodDoor;
        g.fillRect(0, -cell * 0.44, dw, cell * 0.88);
        g.strokeStyle = C.woodDoorDark;
        g.lineWidth = 1;
        g.strokeRect(0, -cell * 0.44, dw, cell * 0.88);
        g.beginPath();
        g.moveTo(dw * 0.5, -cell * 0.44);
        g.lineTo(dw * 0.5, cell * 0.44);
        g.stroke();
        g.restore();
        // faint light spill from the passage
        g.fillStyle = "rgba(244,237,221,0.10)";
        g.fillRect(px + f + dw * 0.4, py + f, cell - f * 2 - dw * 0.5, cell - f * 2);
      } else {
        // ── closed: the timber panel ──
        const dx = px + f, dy = py + f, dw = cell - f * 2, dh = cell - f * 2;
        // vertical planks with grain
        const planks = 3;
        const pw = dw / planks;
        for (let i = 0; i < planks; i++) {
          const wx = dx + i * pw;
          g.fillStyle = i % 2 === 0 ? C.woodDoor : "#7d5730";
          g.fillRect(wx, dy, pw, dh);
          const rand = cellRand(i, 7, 31);
          g.strokeStyle = "rgba(74,52,26,0.5)";
          g.lineWidth = 0.7;
          for (let k2 = 0; k2 < 2; k2++) {
            const gy = dy + dh * (0.25 + rand() * 0.5);
            g.beginPath();
            g.moveTo(wx + 1.5, gy);
            g.bezierCurveTo(wx + pw * 0.4, gy + 1.5, wx + pw * 0.6, gy - 1.5, wx + pw - 1.5, gy);
            g.stroke();
          }
        }
        g.strokeStyle = C.woodDoorDark;
        g.lineWidth = 1;
        for (let i = 1; i < planks; i++) {
          g.beginPath();
          g.moveTo(dx + i * pw, dy);
          g.lineTo(dx + i * pw, dy + dh);
          g.stroke();
        }
        // panel outline
        g.strokeStyle = C.ink;
        g.lineWidth = 1.4;
        g.strokeRect(dx, dy, dw, dh);
        // two horizontal iron bands with rivets
        g.fillStyle = C.iron;
        for (const by of [dy + dh * 0.22, dy + dh * 0.72]) {
          g.fillRect(dx - 1, by, dw + 2, cell * 0.075);
          g.strokeStyle = C.ink;
          g.lineWidth = 0.8;
          g.strokeRect(dx - 1, by, dw + 2, cell * 0.075);
          g.fillStyle = C.ironHi;
          for (const rx2 of [dx + dw * 0.18, dx + dw * 0.82]) {
            g.beginPath();
            g.arc(rx2, by + cell * 0.037, cell * 0.018, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = C.ironHi;
          }
          g.fillStyle = C.iron;
        }
        // ring handle
        g.strokeStyle = "#3d3d45";
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(dx + dw * 0.74, dy + dh * 0.47, cell * 0.055, 0, Math.PI * 2);
        g.stroke();
        // the wax seal of the wardens — closed = sealed
        g.beginPath();
        g.arc(dx + dw * 0.26, dy + dh * 0.47, cell * 0.075, 0, Math.PI * 2);
        g.fillStyle = C.wax;
        g.fill();
        g.strokeStyle = C.waxDeep;
        g.lineWidth = 1;
        g.stroke();
        g.beginPath();
        const k = cell * 0.028;
        g.moveTo(dx + dw * 0.26 - k, dy + dh * 0.47 - k);
        g.lineTo(dx + dw * 0.26 + k, dy + dh * 0.47 + k);
        g.moveTo(dx + dw * 0.26 + k, dy + dh * 0.47 - k);
        g.lineTo(dx + dw * 0.26 - k, dy + dh * 0.47 + k);
        g.strokeStyle = "rgba(244,237,221,0.85)";
        g.lineWidth = 0.9;
        g.stroke();
      }
      // frame outline
      g.strokeStyle = C.ink;
      g.lineWidth = 1.5;
      g.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
    };

    /** ice: a frozen slab — translucent blue, cracks, frost glints */
    const drawIce = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
      const m = 1.5;
      // slab with an inner bevel (lit top-left, shadowed bottom-right)
      g.beginPath();
      g.rect(px + m, py + m, cell - m * 2, cell - m * 2);
      const ig = g.createLinearGradient(px, py, px + cell, py + cell);
      ig.addColorStop(0, "#eef6f8");
      ig.addColorStop(0.5, C.ice);
      ig.addColorStop(1, "#cfe0e6");
      g.fillStyle = ig;
      g.fill();
      g.strokeStyle = C.iceEdge;
      g.lineWidth = 1.1;
      g.stroke();
      // inner bevel lines
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px + m + 1.5, py + cell - m - 1.5);
      g.lineTo(px + m + 1.5, py + m + 1.5);
      g.lineTo(px + cell - m - 1.5, py + m + 1.5);
      g.stroke();
      g.strokeStyle = "rgba(130,160,172,0.55)";
      g.beginPath();
      g.moveTo(px + cell - m - 1.5, py + m + 1.5);
      g.lineTo(px + cell - m - 1.5, py + cell - m - 1.5);
      g.lineTo(px + m + 1.5, py + cell - m - 1.5);
      g.stroke();
      // fracture lines — deterministic jagged cracks
      const rand = cellRand(x, y, 11);
      g.strokeStyle = "rgba(120,155,168,0.6)";
      g.lineWidth = 0.8;
      for (let i = 0; i < 2; i++) {
        let ax = px + cell * (0.15 + rand() * 0.6);
        let ay = py + cell * (0.15 + rand() * 0.2);
        g.beginPath();
        g.moveTo(ax, ay);
        for (let s = 0; s < 3; s++) {
          ax += (rand() - 0.35) * cell * 0.22;
          ay += cell * (0.12 + rand() * 0.14);
          g.lineTo(ax, ay);
        }
        g.stroke();
      }
      // frost glints — tiny 4-point stars
      g.fillStyle = "rgba(255,255,255,0.9)";
      const glints = quality === "high" ? 3 : 1;
      for (let i = 0; i < glints; i++) {
        const gx = px + cell * (0.2 + rand() * 0.6);
        const gy = py + cell * (0.2 + rand() * 0.6);
        const gr = cell * 0.05;
        g.beginPath();
        for (let k2 = 0; k2 < 4; k2++) {
          const ang = (k2 / 4) * Math.PI * 2;
          const rr = k2 % 2 === 0 ? gr * 1.8 : gr * 0.55;
          k2 === 0 ? g.moveTo(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr) : g.lineTo(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr);
        }
        g.closePath();
        g.fill();
      }
    };

    /** bridge: a rope-lashed plank span over the void */
    const drawBridge = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, x: number, y: number) => {
      // the chasm beneath — deeper every year
      g.fillStyle = "rgba(34,28,20,0.16)";
      g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      g.strokeStyle = "rgba(34,28,20,0.25)";
      g.lineWidth = 0.8;
      // two stringers running the full span
      g.fillStyle = C.woodDark;
      g.fillRect(px + 3, py + cell * 0.2, cell - 6, cell * 0.08);
      g.fillRect(px + 3, py + cell * 0.72, cell - 6, cell * 0.08);
      // deck planks across the stringers
      const planks = 4;
      const pw = (cell - 6) / planks;
      for (let i = 0; i < planks; i++) {
        const bx = px + 3 + i * pw;
        g.fillStyle = C.wood;
        g.fillRect(bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68);
        g.strokeStyle = C.woodDark;
        g.lineWidth = 0.9;
        g.strokeRect(bx + 0.5, py + cell * 0.16, pw - 1.5, cell * 0.68);
        // wood grain
        const rand = cellRand(x, y, i + 17);
        g.strokeStyle = "rgba(119,87,47,0.55)";
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(bx + 2, py + cell * (0.3 + rand() * 0.1));
        g.lineTo(bx + pw - 3, py + cell * (0.55 + rand() * 0.1));
        g.stroke();
      }
      // rope lashings — an X of cord over each plank joint
      g.strokeStyle = "#a68a55";
      g.lineWidth = 1.2;
      for (let i = 0; i <= planks; i++) {
        const rx2 = px + 3 + i * pw;
        g.beginPath();
        g.moveTo(rx2 - 2, py + cell * 0.22);
        g.lineTo(rx2 + 2, py + cell * 0.72);
        g.moveTo(rx2 + 2, py + cell * 0.22);
        g.lineTo(rx2 - 2, py + cell * 0.72);
        g.stroke();
      }
    };

    /** lock: a real brass padlock with a steel shackle */
    const drawLock = (g: CanvasRenderingContext2D, px: number, py: number, cell: number) => {
      const c = px + cell / 2;
      // floor hint
      g.fillStyle = "rgba(34,28,20,0.06)";
      g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      // shackle — steel arc entering the body
      const shR = cell * 0.19;
      const shY = py + cell * 0.42;
      g.beginPath();
      g.arc(c, shY, shR, Math.PI, Math.PI * 2);
      g.lineTo(c + shR, shY + cell * 0.12);
      g.lineTo(c - shR, shY + cell * 0.12);
      g.strokeStyle = C.iron;
      g.lineWidth = cell * 0.07;
      g.lineCap = "round";
      g.stroke();
      // shackle highlight
      g.beginPath();
      g.arc(c, shY, shR, Math.PI * 1.12, Math.PI * 1.55);
      g.strokeStyle = C.ironHi;
      g.lineWidth = cell * 0.024;
      g.stroke();
      // brass body — bevelled rectangle
      const bw = cell * 0.5, bh = cell * 0.38;
      const bx = c - bw / 2, by = py + cell * 0.5;
      const bg2 = g.createLinearGradient(bx, by, bx + bw, by + bh);
      bg2.addColorStop(0, "#d4b168");
      bg2.addColorStop(0.55, C.brassPlate);
      bg2.addColorStop(1, C.brassDark);
      g.beginPath();
      // rounded body
      g.moveTo(bx + 3, by);
      g.arcTo(bx + bw, by, bx + bw, by + bh, 3);
      g.arcTo(bx + bw, by + bh, bx, by + bh, 3);
      g.arcTo(bx, by + bh, bx, by, 3);
      g.arcTo(bx, by, bx + bw, by, 3);
      g.closePath();
      g.fillStyle = bg2;
      g.fill();
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      g.stroke();
      // keyhole
      g.fillStyle = C.ink;
      g.beginPath();
      g.arc(c, by + bh * 0.42, cell * 0.045, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(c - cell * 0.02, by + bh * 0.45);
      g.lineTo(c + cell * 0.02, by + bh * 0.45);
      g.lineTo(c + cell * 0.014, by + bh * 0.82);
      g.lineTo(c - cell * 0.014, by + bh * 0.82);
      g.closePath();
      g.fill();
      // maker's rivets
      g.fillStyle = "rgba(80,60,20,0.8)";
      for (const rx3 of [bx + bw * 0.14, bx + bw * 0.86]) {
        g.beginPath();
        g.arc(rx3, by + bh * 0.5, cell * 0.018, 0, Math.PI * 2);
        g.fill();
      }
    };

    /** valve: a carved stone turnstile tile — chevrons chiselled into
     *  the floor, painted with the red ochre of one-way law. */
    const drawValve = (g: CanvasRenderingContext2D, px: number, py: number, cell: number, t: string) => {
      const c = px + cell / 2, cyp = py + cell / 2;
      const dirs: Record<string, [number, number]> = {
        ">": [1, 0], "<": [-1, 0], "^": [0, -1], v: [0, 1],
      };
      const [dx, dy] = dirs[t] ?? [1, 0];
      // stone tile inset with chamfered corners
      const m = cell * 0.12;
      g.beginPath();
      g.moveTo(px + m + 2, py + m);
      g.lineTo(px + cell - m - 2, py + m);
      g.lineTo(px + cell - m, py + m + 2);
      g.lineTo(px + cell - m, py + cell - m - 2);
      g.lineTo(px + cell - m - 2, py + cell - m);
      g.lineTo(px + m + 2, py + cell - m);
      g.lineTo(px + m, py + cell - m - 2);
      g.lineTo(px + m, py + m + 2);
      g.closePath();
      g.fillStyle = "#d4c9ab";
      g.fill();
      g.strokeStyle = "rgba(34,28,20,0.65)";
      g.lineWidth = 1.1;
      g.stroke();
      // chisel shadow inside the tile (carved look)
      g.strokeStyle = "rgba(34,28,20,0.18)";
      g.lineWidth = 2.4;
      const chev = (off: number) => {
        g.beginPath();
        g.moveTo(c - dx * cell * 0.26 - dy * 0, cyp - dy * cell * 0.26);
        // chevron wings perpendicular to travel
        g.lineTo(c + dx * cell * 0.04 - (-dy) * cell * 0.16 + dx * off, cyp + dy * cell * 0.04 - dx * cell * 0.16 + dy * off);
        g.lineTo(c + dx * (cell * 0.04 + off) + (-dy) * cell * 0.16, cyp + dy * (cell * 0.04 + off) + dx * cell * 0.16);
        g.stroke();
      };
      // two chevrons pointing the legal direction
      g.save();
      g.translate(c, cyp);
      g.rotate(Math.atan2(dy, dx));
      g.translate(-c, -cyp);
      g.strokeStyle = "rgba(80,60,30,0.35)"; // chisel shadow offset
      g.lineWidth = 2.6;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const off of [-cell * 0.1, cell * 0.12]) {
        g.beginPath();
        g.moveTo(c - cell * 0.1 + off, cyp - cell * 0.17);
        g.lineTo(c + cell * 0.1 + off, cyp);
        g.lineTo(c - cell * 0.1 + off, cyp + cell * 0.17);
        g.stroke();
      }
      // red ochre paint on top, slightly offset up-left of the groove
      g.strokeStyle = "rgba(163,51,39,0.9)";
      g.lineWidth = 1.7;
      for (const off of [-cell * 0.1, cell * 0.12]) {
        g.beginPath();
        g.moveTo(c - cell * 0.1 + off - 0.6, cyp - cell * 0.17 - 0.6);
        g.lineTo(c + cell * 0.1 + off - 0.6, cyp - 0.6);
        g.lineTo(c - cell * 0.1 + off - 0.6, cyp + cell * 0.17 - 0.6);
        g.stroke();
      }
      g.restore();
      void chev;
    };

    // ── dynamic drawing helpers ──────────────────────────────────────
    const drawCrate = (g: CanvasRenderingContext2D, x: number, y: number, cell: number) => {
      const px = sizeRef.current.pad + x * cell;
      const py = sizeRef.current.pad + y * cell;
      const m = cell * 0.14;
      const x0 = px + m, y0 = py + m, cw = cell - m * 2;
      // drop shadow
      g.fillStyle = "rgba(34,28,20,0.16)";
      g.fillRect(x0 + 1.5, y0 + 2, cw, cw);
      // panel
      g.fillStyle = "#c9a56a";
      g.fillRect(x0, y0, cw, cw);
      // wood grain — horizontal slats with figured strokes
      const rand = cellRand(x, y, 41);
      g.strokeStyle = "rgba(122,90,50,0.5)";
      g.lineWidth = 0.7;
      const slats = 3;
      for (let i = 1; i < slats; i++) {
        g.beginPath();
        g.moveTo(x0 + 1, y0 + (cw * i) / slats);
        g.lineTo(x0 + cw - 1, y0 + (cw * i) / slats);
        g.stroke();
      }
      for (let i = 0; i < 2; i++) {
        const gy = y0 + cw * (0.2 + rand() * 0.6);
        g.beginPath();
        g.moveTo(x0 + 2, gy);
        g.bezierCurveTo(x0 + cw * 0.3, gy + 1.4, x0 + cw * 0.6, gy - 1.4, x0 + cw - 2, gy);
        g.stroke();
      }
      // edge frame
      g.strokeStyle = "#8a6434";
      g.lineWidth = cell * 0.075;
      g.strokeRect(x0, y0, cw, cw);
      // X brace
      g.strokeStyle = "#8a6434";
      g.lineWidth = cell * 0.055;
      g.beginPath();
      g.moveTo(x0 + 1, y0 + 1); g.lineTo(x0 + cw - 1, y0 + cw - 1);
      g.moveTo(x0 + cw - 1, y0 + 1); g.lineTo(x0 + 1, y0 + cw - 1);
      g.stroke();
      // outline + corner nails
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      g.strokeRect(x0, y0, cw, cw);
      g.fillStyle = C.ink;
      const b = cell * 0.042;
      for (const [bx2, by2] of [[x0, y0], [x0 + cw, y0], [x0, y0 + cw], [x0 + cw, y0 + cw]]) {
        g.beginPath();
        g.arc(bx2, by2, b, 0, Math.PI * 2);
        g.fill();
      }
    };

    const drawApple = (g: CanvasRenderingContext2D, x: number, y: number, cell: number, bob: number) => {
      const c = sizeRef.current.pad + (x + 0.5) * cell;
      const cyp = sizeRef.current.pad + (y + 0.5) * cell + Math.sin(bob) * cell * 0.03;
      const r = cell * 0.26;
      // ground shadow
      g.beginPath();
      g.ellipse(c, cyp + r * 0.95, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
      g.fillStyle = "rgba(34,28,20,0.14)";
      g.fill();
      // fruit — a real apple: two lobes, dimple at the top
      g.beginPath();
      g.moveTo(c, cyp - r * 0.72);
      g.bezierCurveTo(c + r * 0.95, cyp - r * 1.15, c + r * 1.18, cyp + r * 0.5, c + r * 0.28, cyp + r * 0.98);
      g.bezierCurveTo(c + r * 0.1, cyp + r * 1.1, c - r * 0.1, cyp + r * 1.1, c - r * 0.28, cyp + r * 0.98);
      g.bezierCurveTo(c - r * 1.18, cyp + r * 0.5, c - r * 0.95, cyp - r * 1.15, c, cyp - r * 0.72);
      g.closePath();
      const ag = g.createRadialGradient(c - r * 0.35, cyp - r * 0.4, r * 0.15, c, cyp + r * 0.1, r * 1.25);
      ag.addColorStop(0, C.appleHi);
      ag.addColorStop(0.65, C.apple);
      ag.addColorStop(1, "#7c2318");
      g.fillStyle = ag;
      g.fill();
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      g.stroke();
      // glossy highlight
      g.beginPath();
      g.ellipse(c - r * 0.38, cyp - r * 0.3, r * 0.22, r * 0.32, -0.6, 0, Math.PI * 2);
      g.fillStyle = "rgba(250,245,233,0.55)";
      g.fill();
      // stem + leaf
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(c, cyp - r * 0.78);
      g.quadraticCurveTo(c + r * 0.18, cyp - r * 1.3, c + r * 0.08, cyp - r * 1.5);
      g.stroke();
      g.fillStyle = C.appleLeaf;
      g.beginPath();
      g.ellipse(c + r * 0.42, cyp - r * 1.28, r * 0.34, r * 0.16, -0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(52,72,38,0.8)";
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(c + r * 0.12, cyp - r * 1.2);
      g.lineTo(c + r * 0.72, cyp - r * 1.34);
      g.stroke();
    };

    const drawKey = (g: CanvasRenderingContext2D, x: number, y: number, cell: number, born: number) => {
      const c = sizeRef.current.pad + (x + 0.5) * cell;
      const cyp = sizeRef.current.pad + (y + 0.5) * cell;
      const pop = Math.min(1, (performance.now() - born) / 300);
      const r = cell * 0.24 * (0.6 + 0.4 * easeOutCubic(pop));
      // ground shadow
      g.beginPath();
      g.ellipse(c, cyp + r * 0.9, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
      g.fillStyle = "rgba(34,28,20,0.13)";
      g.fill();
      g.save();
      g.translate(c, cyp);
      g.rotate(-0.6);
      const kg = g.createLinearGradient(-r, -r, r, r);
      kg.addColorStop(0, "#d4b168");
      kg.addColorStop(0.5, C.brassPlate);
      kg.addColorStop(1, C.brassDark);
      g.strokeStyle = kg;
      g.lineCap = "round";
      // shaft
      g.beginPath();
      g.moveTo(-r * 0.1, 0);
      g.lineTo(r * 1.05, 0);
      g.lineWidth = r * 0.28;
      g.stroke();
      // bow — a hollow ring
      g.beginPath();
      g.arc(-r * 0.55, 0, r * 0.52, 0, Math.PI * 2);
      g.lineWidth = r * 0.24;
      g.stroke();
      // teeth
      g.beginPath();
      g.moveTo(r * 0.62, 0); g.lineTo(r * 0.62, r * 0.46);
      g.moveTo(r * 0.95, 0); g.lineTo(r * 0.95, r * 0.38);
      g.lineWidth = r * 0.22;
      g.stroke();
      // glint
      g.beginPath();
      g.arc(-r * 0.55, -r * 0.1, r * 0.5, Math.PI * 1.15, Math.PI * 1.5);
      g.strokeStyle = "rgba(250,242,220,0.8)";
      g.lineWidth = r * 0.1;
      g.stroke();
      g.restore();
    };

    const drawRemain = (g: CanvasRenderingContext2D, x: number, y: number, cell: number, born: number) => {
      const px = sizeRef.current.pad + x * cell;
      const py = sizeRef.current.pad + y * cell;
      const pop = Math.min(1, (performance.now() - born) / 380);
      const t = easeOutCubic(pop);
      // a severed, dried section of the worm — it was once alive
      const c = px + cell / 2;
      const cyp = py + cell / 2;
      const w = cell * (0.52 - 0.08 * (1 - t));
      g.save();
      g.translate(c, cyp);
      g.rotate(((x * 7 + y * 13) % 4) * 0.5 - 0.75);
      // body — desaturated dried-rose
      g.beginPath();
      g.ellipse(0, 0, w, w * 0.56, 0, 0, Math.PI * 2);
      g.fillStyle = `rgba(146,112,96,${0.75 + 0.2 * t})`;
      g.fill();
      g.strokeStyle = "rgba(74,50,38,0.9)";
      g.lineWidth = 1.2;
      g.stroke();
      // dried annular rings
      g.strokeStyle = "rgba(74,50,38,0.55)";
      g.lineWidth = 0.9;
      for (const off of [-w * 0.45, -w * 0.15, w * 0.15, w * 0.45]) {
        g.beginPath();
        g.moveTo(off, -w * 0.42);
        g.quadraticCurveTo(off + w * 0.06, 0, off, w * 0.42);
        g.stroke();
      }
      // the ragged tear where it was cut
      g.beginPath();
      g.moveTo(w * 0.72, -w * 0.3);
      g.lineTo(w * 0.98, -w * 0.08);
      g.lineTo(w * 0.8, w * 0.05);
      g.lineTo(w * 1.02, w * 0.22);
      g.lineTo(w * 0.68, w * 0.32);
      g.strokeStyle = "rgba(74,50,38,0.95)";
      g.lineWidth = 1.1;
      g.stroke();
      g.fillStyle = "rgba(58,40,30,0.85)";
      g.fill();
      g.restore();
    };

    /** THE WORM — one continuous ink creature. */
    const drawWorm = (g: CanvasRenderingContext2D, cells: { x: number; y: number }[], cell: number, t: number, sliding: boolean) => {
      if (cells.length === 0) return;
      const { pad } = sizeRef.current;
      const pts = cells.map((p) => ({ x: pad + (p.x + 0.5) * cell, y: pad + (p.y + 0.5) * cell }));

      // ground shadow — a soft wash beneath the whole body
      g.save();
      g.strokeStyle = "rgba(34,28,20,0.13)";
      g.lineWidth = cell * 0.5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(pts[0].x + 2, pts[0].y + cell * 0.16);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 2, pts[i].y + cell * 0.16);
      if (pts.length === 1) g.lineTo(pts[0].x + 2.1, pts[0].y + cell * 0.16);
      g.stroke();
      g.restore();

      // body — a real earthworm: rose-tan tube, tapered, annulate.
      const maxW = cell * 0.56;
      g.lineCap = "round";
      g.lineJoin = "round";

      const widthAt = (i: number) => {
        // thick behind the head, gentle taper to the tail
        const frac = i / Math.max(1, pts.length - 1);
        const base = maxW * (0.42 + 0.58 * (1 - frac));
        // the clitellum — the smooth swollen saddle ~2 segments back
        const clit = Math.exp(-Math.pow((frac - 0.22) / 0.09, 2));
        return base * (1 + clit * 0.16);
      };

      // pass 1 · dark outline tube (slightly wider) — the ink contour
      for (let i = pts.length - 1; i > 0; i--) {
        g.strokeStyle = C.wormEdge;
        g.lineWidth = widthAt(i) + 2.4;
        g.beginPath();
        g.moveTo(pts[i].x, pts[i].y);
        g.lineTo(pts[i - 1].x, pts[i - 1].y);
        g.stroke();
      }
      // pass 2 · rose-tan body tube
      for (let i = pts.length - 1; i > 0; i--) {
        const grad = g.createLinearGradient(pts[i].x, pts[i].y - widthAt(i), pts[i].x, pts[i].y + widthAt(i));
        grad.addColorStop(0, C.wormBody);
        grad.addColorStop(0.55, C.wormBodyLo);
        grad.addColorStop(1, C.wormBelly);
        g.strokeStyle = grad;
        g.lineWidth = widthAt(i);
        g.beginPath();
        g.moveTo(pts[i].x, pts[i].y);
        g.lineTo(pts[i - 1].x, pts[i - 1].y);
        g.stroke();
      }

      // annular rings — the worm signature (NOT scales, NOT snake):
      // repeated thin sutures perpendicular to travel, denser than cells
      g.strokeStyle = C.wormRing;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const seg = Math.hypot(dx, dy) || 1;
        const nx = -dy / seg, ny = dx / seg;
        const rings = 3;
        for (let r2 = 1; r2 <= rings; r2++) {
          const tt = r2 / (rings + 1);
          const mx = pts[i].x + dx * tt, my = pts[i].y + dy * tt;
          const w0 = widthAt(i + tt) * 0.42;
          g.lineWidth = 0.9;
          g.beginPath();
          g.moveTo(mx - nx * w0, my - ny * w0);
          g.quadraticCurveTo(mx + dx / seg * w0 * 0.3, my + dy / seg * w0 * 0.3, mx + nx * w0, my + ny * w0);
          g.stroke();
        }
      }

      // slime sheen — a pale highlight riding the spine's upper edge
      if (quality === "high") {
        g.strokeStyle = "rgba(250,240,228,0.34)";
        g.lineWidth = maxW * 0.13;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y - maxW * 0.18);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y - maxW * 0.18);
        g.stroke();
      }

      // the head — a blunt worm snout (prostomium), NOT a snake wedge:
      // rounded lobe slightly wider than the neck, small bead eyes set
      // LOW and CLOSE, a tiny sensing mouth. No fangs, no fork, no tongue.
      const head = pts[0];
      const a = animRef.current;
      const hr = widthAt(0) * 0.62;
      const ang = Math.atan2(a.dirY, a.dirX);
      // snout lobe
      g.beginPath();
      g.ellipse(head.x + a.dirX * hr * 0.18, head.y + a.dirY * hr * 0.18, hr * 1.06, hr * 0.94, ang, 0, Math.PI * 2);
      const hg2 = g.createLinearGradient(head.x, head.y - hr, head.x, head.y + hr);
      hg2.addColorStop(0, C.wormBody);
      hg2.addColorStop(0.6, C.wormBodyLo);
      hg2.addColorStop(1, C.wormBelly);
      g.fillStyle = hg2;
      g.fill();
      g.strokeStyle = C.wormEdge;
      g.lineWidth = 2;
      g.stroke();
      // prostomium tip — the little digging lip
      g.beginPath();
      g.ellipse(
        head.x + a.dirX * hr * 0.92, head.y + a.dirY * hr * 0.92,
        hr * 0.34, hr * 0.5, ang, 0, Math.PI * 2,
      );
      g.fillStyle = C.wormBodyLo;
      g.fill();
      g.strokeStyle = C.wormEdge;
      g.lineWidth = 1.2;
      g.stroke();

      // eyes — two small dark bead eyes, LOW and CLOSE together.
      // Earthworms see light, not shapes — the beads read as shy, not reptile.
      const blink = Math.sin(t * 0.0016 + 1.7) > 0.985 ? 0.15 : 1;
      const ex = -a.dirY, ey = a.dirX; // perpendicular
      const eo = hr * 0.34; // close-set: narrow across the head
      const ef = hr * 0.34; // forward on the snout
      for (const side of [-1, 1]) {
        const px2 = head.x + ex * eo * side + a.dirX * ef;
        const py2 = head.y + ey * eo * side + a.dirY * ef;
        g.beginPath();
        g.ellipse(px2, py2, hr * 0.115, hr * 0.115 * blink, 0, 0, Math.PI * 2);
        g.fillStyle = C.wormEye;
        g.fill();
        // one tiny light speck per eye — alive, not glassy
        if (blink === 1) {
          g.beginPath();
          g.arc(px2 - hr * 0.03 + a.dirX * hr * 0.02, py2 - hr * 0.03 + a.dirY * hr * 0.02, hr * 0.032, 0, Math.PI * 2);
          g.fillStyle = "rgba(250,245,233,0.85)";
          g.fill();
        }
      }

      // mouth — a small o of effort, puckered at the snout tip
      g.beginPath();
      g.ellipse(
        head.x + a.dirX * hr * 1.02, head.y + a.dirY * hr * 1.02,
        hr * 0.09, hr * 0.13, ang, 0, Math.PI * 2,
      );
      g.strokeStyle = C.wormEdge;
      g.lineWidth = 1;
      g.stroke();

      // saddle band — the clitellum drawn as a smooth lighter cuff
      if (pts.length > 3) {
        const c1 = pts[1];
        const clitW = widthAt(1) * 0.94;
        g.beginPath();
        g.ellipse(c1.x, c1.y, clitW * 0.62, clitW * 0.62, 0, 0, Math.PI * 2);
        g.strokeStyle = "rgba(238,195,173,0.5)";
        g.lineWidth = clitW * 0.3;
        g.stroke();
      }

      // sliding: cold speed streaks behind the head
      if (sliding) {
        g.strokeStyle = "rgba(159,182,189,0.55)";
        g.lineWidth = 1.4;
        for (let i = 1; i < Math.min(3, pts.length); i++) {
          g.beginPath();
          g.moveTo(pts[i].x - a.dirX * cell * 0.3, pts[i].y - a.dirY * cell * 0.3);
          g.lineTo(pts[i].x + a.dirX * cell * 0.18, pts[i].y + a.dirY * cell * 0.18);
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

      // keys
      a.keys.forEach((k, i) => {
        const to = s.keys[i];
        if (to) drawKey(ctx, to.x, to.y, cell, k.born || now);
      });
      // apples bob
      s.apples.forEach((p, i) => drawApple(ctx, p.x, p.y, cell, now * 0.003 + i * 1.3));
      // crates
      a.crates.forEach((c, i) => {
        const to = s.crates[i] ?? c;
        drawCrate(ctx, lerp(c.x, to.x, e), lerp(c.y, to.y, e), cell);
      });
      // remains
      a.remains.forEach((r, i) => {
        const to = s.remains[i] ?? r;
        drawRemain(ctx, to.x, to.y, cell, r.born || now);
      });

      drawWorm(ctx, wormCells, cell, now, sliding);

      // status vignette: death = grey wash, win = warm light
      if (s.status === "dead") {
        ctx.fillStyle = "rgba(58,50,38,0.22)";
        ctx.fillRect(0, 0, w, h);
      } else if (s.status === "won") {
        const gl = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
        gl.addColorStop(0, "rgba(217,198,138,0.30)");
        gl.addColorStop(1, "rgba(217,198,138,0)");
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
        } else if (p.kind === "wash") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "sparkle") {
          ctx.beginPath();
          for (let k2 = 0; k2 < 4; k2++) {
            const ang = (k2 / 4) * Math.PI * 2;
            const rr = k2 % 2 === 0 ? p.size * 1.6 : p.size * 0.5;
            k2 === 0 ? ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, maxCellPx, transitionMs, sound]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%" }}>
      <canvas ref={canvasRef} className="block w-full h-auto" style={{ imageRendering: "auto" }} />
    </div>
  );
}
