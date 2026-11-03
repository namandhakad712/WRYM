"use client";

// ── WYRM.LAB · AsciiBoard — exactly what the AI sees ────────────────
// The board the model parses, token-colored for the human eye.
// This is the literal text fed to the LLM — not a stylization of it.

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TOKEN_CLASS: Record<string, string> = {
  "#": "tk-wall",
  ".": "tk-floor",
  "+": "tk-dirt",
  "@": "tk-head",
  o: "tk-body",
  ":": "tk-remain",
  "*": "tk-apple",
  $: "tk-crate",
  "%": "tk-plate",
  D: "tk-door",
  X: "tk-exit",
  "~": "tk-spike",
  "_": "tk-ice",
  "=": "tk-bridge",
  ">": "tk-valve",
  "<": "tk-valve",
  "^": "tk-valve",
  v: "tk-valve",
  k: "tk-key",
  L: "tk-lock",
};

export function AsciiBoard({
  ascii,
  className,
  highlight = true,
  title,
}: {
  ascii: string;
  className?: string;
  highlight?: boolean;
  title?: string;
}) {
  const lines = ascii.split("\n");
  return (
    <div className={cn("relative", className)}>
      {title && (
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
          {title}
        </div>
      )}
      <div className="overflow-x-auto wyrm-scroll rounded-lg border border-border/70 bg-[#241d13] px-4 py-3">
        <motion.div
          key={ascii}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="ascii-grid"
          aria-label="ASCII board as the AI sees it"
        >
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {highlight
                ? line.split("").map((ch, j) => (
                    <span key={j} className={TOKEN_CLASS[ch] ?? "tk-floor"}>
                      {ch}
                    </span>
                  ))
                : line}
              {line.length === 0 ? "\u00A0" : null}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
