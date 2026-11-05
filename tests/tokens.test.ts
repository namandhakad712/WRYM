// ── WRYM · token accounting & context fitter ──────────────────────────
// The context fitter is what lets a 200K-context GLM and an 8K local
// Qwen run the same protocol: history is trimmed deterministically with
// a visible marker, never silently.

import { describe, expect, test } from "bun:test";
import { estimateMessagesTokens, estimateTokens, fitToContext, resolveContextWindow } from "../src/lib/wyrm/llm/tokens";
import type { ChatMsg } from "../src/lib/wyrm/llm/types";

describe("estimateTokens", () => {
  test("non-empty text ⇒ positive integer", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
    expect(Number.isInteger(estimateTokens("x"))).toBe(true);
  });

  test("empty ⇒ 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("longer text ⇒ more tokens (monotone-ish)", () => {
    const short = estimateTokens("a".repeat(100));
    const long = estimateTokens("a".repeat(10_000));
    expect(long).toBeGreaterThan(short);
  });

  test("messages estimate covers all roles", () => {
    const msgs: ChatMsg[] = [
      { role: "system", content: "You are a worm." },
      { role: "user", content: "Move." },
      { role: "assistant", content: "right" },
    ];
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(estimateTokens("You are a worm."));
  });
});

describe("fitToContext", () => {
  const big: ChatMsg[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "u1 ".repeat(2000) },
    { role: "assistant", content: "a1 ".repeat(2000) },
    { role: "user", content: "u2 ".repeat(2000) },
  ];

  test("fits unchanged when the window is large enough", () => {
    const f = fitToContext(big, { contextWindow: 1_000_000, reserveOut: 1024 });
    expect(f.truncated).toBe(false);
    expect(f.messages.length).toBe(big.length);
  });

  test("truncates oldest history when over budget (keeps system + latest)", () => {
    const f = fitToContext(big, { contextWindow: 2000, reserveOut: 256 });
    expect(f.truncated).toBe(true);
    expect(f.messages[0].role).toBe("system"); // system prompt survives
    expect(f.messages[f.messages.length - 1].content).toBe(big[big.length - 1].content); // newest turn survives
    expect(f.messages.length).toBeLessThan(big.length);
    expect(f.estimatedTokens).toBeLessThanOrEqual(2000 - 256 + 8); // inside the window (marker tolerance)
  });

  test("tiny window still keeps at least the last exchange", () => {
    const f = fitToContext(big, { contextWindow: 300, reserveOut: 64 });
    expect(f.messages.length).toBeGreaterThanOrEqual(2);
  });

  test("empty history fits trivially", () => {
    const f = fitToContext([], { contextWindow: 100, reserveOut: 50 });
    expect(f.truncated).toBe(false);
    expect(f.estimatedTokens).toBeGreaterThanOrEqual(0);
  });
});

describe("resolveContextWindow", () => {
  test("explicit value wins", () => {
    expect(resolveContextWindow(4096, 128_000)).toBe(4096);
  });

  test("0/undefined falls back to the provider hint", () => {
    expect(resolveContextWindow(undefined, 200_000)).toBe(200_000);
    expect(resolveContextWindow(0, 32_768)).toBe(32_768);
  });
});
