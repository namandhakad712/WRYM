#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   WRYM · wyrm-bot — the community pipeline robot
   Pure Node (≥20) / bun. Talks to the GitHub REST API with GITHUB_TOKEN.
   No dependencies, no model calls: every action is deterministic.

   Subcommands:
     review   --pr N --report <file.md>        post/update the review card
              --json <file.json>               + label by verdict
     approve  --pr N --by <login> [--note …]   maintainer approval →
                                             label + enable auto-merge
     request-changes --pr N --by <login> --reason "…"
                                             return to contributor
     welcome  --pr N --slug-file <path>        post-merge celebration
     help
   ═══════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from "node:fs";

const REPO = process.env.GITHUB_REPOSITORY; // owner/repo — injected by Actions
const TOKEN = process.env.GITHUB_TOKEN;
const PR_AUTHOR = process.env.PR_AUTHOR ?? "";
if (!REPO || !TOKEN) {
  console.error("wyrm-bot: GITHUB_REPOSITORY and GITHUB_TOKEN must be set (GitHub Actions does this).");
  process.exit(2);
}
const API = `https://api.github.com/repos/${REPO}`;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "wyrm-bot/2.0 (WRYM community pipeline)",
};

const MARKER = "<!-- wyrm-bot:community-review -->";
const LABELS = {
  community: { name: "community-level", color: "a8d5a2", desc: "adds/edits community levels via the Level Forge" },
  validated: { name: "bot:validated", color: "2ea043", desc: "wyrm-bot certified every changed level" },
  needsRevision: { name: "bot:needs-revision", color: "d29922", desc: "returned to contributor — fix and push" },
  awaitingReview: { name: "bot:awaiting-review", color: "1f6feb", desc: "certified, waiting for maintainer approval" },
  approved: { name: "bot:approved", color: "8957e5", desc: "maintainer approved — merge cleared" },
  changesRequested: { name: "bot:changes-requested", color: "cf222e", desc: "maintainer requested modifications" },
};

// ── tiny API helpers ──────────────────────────────────────────────────
async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...HEADERS, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${body?.message ?? ""}`);
  return body;
}
const getPR = (n) => api(`/pulls/${n}`);
const listComments = (n) => api(`/issues/${n}/comments?per_page=100`);
const postComment = (n, body) => api(`/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body }) });
const patchComment = (id, body) => api(`/issues/comments/${id}`, { method: "PATCH", body: JSON.stringify({ body }) });

async function ensureLabels() {
  for (const l of Object.values(LABELS)) {
    const res = await fetch(`${API}/labels`, { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ name: l.name, color: l.color, description: l.desc }) });
    if (res.status === 201 || res.status === 422) continue; // created or exists
    console.warn(`label ${l.name}: ${res.status}`);
  }
}
async function setLabels(n, add = [], remove = []) {
  const pr = await getPR(n);
  const current = pr.labels.map((l) => l.name);
  const want = new Set([...current.filter((x) => !remove.includes(x)), ...add]);
  await api(`/issues/${n}/labels`, { method: "PUT", body: JSON.stringify({ labels: [...want] }) });
  return [...want];
}

