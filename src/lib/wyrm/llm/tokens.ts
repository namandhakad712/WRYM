// ── WYRM.LAB · token accounting & context-window fitting ────────────
// Every provider gets a budget: contextWindow − maxTokens − safety.
// When the conversation grows past it, the fitter drops the OLDEST
// user/assistant pairs (never the system instructions, never the
// current observation) and inserts a truncation marker, exactly like
// production agent harnesses do. Cheap char/CJK heuristic — accurate
// enough for budgeting, zero dependencies, works for every vendor.

import type { ChatMsg } from "./types";

const CJK_RE =
  /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

/** Estimate tokens for raw text: CJK ≈ 1 token/char, rest ≈ 1 token/4 chars. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  // sample every 4th char for speed on huge strings, then scale
  const step = text.length > 4096 ? 4 : 1;
  let sampled = 0;
  for (let i = 0; i < text.length; i += step) {
    if (CJK_RE.test(text[i])) cjk++;
    sampled++;
  }
  const cjkTotal = cjk * (text.length / Math.max(1, sampled));
  const other = Math.max(0, text.length - cjkTotal);
  return Math.ceil(cjkTotal + other / 4) + 2;
}

/** Estimate the wire size of a message list (incl. per-message overhead). */
export function estimateMessagesTokens(messages: ChatMsg[]): number {
  let n = 0;
  for (const m of messages) n += estimateTokens(m.content) + 5;
  return n;
}

export interface FitReport {
  messages: ChatMsg[];
  truncated: boolean;
  droppedTurns: number; // user/assistant pairs removed
  estimatedTokens: number;
  budget: number;
  contextWindow: number;
}

export interface FitOptions {
  contextWindow: number; // resolved window (already includes kind hint)
  reserveOut: number; // completion budget (maxTokens)
  safetyMargin?: number; // default 256
}

/**
 * Fit a conversation into the model's context window.
 *
 * Policy (in order):
 *  1. it already fits → untouched;
 *  2. drop oldest user/assistant PAIRS after the system block;
 *  3. if the tail alone still overflows, hard-truncate the head of the
 *     final user message (board + status live at the tail);
 *  4. as a last resort, truncate the system prompt's head.
 * A visible `[context truncated …]` marker is always left behind so the
 * model knows history was elided — no silent amnesia.
 */
export function fitToContext(messages: ChatMsg[], opts: FitOptions): FitReport {
  const safety = opts.safetyMargin ?? 256;
  const window = Math.max(2048, opts.contextWindow);
  const budget = Math.max(1024, window - opts.reserveOut - safety);
  const est = () => estimateMessagesTokens(messages);

  if (est() <= budget) {
    return {
      messages,
      truncated: false,
      droppedTurns: 0,
      estimatedTokens: est(),
      budget,
      contextWindow: window,
    };
  }

  const sysCount = messages.filter((m) => m.role === "system").length;
  // index of the first non-system message
  let firstBody = 0;
  while (firstBody < messages.length && messages[firstBody].role === "system") firstBody++;

  // body must keep at least the final message; drop pairs from the front
  let lo = firstBody;
  let hi = messages.length - 1; // last message index (the live observation)
  const work = messages.slice();
  let dropped = 0;
  while (hi - lo + 1 > 1 && estimateMessagesTokens([work[0], ...work.slice(lo, hi + 1)]) > budget) {
    // remove two messages (a user+assistant pair) from the front of the body
    const remove = lo + 2 <= hi ? 2 : 1;
    work.splice(lo, remove);
    dropped += remove === 2 ? 1 : 0;
    hi -= remove;
  }

  // still overflowing? hard-truncate the final user message from the top
  const lastIdx = work.length - 1;
  if (estimateMessagesTokens(work) > budget) {
    const last = work[lastIdx];
    const keepChars = Math.max(500, Math.floor((budget - estimateMessagesTokens(work.slice(0, lastIdx))) * 2.2));
    if (last.content.length > keepChars) {
      work[lastIdx] = {
        ...last,
        content:
          `[…${last.content.length - keepChars} earlier characters truncated to fit the context window…]\n` +
          last.content.slice(-keepChars),
      };
    }
    // and if the SYSTEM block itself is gigantic, trim its head too
    if (estimateMessagesTokens(work) > budget && work[0].role === "system" && sysCount > 0) {
      const sysBudget = Math.max(1000, budget - estimateMessagesTokens(work.slice(1)));
      const keepSys = Math.floor(sysBudget * 2.8);
      if (work[0].content.length > keepSys) {
        work[0] = {
          ...work[0],
          content:
            `[…rules truncated to fit context — full rules in earlier runs…]\n` + work[0].content.slice(-keepSys),
        };
      }
    }
  }

  // insert the truncation marker right after the system block
  if (dropped > 0) {
    const marker: ChatMsg = {
      role: "system",
      content: `[context truncated: ${dropped} earlier turn${dropped === 1 ? "" : "s"} omitted to fit the model's context window. The live board below is complete and authoritative.]`,
    };
    const insertAt = Math.min(firstBody, work.length - 1);
    work.splice(insertAt, 0, marker);
  }

  return {
    messages: work,
    truncated: true,
    droppedTurns: dropped,
    estimatedTokens: estimateMessagesTokens(work),
    budget,
    contextWindow: window,
  };
}

/** Resolve the effective context window: explicit value wins, else kind hint. */
export function resolveContextWindow(explicit: number | undefined, kindHint: number): number {
  if (explicit && explicit >= 1024) return explicit;
  return kindHint;
}
