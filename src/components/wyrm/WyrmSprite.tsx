"use client";

// ── WYRM.LAB · WyrmSprite — a real game sprite as an icon ───────────
// Renders one element exactly like the game draws it (soil strata,
// carved tunnels, the actual worm) into a small canvas. Used by the
// Feature Builder palette and the forge editor grid — no flat colour
// swatches, no abstract glyphs: the tile you pick is the tile you get.

import { useEffect, useRef } from "react";
import { paintSprite, SOIL_THEMES, THEME_KEYS, type SoilTheme } from "@/lib/wyrm/sprites";

function hashTheme(seedStr: string): SoilTheme {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) & 0x7fffffff;
  return SOIL_THEMES[THEME_KEYS[h % THEME_KEYS.length]];
}

export function WyrmSprite({
  ch,
  size = 40,
  seed = 0,
  theme,
  pressed,
  open,
  animate = false,
  className,
}: {
  ch: string;
  size?: number;
  seed?: number;
  theme?: SoilTheme;
  pressed?: boolean;
  open?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const th = theme ?? hashTheme(`${ch}:${seed}`);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!animate) {
      paintSprite(canvas, ch, size, { theme: th, seed, pressed, open });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      paintSprite(canvas, ch, size, { theme: th, seed, pressed, open, t: performance.now() - t0 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ch, size, seed, th, pressed, open, animate]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size, display: "block", borderRadius: "22%", imageRendering: "auto" }}
      aria-hidden
    />
  );
}