// ── review card upsert ────────────────────────────────────────────────
async function upsertReviewCard(n, md) {
  const comments = await listComments(n);
  const mine = comments.find((c) => c.body.includes(MARKER));
  if (mine) {
    await patchComment(mine.id, md);
    console.log(`wyrm-bot: updated review card (comment ${mine.id})`);
  } else {
    const c = await postComment(n, md);
    console.log(`wyrm-bot: posted review card (comment ${c.id})`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : undefined;
};

try {
  await ensureLabels();

  if (cmd === "review") {
    const n = Number(opt("pr"));
    const mdPath = opt("report");
    const jsonPath = opt("json");
    const md = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : "";
    let verdict = "needs-revision";
    if (existsSync(jsonPath)) verdict = JSON.parse(readFileSync(jsonPath, "utf8")).verdict ?? verdict;

    await setLabels(n, ["community-level", LABELS.community.name], []);
    if (verdict === "validated") {
      await setLabels(n, [LABELS.validated.name, LABELS.awaitingReview.name], [LABELS.needsRevision.name, LABELS.changesRequested.name]);
      // ping the maintainer crew only when the state transitions to review
      const pr = await getPR(n);
      const already = (await listComments(n)).some((c) => c.body.includes("awaiting maintainer approval — reply"));
      if (!already && pr.requested_reviewers.length === 0 && !pr.requested_teams.length) {
        await postComment(n,
          `🪱 **Certified and awaiting maintainer approval.** The submission passed every deterministic check. ` +
          `A maintainer can approve with \`/wyrm approve\` or return it with \`/wyrm request-changes <reason>\`.`);
      }
    } else {
      await setLabels(n, [LABELS.needsRevision.name], [LABELS.validated.name, LABELS.awaitingReview.name, LABELS.approved.name]);
      if (PR_AUTHOR) {
        await postComment(n,
          `👋 @${PR_AUTHOR} — wyrm-bot **returned this submission for modification**. ` +
          `Every failed check is listed in the review card above with an exact fix. ` +
          `Edit the level in the [Level Forge](https://namandhakad712.github.io/WRYM/forge.html) (or the JSON directly), ` +
          `push to this branch, and the bot re-certifies automatically. Nothing is lost.`);
      }
    }
    if (md) await upsertReviewCard(n, md);
    process.exit(0);
  }

  if (cmd === "approve") {
    const n = Number(opt("pr"));
    const by = opt("by");
    const note = opt("note");
    await setLabels(n, [LABELS.approved.name], [LABELS.awaitingReview.name, LABELS.needsRevision.name, LABELS.changesRequested.name]);
    await postComment(n,
      `✅ **Approved by @${by}.**${note ? `\n\n> ${note}` : ""}\n\n` +
      `Machine checks: passed · Maintainer judgement: passed. Auto-merge is enabled — ` +
      `this level joins the public ladder the moment it lands on \`main\`, and the next ` +
      `benchmark run will play it against every ranked model.`);
    // best-effort auto-merge (squash keeps one clean commit per level)
    const res = await fetch(`${API}/pulls/${n}/merge`, {
      method: "PUT",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "squash", auto: true, commit_title: `merge: community level #${n} (approved by @${by})` }),
    });
    if (res.status === 200) console.log("wyrm-bot: merged immediately");
    else if (res.ok) console.log("wyrm-bot: auto-merge enabled");
    else console.log(`wyrm-bot: auto-merge not available (${res.status}) — maintainer should merge manually`);
    process.exit(0);
  }

  if (cmd === "request-changes") {
    const n = Number(opt("pr"));
    const by = opt("by");
    const reason = opt("reason") || opt("note") || "(no reason given)";
    await setLabels(n, [LABELS.changesRequested.name], [LABELS.approved.name, LABELS.awaitingReview.name]);
    const pr = await getPR(n);
    await postComment(n,
      `↩️ **Returned for modification by @${by}.**\n\n> ${reason}\n\n` +
      `@${pr.user.login} — the machine checks all passed, but a maintainer judged the design ` +
      `not ready for the ladder yet. Address the note above (design, fun, originality — things ` +
      `the bot cannot measure), push, and the review cycle starts again.`);
    process.exit(0);
  }

  if (cmd === "welcome") {
    const n = Number(opt("pr"));
    const pr = await getPR(n);
    const author = pr.user.login;
    const files = (pr.title.match(/[\w-]+\.json/g) ?? []).join(", ");
    await postComment(n,
      `🎉 **Welcome to the ladder, @${author}!**\n\n` +
      `Your level${files ? ` (\`${files}\`)` : ""} is merged and will appear on the public site ` +
      `within minutes: [levels atlas](https://namandhakad712.github.io/WRYM/levels.html) · ` +
      `[community board](https://namandhakad712.github.io/WRYM/community.html).\n\n` +
      `It is now permanent arena canon: every future benchmark run — every model, every rerun, ` +
      `every leaderboard refresh — will play your level, and your name is on its certificate. ` +
      `Thank you for digging with us. 🪱`);
    process.exit(0);
  }

  console.log(`wyrm-bot — WRYM community pipeline robot

usage: wyrm-bot.mjs <command> [options]
  review   --pr N --report <card.md> --json <report.json>   post/refresh the review card, label by verdict
  approve  --pr N --by <login> [--note]                     maintainer approval → label + auto-merge
  request-changes --pr N --by <login> --reason "…"          return to contributor with notes
  welcome  --pr N                                           post-merge celebration comment
env: GITHUB_REPOSITORY, GITHUB_TOKEN, [PR_AUTHOR]`);
  process.exit(0);
} catch (e) {
  console.error("wyrm-bot error:", e.message);
  process.exit(1);
}
