"use client";

// ── WYRM.LAB · procedural sound engine ─────────────────────────────
// Zero audio assets. Every effect is synthesized at runtime with the
// Web Audio API: oscillators, filtered noise, envelopes. The result is
// a tiny, crisp, retro-arcade voice that fits the cave-lab aesthetic.
//
// Usage:
//   import { sfx } from "@/lib/wyrm/sound";
//   sfx.eat();            // one-shot game event
//   sfx.ui("click");      // UI chrome
//   sfx.setEnabled(false) // mute
//
// The AudioContext is created lazily on first user gesture (browser
// autoplay policy) and every voice routes through one master gain.

export type SfxName =
  | "eat"
  | "dig"
  | "push"
  | "split"
  | "door"
  | "win"
  | "death"
  | "bump"
  | "move"
  | "click"
  | "hover"
  | "steer"
  | "tick";

const STORAGE_KEY = "wyrm-sound";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.55;
  private lastPlay = new Map<string, number>();
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const v = JSON.parse(saved) as { enabled?: boolean; volume?: number };
          if (typeof v.enabled === "boolean") this.enabled = v.enabled;
          if (typeof v.volume === "number") this.volume = Math.min(1, Math.max(0, v.volume));
        }
      } catch {
        /* storage unavailable — defaults are fine */
      }
    }
  }

  /** Create the context on first gesture. Safe to call many times. */
  private ensure(): boolean {
    if (typeof window === "undefined") return false;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx.state !== "closed";
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      /* ignore */
    }
  }

  // ── public controls ──────────────────────────────────────────────
  get isEnabled() {
    return this.enabled;
  }
  getLevel() {
    return this.volume;
  }
  setEnabled(on: boolean) {
    this.enabled = on;
    this.persist();
    if (on) this.ensure();
  }
  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.volume;
    this.persist();
  }
  /** Unlock audio from a click handler (autoplay policy). */
  unlock() {
    this.ensure();
  }

  // ── building blocks ──────────────────────────────────────────────
  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 1.2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /** Throttle identical sounds to avoid machine-gun repeats. */
  private gate(name: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? -1e9;
    if (now - last < ms) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      gain?: number;
      to?: number; // glide target
      delay?: number;
      attack?: number;
      filter?: number;
    } = {},
  ) {
    if (!this.ctx || !this.master) return;
    const { type = "sine", gain = 0.2, to, delay = 0, attack = 0.004, filter } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out: AudioNode = env;
    if (filter) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      env.connect(lp);
      out = lp;
    }
    osc.connect(env);
    out.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private rumble(
    dur: number,
    opts: { gain?: number; from?: number; to?: number; q?: number; delay?: number; type?: BiquadFilterType } = {},
  ) {
    if (!this.ctx || !this.master) return;
    const { gain = 0.18, from = 900, to = 120, q = 1, delay = 0, type = "lowpass" } = opts;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(env);
    env.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ── the voice bank ──────────────────────────────────────────────
  play(name: SfxName) {
    if (!this.enabled) return;
    if (!this.ensure()) return;
    switch (name) {
      case "eat":
        this.tone(392, 0.09, { type: "triangle", gain: 0.22 });
        this.tone(587, 0.12, { type: "triangle", gain: 0.2, delay: 0.055 });
        this.tone(784, 0.14, { type: "triangle", gain: 0.16, delay: 0.11 });
        break;
      case "dig":
        if (!this.gate("dig", 90)) return;
        this.rumble(0.22, { gain: 0.16, from: 1400, to: 90, q: 0.8 });
        this.tone(70, 0.08, { type: "square", gain: 0.05 });
        break;
      case "push":
        if (!this.gate("push", 110)) return;
        this.tone(82, 0.16, { type: "square", gain: 0.13, to: 54, filter: 300 });
        this.rumble(0.18, { gain: 0.1, from: 400, to: 60 });
        break;
      case "split":
        this.rumble(0.34, { gain: 0.14, from: 2400, to: 140, q: 3 });
        this.tone(660, 0.2, { type: "sawtooth", gain: 0.08, to: 220, filter: 1800 });
        break;
      case "door":
        this.tone(523, 0.5, { type: "sine", gain: 0.15 });
        this.tone(784, 0.55, { type: "sine", gain: 0.13, delay: 0.09 });
        this.tone(1047, 0.6, { type: "sine", gain: 0.1, delay: 0.18 });
        break;
      case "win":
        // little fanfare arpeggio
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, i === 3 ? 0.5 : 0.16, { type: "triangle", gain: 0.2, delay: i * 0.11 }),
        );
        this.tone(1568, 0.65, { type: "sine", gain: 0.1, delay: 0.44 });
        break;
      case "death":
        this.tone(330, 0.5, { type: "sawtooth", gain: 0.16, to: 58, filter: 900 });
        this.rumble(0.4, { gain: 0.12, from: 700, to: 50, delay: 0.06 });
        break;
      case "bump":
        if (!this.gate("bump", 130)) return;
        this.tone(110, 0.09, { type: "square", gain: 0.1, to: 78, filter: 320 });
        break;
      case "move":
        if (!this.gate("move", 70)) return;
        this.tone(1230, 0.03, { type: "sine", gain: 0.035 });
        break;
      case "click":
        this.tone(640, 0.045, { type: "square", gain: 0.05, filter: 2200 });
        break;
      case "hover":
        if (!this.gate("hover", 40)) return;
        this.tone(1150, 0.025, { type: "sine", gain: 0.02 });
        break;
      case "steer":
        this.tone(880, 0.07, { type: "sine", gain: 0.08 });
        this.tone(1320, 0.09, { type: "sine", gain: 0.07, delay: 0.06 });
        break;
      case "tick":
        this.tone(990, 0.02, { type: "square", gain: 0.028 });
        break;
    }
  }

  /** Play the SFX matching a batch of engine events (deduped). */
  playEvents(events: { type: string }[]) {
    const has = (t: string) => events.some((e) => e.type === t);
    if (has("death")) return this.play("death");
    if (has("win")) return this.play("win");
    if (has("ate")) return this.play("eat");
    if (has("dig")) return this.play("dig");
    if (has("push")) return this.play("push");
    if (has("split")) return this.play("split");
    if (has("door") && events.some((e) => e.type === "door" && (e as { open?: boolean }).open)) return this.play("door");
    if (has("bump")) return this.play("bump");
    if (has("move")) return this.play("move");
  }
}

export const sfx = new SoundEngine();
