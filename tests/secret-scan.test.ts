// ── WRYM · zero-day hygiene gate ──────────────────────────────────────
// Scans every file git tracks for live-credential shapes: API keys,
// tokens, private keys. This is the "no zero days" promise, enforced:
// a leaked key fails CI the same second it lands in a commit.
//
// Scope = git-tracked files (what actually ships), so local .env files
// and ignored artifacts stay out of the blast radius by design.

import { describe, expect, test } from "bun:test";
import { execSync } from "child_process";

const PATTERNS: Array<[string, RegExp]> = [
  ["OpenAI-style key", /sk-[A-Za-z0-9]{20,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9-]{20,}/],
  ["GitHub PAT (classic)", /ghp_[A-Za-z0-9]{30,}/],
  ["GitHub PAT (fine-grained)", /github_pat_[A-Za-z0-9_]{20,}/],
  ["GitHub OAuth", /gho_[A-Za-z0-9]{30,}/],
  ["Google API key", /AIza[A-Za-z0-9_-]{30,}/],
  ["Groq key", /gsk_[A-Za-z0-9]{20,}/],
  ["NVIDIA key", /nvapi-[A-Za-z0-9_-]{20,}/],
  ["OpenRouter key", /sk-or-[A-Za-z0-9-]{20,}/],
  ["Slack token", /xox[bpars]-[A-Za-z0-9-]{10,}/],
  ["Private key block", /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["Zhipu/Z.ai key pair", /[a-f0-9]{32}\.[A-Za-z0-9]{16}/],
];

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".zip",
  ".gz", ".tar", ".lock", ".bin", ".db", ".sqlite",
]);

function trackedFiles(): string[] {
  try {
    return execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  } catch {
    // not a git checkout (paranoia) — scan the source tree instead
    return [];
  }
}

function localFallback(): string[] {
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
  const { join } = require("path") as typeof import("path");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (f === ".git" || f === "node_modules" || f === ".next" || f === "upload" || f === "skills") continue;
      const p = join(dir, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.size < 2_000_000) out.push(p);
    }
  };
  walk(process.cwd());
  return out;
}

describe("security · credential scan of the shipped tree", () => {
  test("no live secrets in any tracked file", () => {
    const files = trackedFiles().length ? trackedFiles() : localFallback();
    expect(files.length).toBeGreaterThan(50); // scan actually covered the repo
    const { readFileSync } = require("fs") as typeof import("fs");
    const hits: string[] = [];
    for (const f of files) {
      if (SKIP_EXT.has(f.slice(f.lastIndexOf(".")).toLowerCase())) continue;
      let text: string;
      try {
        text = readFileSync(f, "utf8");
      } catch {
        continue;
      }
      for (const [name, re] of PATTERNS) {
        const m = text.match(re);
        if (m) hits.push(`${f}: ${name} (${m[0].slice(0, 8)}…)`);
      }
    }
    expect(hits).toEqual([]);
  });

  test(".gitignore shields local secrets from the shipped tree", () => {
    const { readFileSync, existsSync } = require("fs") as typeof import("fs");
    const gi = readFileSync(".gitignore", "utf8");
    expect(gi).toMatch(/\.env/);
    void existsSync;
  });
});
