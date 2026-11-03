"use client";

// ── WYRM.LAB · GameBoard — the human-eye render of the game ─────────
// Animated SVG board: slithering worm, glowing apples, crates, plates,
// doors, spikes and the exit portal. Same deterministic state the AI
// parses as text — rendered for human eyes instead.

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { GameState, Pos } from "@/lib/wyrm/types";

interface GameBoardProps {
  state: GameState;
  compact?: boolean;
  maxCell?: number;
  className?: string;
}

const WORM_HEAD = "#86efac";
const WORM_BRIGHT = "#4ade80";
const WORM_MID = "#22c55e";
const WORM_DARK = "#15803d";
const WORM_TAIL = "#166534";

export function GameBoard({ state, compact = false, maxCell = 46, className }: GameBoardProps) {
  const cell = Math.max(18, Math.min(maxCell, Math.floor(560 / state.width)));
  const W = state.width * cell;
  const H = state.height * cell;
  const pad = compact ? 2 : 8;

  const weighted = useMemo(() => {
    const s = new Set<string>();
    state.crates.forEach((p) => s.add(`${p.x},${p.y}`));
    state.remains.forEach((p) => s.add(`${p.x},${p.y}`));
    state.worm.forEach((p) => s.add(`${p.x},${p.y}`));
    return s;
  }, [state.crates, state.remains, state.worm]);

  const dir = useMemo<"up" | "down" | "left" | "right">(() => {
    if (state.worm.length > 1) {
      const [h, n] = state.worm;
      if (h.x !== n.x) return h.x > n.x ? "right" : "left";
      if (h.y !== n.y) return h.y > n.y ? "down" : "up";
    }
    return "right";
  }, [state.worm]);

  const doorsOpenState = useMemo(() => {
    // every plate weighted?
    let plates = 0;
    let sat = 0;
    for (let y = 0; y < state.height; y++)
      for (let x = 0; x < state.width; x++)
        if (state.terrain[y][x] === "%") {
          plates++;
          if (weighted.has(`${x},${y}`)) sat++;
        }
    return plates === 0 || sat === plates;
  }, [state.terrain, state.height, state.width, weighted]);

  const wormColor = (i: number, len: number) => {
    if (len <= 1) return WORM_HEAD;
    const t = i / (len - 1);
    if (t === 0) return WORM_HEAD;
    if (t < 0.25) return WORM_BRIGHT;
    if (t < 0.55) return WORM_MID;
    if (t < 0.8) return WORM_DARK;
    return WORM_TAIL;
  };

  return (
    <div className={className}>
      <svg
        viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
        width="100%"
        role="img"
        aria-label={`WYRM board ${state.width} by ${state.height}`}
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id="appleG" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="45%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <linearGradient id="crateG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <linearGradient id="headG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={compact ? 1.4 : 2.6} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* board backdrop */}
        <rect
          x={-pad}
          y={-pad}
          width={W + pad * 2}
          height={H + pad * 2}
          rx={10}
          fill="#0b0f0b"
          stroke="#1e241e"
        />

        {/* terrain */}
        {state.terrain.map((row, y) =>
          row.map((t, x) => {
            const cx = x * cell;
            const cy = y * cell;
            const key = `${x}-${y}`;
            if (t === "#") {
              return (
                <g key={key}>
                  <rect x={cx + 1} y={cy + 1} width={cell - 2} height={cell - 2} rx={4} fill="#202620" stroke="#2c332c" />
                  <rect x={cx + 3} y={cy + 3} width={cell - 6} height={Math.max(2, cell * 0.14)} rx={2} fill="#2f382f" />
                </g>
              );
            }
            if (t === "%") {
              const on = weighted.has(`${x},${y}`);
              return (
                <g key={key}>
                  <circle
                    cx={cx + cell / 2}
                    cy={cy + cell / 2}
                    r={cell * 0.3}
                    fill="none"
                    stroke={on ? "#a3e635" : "#3f4a3f"}
                    strokeWidth={2}
                    filter={on && !compact ? "url(#softGlow)" : undefined}
                  />
                  <circle cx={cx + cell / 2} cy={cy + cell / 2} r={cell * 0.12} fill={on ? "#a3e635" : "#333d33"} />
                </g>
              );
            }
            if (t === "D") {
              if (doorsOpenState) {
                return (
                  <g key={key} opacity={0.9}>
                    <rect x={cx + 2} y={cy + 2} width={cell - 4} height={cell - 4} rx={3} fill="#101710" />
                    <rect
                      x={cx + 3}
                      y={cy + 3}
                      width={cell - 6}
                      height={cell - 6}
                      rx={3}
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </g>
                );
              }
              return (
                <g key={key}>
                  <rect x={cx + 1.5} y={cy + 1.5} width={cell - 3} height={cell - 3} rx={3} fill="#46201c" stroke="#7c2d26" />
                  <line x1={cx + 4} y1={cy + 4} x2={cx + cell - 4} y2={cy + cell - 4} stroke="#7c2d26" strokeWidth={2} />
                  <line x1={cx + cell - 4} y1={cy + 4} x2={cx + 4} y2={cy + cell - 4} stroke="#7c2d26" strokeWidth={2} />
                </g>
              );
            }
            if (t === "X") {
              return (
                <g key={key}>
                  <circle cx={cx + cell / 2} cy={cy + cell / 2} r={cell * 0.38} fill="#052e16" opacity={0.9} />
                  <circle
                    cx={cx + cell / 2}
                    cy={cy + cell / 2}
                    r={cell * 0.34}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={2}
                    filter={!compact ? "url(#softGlow)" : undefined}
                  />
                  {!compact && (
                    <motion.circle
                      cx={cx + cell / 2}
                      cy={cy + cell / 2}
                      r={cell * 0.34}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth={1.5}
                      animate={{ r: [cell * 0.34, cell * 0.46], opacity: [0.7, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                </g>
              );
            }
            if (t === "~") {
              const pts = [0.22, 0.5, 0.78];
              return (
                <g key={key}>
                  <rect x={cx + 1} y={cy + 1} width={cell - 2} height={cell - 2} rx={3} fill="#180d0c" />
                  {pts.map((p, i) => (
                    <polygon
                      key={i}
                      points={`${cx + cell * (p - 0.13)},${cy + cell * 0.78} ${cx + cell * p},${cy + cell * 0.26} ${cx + cell * (p + 0.13)},${cy + cell * 0.78}`}
                      fill="#e0503f"
                      stroke="#7f221a"
                      strokeWidth={0.8}
                    />
                  ))}
                </g>
              );
            }
            return null;
          }),
        )}

        {/* subtle floor grid */}
        <g stroke="#ffffff" strokeOpacity={0.035} strokeWidth={1}>
          {Array.from({ length: state.width + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * cell} y1={0} x2={i * cell} y2={H} />
          ))}
          {Array.from({ length: state.height + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * cell} x2={W} y2={i * cell} />
          ))}
        </g>

        {/* apples */}
        {state.apples.map((p, i) => (
          <motion.g
            key={`apple-${i}-${p.x}-${p.y}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            style={{ originX: `${(p.x * cell + cell / 2) / W}`, originY: `${(p.y * cell + cell / 2) / H}` }}
          >
            <circle
              cx={p.x * cell + cell / 2}
              cy={p.y * cell + cell / 2}
              r={cell * 0.3}
              fill="url(#appleG)"
              filter={!compact ? "url(#softGlow)" : undefined}
            />
            <ellipse
              cx={p.x * cell + cell / 2 + cell * 0.02}
              cy={p.y * cell + cell * 0.26}
              rx={cell * 0.09}
              ry={cell * 0.045}
              fill="#84cc16"
              transform={`rotate(-30 ${p.x * cell + cell / 2} ${p.y * cell + cell * 0.26})`}
            />
            <circle cx={p.x * cell + cell * 0.42} cy={p.y * cell + cell * 0.42} r={cell * 0.05} fill="#fef9c3" opacity={0.9} />
          </motion.g>
        ))}

        {/* crates */}
        {state.crates.map((p, i) => (
          <motion.g
            key={`crate-${i}`}
            animate={{ x: p.x * cell, y: p.y * cell }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <rect x={1.5} y={1.5} width={cell - 3} height={cell - 3} rx={4} fill="url(#crateG)" stroke="#92400e" strokeWidth={1.5} />
            <line x1={4} y1={4} x2={cell - 4} y2={cell - 4} stroke="#78350f" strokeWidth={2} />
            <line x1={cell - 4} y1={4} x2={4} y2={cell - 4} stroke="#78350f" strokeWidth={2} />
          </motion.g>
        ))}

        {/* remains (dropped worm halves) */}
        {state.remains.map((p, i) => (
          <motion.g
            key={`remain-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: p.x * cell, y: p.y * cell }}
            transition={{ duration: 0.25 }}
          >
            <rect
              x={cell * 0.14}
              y={cell * 0.18}
              width={cell * 0.72}
              height={cell * 0.64}
              rx={cell * 0.18}
              fill="#49584a"
              stroke="#5f7161"
              strokeWidth={1.2}
              opacity={0.92}
            />
            <circle cx={cell * 0.5} cy={cell * 0.5} r={cell * 0.07} fill="#333f36" />
          </motion.g>
        ))}

        {/* the worm */}
        {state.worm.map((p: Pos, i: number) => {
          const isHead = i === 0;
          const len = state.worm.length;
          const color = wormColor(i, len);
          const inset = isHead ? cell * 0.06 : cell * 0.13 + (i / Math.max(1, len)) * cell * 0.05;
          const size = cell - inset * 2;
          return (
            <motion.g
              key={`seg-${i}`}
              animate={{ x: p.x * cell, y: p.y * cell }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              initial={false}
            >
              <rect
                x={inset}
                y={inset}
                width={size}
                height={size}
                rx={isHead ? cell * 0.32 : cell * 0.26}
                fill={isHead ? "url(#headG)" : color}
                stroke={isHead ? "#bbf7d0" : "#14532d"}
                strokeWidth={isHead ? 1.5 : 1}
                filter={isHead && !compact ? "url(#softGlow)" : undefined}
              />
              {isHead && (
                <g>
                  {(() => {
                    const e = cell * 0.16;
                    const eye = cell * 0.075;
                    const pos: Record<string, [number, number][]> = {
                      right: [
                        [cell - e, cell * 0.32],
                        [cell - e, cell * 0.68],
                      ],
                      left: [
                        [e, cell * 0.32],
                        [e, cell * 0.68],
                      ],
                      up: [
                        [cell * 0.32, e],
                        [cell * 0.68, e],
                      ],
                      down: [
                        [cell * 0.32, cell - e],
                        [cell * 0.68, cell - e],
                      ],
                    };
                    return pos[dir].map(([ex, ey], k) => (
                      <g key={k}>
                        <circle cx={ex} cy={ey} r={eye + 1.2} fill="#bbf7d0" />
                        <circle cx={ex} cy={ey} r={eye} fill="#052e16" />
                        <circle cx={ex - eye * 0.3} cy={ey - eye * 0.3} r={eye * 0.32} fill="#e7f9ec" />
                      </g>
                    ));
                  })()}
                </g>
              )}
            </motion.g>
          );
        })}

        {/* win / death overlay */}
        {state.status === "won" && !compact && (
          <motion.rect
            x={-pad}
            y={-pad}
            width={W + pad * 2}
            height={H + pad * 2}
            rx={10}
            fill="#4ade80"
            animate={{ opacity: [0, 0.16, 0] }}
            transition={{ duration: 1.2, repeat: 2 }}
          />
        )}
        {state.status === "dead" && !compact && (
          <motion.rect
            x={-pad}
            y={-pad}
            width={W + pad * 2}
            height={H + pad * 2}
            rx={10}
            fill="#ef4444"
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{ duration: 0.8, repeat: 2 }}
          />
        )}
      </svg>
    </div>
  );
}
