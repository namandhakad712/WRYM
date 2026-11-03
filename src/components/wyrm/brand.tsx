"use client";

// ── WYRM.LAB · brand assets ─────────────────────────────────────────
// The identity of a scientific instrument: a bookplate roundel with a
// hand-inked worm, and an engraved loop diagram whose pulse travels
// the circuit like a drop of ink in water.

import { motion } from "framer-motion";

/** The WYRM mark: an ink worm curling inside a fine double-ring
 *  bookplate, reaching for a wax-red seed. Pure ink on paper. */
export function WormLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden>
      {/* bookplate ground */}
      <rect x="0.5" y="0.5" width="35" height="35" rx="4.5" fill="#faf6ea" stroke="#2c2318" />
      <rect x="2.5" y="2.5" width="31" height="31" rx="3" fill="none" stroke="#2c2318" strokeWidth="0.5" opacity="0.55" />
      {/* one continuous tapered ink body — wide head, thin tail */}
      <motion.path
        d="M 6.5 27.5
           C 7.5 21, 10 18.5, 14 17.5
           C 18.5 16.4, 23 15.2, 25.5 12.2"
        fill="none"
        stroke="#221c14"
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {/* segment sutures along the body */}
      <path
        d="M 10 23.5 l 3.4 -1.2 M 13.8 20.6 l 3.4 -1.3 M 17.6 18 l 3.4 -1.4 M 21.4 15.6 l 3 -1.6"
        stroke="#faf6ea"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* head */}
      <circle cx="25.5" cy="12.2" r="5.1" fill="#221c14" />
      <circle cx="27.3" cy="10.6" r="1" fill="#faf6ea" />
      <circle cx="24.4" cy="9.9" r="1" fill="#faf6ea" />
      <circle cx="27.55" cy="10.35" r="0.32" fill="#221c14" />
      <circle cx="24.65" cy="9.65" r="0.32" fill="#221c14" />
      {/* antennae */}
      <path
        d="M 27.2 8.2 C 27.8 7.2, 28.6 6.8, 29.4 6.6 M 25.4 7.8 C 25.6 6.6, 26.2 5.8, 27 5.2"
        stroke="#221c14"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* the wax-red seed it reaches for */}
      <circle cx="30.5" cy="23" r="2.3" fill="#a33327" />
      <circle cx="29.9" cy="22.3" r="0.6" fill="#c9584a" />
    </svg>
  );
}

/** Engraved agentic-loop diagram: ink circuit, traveling red pulse. */
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
          <path d="M0,0 L4,2 L0,4 z" fill="#a33327" opacity="0.8" />
        </marker>
        <radialGradient id="pulseWash">
          <stop offset="0%" stopColor="#a33327" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a33327" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the engraved loop — double-ruled like a plate frame */}
      <path d={LOOP_PATH} fill="none" stroke="#2c2318" strokeWidth="2.6" opacity="0.14" strokeLinecap="round" />
      <path
        d={LOOP_PATH}
        fill="none"
        stroke="#2c2318"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* dashed current — the loop is alive */}
      <path
        d={LOOP_PATH}
        fill="none"
        stroke="#a33327"
        strokeWidth="1"
        opacity="0.5"
        strokeLinecap="round"
        strokeDasharray="2.5 5"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-30" dur="2.2s" repeatCount="indefinite" />
      </path>

      {/* the traveling pulse — a drop of red ink circling the circuit */}
      <g>
        <circle r="2" fill="#a33327">
          <animateMotion dur="5.5s" repeatCount="indefinite" path={LOOP_PATH} rotate="auto" />
        </circle>
        <circle r="4.6" fill="url(#pulseWash)" opacity="0.5">
          <animateMotion dur="5.5s" repeatCount="indefinite" path={LOOP_PATH} />
        </circle>
      </g>

      {/* center medallion */}
      <g>
        <circle cx="50" cy="52" r="15" fill="#faf6ea" stroke="#2c2318" />
        <circle cx="50" cy="52" r="12.6" fill="none" stroke="#2c2318" strokeWidth="0.4" opacity="0.5" />
        <text
          x="50"
          y="49"
          textAnchor="middle"
          fill="#221c14"
          fontSize="6.5"
          fontWeight="700"
          fontFamily="var(--font-display)"
        >
          LOOP
        </text>
        <text x="50" y="56" textAnchor="middle" fill="#7a6f5a" fontSize="3.4" fontFamily="var(--font-mono-code)">
          memory
        </text>
        <text x="50" y="60.5" textAnchor="middle" fill="#7a6f5a" fontSize="3.4" fontFamily="var(--font-mono-code)">
          flows
        </text>
      </g>

      {STATIONS.map((s) => {
        const active = running && s.key === activeStage;
        return (
          <g key={s.key}>
            {/* station node — a printed circle */}
            <circle
              cx={s.x}
              cy={s.y}
              r={active ? 6.4 : 5.4}
              fill={active ? "#a33327" : "#faf6ea"}
              stroke={active ? "#7c221a" : "#2c2318"}
              strokeWidth={active ? 1.4 : 1}
            >
              {active && <animate attributeName="r" values="5.4;6.6;5.4" dur="1.2s" repeatCount="indefinite" />}
            </circle>
            <circle cx={s.x} cy={s.y} r="2" fill={active ? "#faf6ea" : "none"} stroke={active ? "none" : "#2c2318"} strokeWidth="0.8" opacity={active ? 1 : 0.5} />
            <text
              x={s.x}
              y={s.y === 84 ? s.y + 11.5 : s.y - 8.5}
              textAnchor="middle"
              fill={active ? "#a33327" : "#221c14"}
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
              fill="#7a6f5a"
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
