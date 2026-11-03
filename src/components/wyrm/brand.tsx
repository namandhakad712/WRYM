"use client";

// ── WYRM.LAB · brand assets ─────────────────────────────────────────
// The identity is the game's: one pink worm — coral saddle, single
// googly eye, tail badge — in a panel of soil; and a loop diagram whose
// coral pulse circles the agentic circuit like a heartbeat underground.

import { motion } from "framer-motion";

/** The WYRM mark: the real worm — pink tube, coral saddle, ONE googly
 *  eye, white tail badge — reaching for an apple in a soil panel. */
export function WormLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden>
      {/* soil panel */}
      <rect x="0.5" y="0.5" width="35" height="35" rx="8" fill="#3a2e24" stroke="#6b5545" strokeWidth="1.4" />
      {/* the worm — pink body */}
      <motion.path
        d="M 6.5 27.5
           C 7.5 21, 10 18.5, 14 17.5
           C 18.5 16.4, 23 15.2, 25.5 12.2"
        fill="none"
        stroke="#fca5b8"
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {/* coral saddle — the clitellum band on the rear segments */}
      <motion.path
        d="M 8.6 24.2
           C 9.3 20.4, 11 18.6, 14 17.7"
        fill="none"
        stroke="#ea6a65"
        strokeWidth="7.4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
      />
      {/* soft top light on the body */}
      <path
        d="M 7 25.6 C 8 20.4, 10.4 18.1, 14.2 17.1"
        fill="none"
        stroke="#ffd9e0"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* the ONE googly eye on the head */}
      <circle cx="25.5" cy="12.2" r="4.6" fill="#ffffff" stroke="#2b1c1d" strokeWidth="1.1" />
      <motion.circle
        cx="26.4"
        cy="11.4"
        r="2.3"
        fill="#0a0a0a"
        animate={{ cx: [26.4, 25.2, 26.4] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="25.8" cy="10.8" r="0.75" fill="#ffffff" />
      {/* tail badge — the length counter */}
      <circle cx="6.9" cy="27.1" r="2.7" fill="#ffffff" stroke="#222222" strokeWidth="0.9" />
      {/* the red apple it reaches for */}
      <circle cx="30.6" cy="22.4" r="2.4" fill="#e82f3a" stroke="#9c1c24" strokeWidth="0.8" />
      <path d="M 30.6 19.9 c 0.3 -0.8, 0.9 -1.1, 1.4 -1.2" stroke="#6b4226" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      <ellipse cx="31.9" cy="19.6" rx="1.1" ry="0.55" fill="#5fb833" transform="rotate(28 31.9 19.6)" />
      <ellipse cx="29.8" cy="21.5" rx="0.7" ry="0.4" fill="#ff878f" transform="rotate(-25 29.8 21.5)" />
    </svg>
  );
}

/** Agentic-loop diagram: soil circuit, coral pulse circling like a heartbeat. */
const STATIONS = [
  { key: "generate", label: "GENERATE", sub: "New Level Thinker", x: 50, y: 10 },
  { key: "validate", label: "VALIDATE", sub: "Logic Validator · BFS", x: 90, y: 40 },
  { key: "solve", label: "SOLVE", sub: "Thinker plays", x: 74, y: 84 },
  { key: "check", label: "CHECK", sub: "Checker replays", x: 26, y: 84 },
  { key: "review", label: "REVIEW", sub: "Reviewer critiques", x: 10, y: 40 },
];

// smooth closed circuit through the stations
const LOOP_PATH =
  "M 50 10 C 68 10, 84 24, 90 40 C 96 56, 88 76, 74 84 C 60 92, 40 92, 26 84 C 12 76, 4 56, 10 40 C 16 24, 32 10, 50 10 Z";

export function PipelineDiagram({
  activeStage,
  running,
  className,
}: {
  activeStage?: string;
  running?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="-4 -6 108 116" className={className} role="img" aria-label="agentic loop diagram">
      <defs>
        <marker id="arrowHead" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" fill="#ea6a65" opacity="0.8" />
        </marker>
        <radialGradient id="pulseWash">
          <stop offset="0%" stopColor="#ea6a65" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ea6a65" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the circuit — carved into the soil */}
      <path d={LOOP_PATH} fill="none" stroke="#6b5545" strokeWidth="2.6" opacity="0.35" strokeLinecap="round" />
      <path
        d={LOOP_PATH}
        fill="none"
        stroke="#6b5545"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* dashed current — the loop is alive */}
      <path
        d={LOOP_PATH}
        fill="none"
        stroke="#ea6a65"
        strokeWidth="1"
        opacity="0.55"
        strokeLinecap="round"
        strokeDasharray="2.5 5"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-30" dur="2.2s" repeatCount="indefinite" />
      </path>

      {/* the traveling pulse — the worm's heartbeat circling the circuit */}
      <g>
        <circle r="2" fill="#ea6a65">
          <animateMotion dur="5.5s" repeatCount="indefinite" path={LOOP_PATH} rotate="auto" />
        </circle>
        <circle r="4.6" fill="url(#pulseWash)" opacity="0.5">
          <animateMotion dur="5.5s" repeatCount="indefinite" path={LOOP_PATH} />
        </circle>
      </g>

      {/* center medallion */}
      <g>
        <circle cx="50" cy="52" r="15" fill="#443627" stroke="#6b5545" />
        <circle cx="50" cy="52" r="12.6" fill="none" stroke="#6b5545" strokeWidth="0.4" opacity="0.7" />
        <text
          x="50"
          y="49"
          textAnchor="middle"
          fill="#fce8d5"
          fontSize="6.5"
          fontWeight="700"
          fontFamily="var(--font-display)"
        >
          LOOP
        </text>
        <text x="50" y="56" textAnchor="middle" fill="rgba(252,232,213,0.55)" fontSize="3.4" fontFamily="var(--font-mono-code)">
          memory
        </text>
        <text x="50" y="60.5" textAnchor="middle" fill="rgba(252,232,213,0.55)" fontSize="3.4" fontFamily="var(--font-mono-code)">
          flows
        </text>
      </g>

      {STATIONS.map((s) => {
        const active = running && s.key === activeStage;
        return (
          <g key={s.key}>
            {/* station node — a carved socket, coral when live */}
            <circle
              cx={s.x}
              cy={s.y}
              r={active ? 6.4 : 5.4}
              fill={active ? "#ea6a65" : "#443627"}
              stroke={active ? "#c95167" : "#6b5545"}
              strokeWidth={active ? 1.4 : 1}
            >
              {active && <animate attributeName="r" values="5.4;6.6;5.4" dur="1.2s" repeatCount="indefinite" />}
            </circle>
            <circle cx={s.x} cy={s.y} r="2" fill={active ? "#ffffff" : "none"} stroke={active ? "none" : "#6b5545"} strokeWidth="0.8" opacity={active ? 1 : 0.7} />
            <text
              x={s.x}
              y={s.y === 84 ? s.y + 11.5 : s.y - 8.5}
              textAnchor="middle"
              fill={active ? "#ea6a65" : "#fce8d5"}
              fontSize="4.2"
              fontWeight="700"
              fontFamily="var(--font-display)"
            >
              {s.label}
            </text>
            <text
              x={s.x}
              y={s.y === 84 ? s.y + 15.5 : s.y - 4.8}
              textAnchor="middle"
              fill="rgba(252,232,213,0.5)"
              fontSize="3.1"
              fontFamily="var(--font-mono-code)"
            >
              {s.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
