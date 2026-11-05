#!/usr/bin/env python3
# ── WRYM · professional whitepaper builder ──────────────────────────
# Rebuilds docs/whitepaper.pdf AND site/assets/whitepaper.pdf from the
# committed results/ archive. Pure reportlab (no network, no fonts to
# download — core PDF fonts only, WinAnsi-safe text), re-runnable:
#     python3 scripts/build-paper.py
#
# Structure follows the research-paper convention: title block, abstract,
# TL;DR, numbered sections, tables with captions, verified references.
from __future__ import annotations
import json, pathlib, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, HRFlowable, KeepTogether, PageBreak,
)
from reportlab.pdfbase import pdfmetrics

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = [ROOT / "docs" / "whitepaper.pdf", ROOT / "site" / "assets" / "whitepaper.pdf"]

# ── palette: paper-white academic body with WRYM brand accents ────────
INK    = colors.HexColor("#221a13")   # body text
INK2   = colors.HexColor("#4a3a2c")   # secondary text
CORAL  = colors.HexColor("#c9514c")   # brand accent (section numbers)
SOIL   = colors.HexColor("#3a2e24")   # table header fill
CREAM  = colors.HexColor("#fce8d5")   # table header text
LINE   = colors.HexColor("#d8cbb8")   # hairlines
PANEL  = colors.HexColor("#faf6ef")   # tinted boxes
GOLD   = colors.HexColor("#b88914")
LEAF   = colors.HexColor("#4e8f3f")

PAGE_W, PAGE_H = A4
M_SIDE, M_TOP, M_BOT = 56, 64, 58
AVAIL = PAGE_W - 2 * M_SIDE          # ~483pt

TIER_COLOR = {
    "TUTORIAL": colors.HexColor("#4e8f3f"), "CORE": colors.HexColor("#3f7fa3"),
    "ADVANCED": colors.HexColor("#38889b"), "GAUNTLET": colors.HexColor("#a06f1d"),
    "ABYSS": colors.HexColor("#a34438"), "NIGHTMARE": colors.HexColor("#a81f3c"),
}

# ── data ───────────────────────────────────────────────────────────────
levels = json.loads((ROOT / "results" / "levels.json").read_text())
models = json.loads((ROOT / "results" / "models.json").read_text())
runs_root = ROOT / "results" / "runs"
n_runs = sum(1 for d in runs_root.iterdir() for _ in d.glob("*.json")) if runs_root.exists() else 0
n_models = sum(1 for m in models if m.get("enabled"))
by_tier: dict[str, int] = {}
for l in levels:
    by_tier[l.get("tier", "?")] = by_tier.get(l.get("tier", "?"), 0) + 1
top = sorted(levels, key=lambda l: -l.get("difficulty", 0))[:6]
avg_diff = sum(l.get("difficulty", 0) for l in levels) / max(1, len(levels))
tier5 = [l for l in levels if l.get("tier") in ("GAUNTLET", "ABYSS", "NIGHTMARE")]
DATE = datetime.date.today().strftime("%B %Y")

# ── styles ─────────────────────────────────────────────────────────────
def st(name, **kw):
    base = dict(fontName="Times-Roman", fontSize=9.9, leading=14.4,
                textColor=INK, alignment=TA_JUSTIFY, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "title":    st("title", fontName="Helvetica-Bold", fontSize=22.5, leading=27,
                   alignment=TA_CENTER, textColor=INK, spaceAfter=4),
    "subtitle": st("subtitle", fontName="Helvetica", fontSize=11.5, leading=15.5,
                   alignment=TA_CENTER, textColor=INK2, spaceAfter=2),
    "meta":     st("meta", fontName="Helvetica", fontSize=9, leading=13,
                   alignment=TA_CENTER, textColor=INK2, spaceAfter=0),
    "h1":       st("h1", fontName="Helvetica-Bold", fontSize=12.6, leading=16,
                   textColor=INK, spaceBefore=15, spaceAfter=5, alignment=TA_LEFT),
    "h2":       st("h2", fontName="Helvetica-Bold", fontSize=10.4, leading=13.5,
                   textColor=INK2, spaceBefore=9, spaceAfter=3, alignment=TA_LEFT),
    "body":     st("body"),
    "abstract": st("abstract", fontSize=9.3, leading=13.4, spaceAfter=0),
    "tldr":     st("tldr", fontSize=9.6, leading=14, spaceAfter=0),
    "caption":  st("caption", fontName="Helvetica-Oblique", fontSize=8.3, leading=11,
                   textColor=INK2, alignment=TA_LEFT, spaceBefore=3, spaceAfter=10),
    "cell":     st("cell", fontSize=8.6, leading=11.6, alignment=TA_LEFT, spaceAfter=0),
    "cellb":    st("cellb", fontName="Helvetica-Bold", fontSize=8.6, leading=11.6,
                   alignment=TA_LEFT, spaceAfter=0, textColor=CREAM),
    "celln":    st("celln", fontSize=8.6, leading=11.6, alignment=TA_CENTER, spaceAfter=0),
    "ref":      st("ref", fontSize=8.8, leading=12.6, alignment=TA_LEFT,
                   spaceAfter=4, leftIndent=18, firstLineIndent=-18),
    "kw":       st("kw", fontName="Helvetica", fontSize=8.8, leading=12.5,
                   alignment=TA_LEFT, spaceAfter=0),
}

def P(text, style="body"):
    return Paragraph(text, S[style])

def sec(n, title):
    return KeepTogether([
        Paragraph(f'<font color="#c9514c"><b>{n}</b></font>&nbsp;&nbsp;<b>{title}</b>', S["h1"]),
    ])

def tbl(head, rows, ratios, aligns=None, header_bg=SOIL):
    data = [[Paragraph(h, S["cellb"]) for h in head]]
    for r in rows:
        cells = []
        for j, c in enumerate(r):
            sty = "celln" if (aligns and aligns[j] == "c") else "cell"
            if isinstance(c, Paragraph):
                cells.append(c)
            else:
                cells.append(Paragraph(str(c), S[sty]))
        data.append(cells)
    widths = [x * AVAIL for x in ratios]
    assert abs(sum(ratios) - 1.0) < 0.01, "column ratios must sum to 1"
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f2ea")]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

def tier_chip(tier):
    c = TIER_COLOR.get(tier, "#4a3a2c").hexval()[2:] if hasattr(TIER_COLOR.get(tier), "hexval") else "4a3a2c"
    col = "#" + (TIER_COLOR.get(tier, colors.HexColor("#4a3a2c")).hexval()[2:] if hasattr(TIER_COLOR.get(tier, colors.HexColor("#4a3a2c")), "hexval") else "4a3a2c")
    return f'<font color="{col}"><b>{tier}</b></font>'

# ── page furniture ─────────────────────────────────────────────────────
def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.8)
    canvas.setFillColor(INK2)
    canvas.drawString(M_SIDE, PAGE_H - 40, "WRYM: The Worm Arena — an open, deterministic game benchmark for language models")
    canvas.drawRightString(PAGE_W - M_SIDE, PAGE_H - 40, "v3.2 · " + DATE)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(M_SIDE, PAGE_H - 46, PAGE_W - M_SIDE, PAGE_H - 46)
    canvas.line(M_SIDE, 44, PAGE_W - M_SIDE, 44)
    canvas.drawCentredString(PAGE_W / 2, 32, str(doc.page))
    canvas.drawString(M_SIDE, 32, "the WRYM project")
    canvas.drawRightString(PAGE_W - M_SIDE, 32, "github.com/namandhakad712/WRYM")
    canvas.restoreState()

doc = BaseDocTemplate(
    str(OUT[0]), pagesize=A4,
    leftMargin=M_SIDE, rightMargin=M_SIDE, topMargin=M_TOP, bottomMargin=M_BOT,
    title="WRYM: The Worm Arena — an open, deterministic game benchmark for language models",
    author="The WRYM Project (namandhakad712)",
    subject="LLM game-arena benchmark: certified solvability, evidence-based difficulty index, deterministic checking, community level governance",
    creator="WRYM whitepaper builder (reportlab)",
)
frame = Frame(M_SIDE, M_BOT, AVAIL, PAGE_H - M_TOP - M_BOT, id="main")
doc.addPageTemplates([PageTemplate(id="paper", frames=[frame], onPage=furniture)])

E = []  # story

# ═══════════════════════════════════════ TITLE BLOCK ══════════════════
E.append(Spacer(1, 10))
E.append(P("WRYM: The Worm Arena", "title"))
E.append(P("An open, deterministic game benchmark for language models, with certified solvability,<br/>an evidence-based difficulty index, and community level governance", "subtitle"))
E.append(Spacer(1, 6))
E.append(P("The WRYM Project · maintained by namandhakad712 · namandhakad712.github.io/WRYM", "meta"))
E.append(P("Version 3.2 · " + DATE + " · this document is regenerated from the committed archive by <font face='Courier'>scripts/build-paper.py</font>", "meta"))
E.append(Spacer(1, 8))
E.append(HRFlowable(width="100%", thickness=1.1, color=SOIL))
E.append(Spacer(1, 12))

# abstract
E.append(KeepTogether([
    Paragraph("<b>Abstract</b>", S["h2"]),
    tbl([], [[P(
        "Grid puzzle games are a uniquely clean instrument for measuring planning in large language "
        "models: state is fully observable and compactly serialisable, rules are deterministic, and "
        "difficulty is structural rather than perceptual. WRYM (a deliberate misspelling of its ancestor "
        "WOIM) turns a grid-worm puzzle — eat every apple, manage your own body, push crates, press "
        "plates, respect one-way valves, cross crumbling bridges, slide on ice, and cut yourself in "
        "half when flesh is the only weight that holds a door open — into a fully static, fully "
        "reproducible LLM benchmark. Models see the board only as text and must reason turn by turn "
        "under a tight budget. Every level is certified solvable by an exhaustive breadth-first solver "
        "before entering the ladder; every recorded run is re-played and signed by a deterministic "
        "checker; difficulty is measured by a seven-dimension index computed from evidence on the "
        "optimal line. The arena ships a browser level editor, a GitHub-bot review pipeline with "
        "maintainer approval for community levels, plug-in adapters for fourteen provider kinds plus "
        "Model Context Protocol (MCP), and a leaderboard whose every number is a pure function of "
        "committed JSON. The ladder tops out at The Rubicon, certified 9.0/10 (NIGHTMARE) — engineered "
        "from primary research on Snakebird, Stephen's Sausage Roll, Sokoban's PSPACE-completeness "
        "proofs, and WOIM itself.", "abstract")]],
        [1.0], header_bg=PANEL),
]))
E.append(Spacer(1, 10))

# tldr
E.append(KeepTogether([
    Paragraph("<b>TL;DR</b>", S["h2"]),
    tbl([], [[P(
        "<b>We make LLMs play a hard worm puzzle and measure them honestly.</b> Text-only board, "
        "turn budget, exhaustive-solver par, deterministic checker, seven-dimension difficulty index "
        "that refuses to inflate, pooled Bradley-Terry ratings with bootstrap confidence intervals, "
        "fine-grained progress scores, capability profiles, certified mirror variants, community levels "
        "through a bot-and-maintainer review "
        "framework, any model pluggable (OpenAI-compatible adapters or MCP), everything committed as "
        "JSON and rendered by a static site. Failure is expected — the information is in the failure.", "tldr")]],
        [1.0], header_bg=PANEL),
]))
E.append(Spacer(1, 6))
E.append(P("<b>Keywords:</b> language models, benchmarks, game arenas, planning, deterministic evaluation, "
           "PSPACE-completeness, Elo rating, reproducibility, Model Context Protocol", "kw"))
E.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
E.append(Spacer(1, 4))

# ═══════════════════════════════════════ 1 INTRO ══════════════════════
E.append(sec("1", "Introduction"))
E.append(P(
    "Static question banks saturate and contaminate: answers leak into pretraining corpora, and a "
    "percentage on such a bank says increasingly little about planning. Live arenas solved the "
    "contamination half by generating fresh comparisons — Chatbot Arena [1] ranks models by pairwise "
    "human preference and has become one of the most referenced leaderboards in the field — but "
    "preference voting measures conversational polish, not multi-step planning under hard constraints. "
    "WRYM occupies the missing quadrant: a live, generative task where the <i>work</i> is planning, "
    "the rules are fixed, and every artifact of evaluation is public."))
E.append(P(
    "The design brief was taken from a commercial game, not from ML literature. WOIM [8] (Dogspawn, "
    "2026) is a Sokoban-tagged worm puzzle on Steam whose core mechanic is that the player's own "
    "body — grown by eating apples, shortened by self-amputation — is simultaneously the mover and "
    "the tool. We rebuilt a text-projection dialect of that game with a 19-character grid vocabulary, "
    "made an exhaustive solver the arbiter of truth, and wrapped the result in the governance "
    "machinery of a serious open-source project: determinism, certification, review, and archival. "
    "This paper documents the benchmark (Sections 3-6), its community governance framework "
    "(Section 7), its model plug-in architecture including verified free-tier entry points "
    "(Section 8), and the current archive (Section 9)."))

# ═══════════════════════════════════════ 2 RELATED ════════════════════
E.append(sec("2", "Related Work and Design Lineage"))
E.append(P("<b>LLM arenas.</b> Chatbot Arena [1] established the pairwise-comparison arena as an "
           "evaluation instrument: anonymous side-by-side battles, ratings from votes, open data. Its "
           "statistical machinery converged on pooled Bradley-Terry maximum-likelihood estimation with "
           "bootstrapped confidence intervals. WRYM borrows the arena <i>shape</i> and the "
           "estimator — all-pairs battles on shared levels fitted at once, with a solved run beating "
           "an unsolved one and efficiency breaking ties — but replaces human preference with a "
           "deterministic checker, so the ground truth needs no trust in judges. Kaggle Game Arena "
           "[11] applies the same doctrine to competitive games; we adopt its head-to-head matrix "
           "and its evergreen answer — a new map <i>is</i> a new test. Independent third-party "
           "measurement sites such as Artificial Analysis [7] play the complementary role "
           "of context: our leaderboard links every ranked model to its Artificial Analysis page so "
           "arena results can be read against independent intelligence, speed and price measurements."))
E.append(P("<b>Game benchmarks for LLMs.</b> Five systems directly shaped the v2 measurement stack. "
           "BALROG [12] aggregates six long-horizon game environments and showed both that fine-grained "
           "<i>progress</i> metrics beat binary win/loss and that frontier models often perform worse "
           "with pixels than with text — we adopted the progress score (apples, goal, distance "
           "closure on every archived run) and the text-first doctrine. SmartPlay [13] decomposes "
           "agent skill into nine named capabilities and maps each game to the subset it stresses; "
           "our seven-capability taxonomy (spatial, planning, dependencies, state-tracking, "
           "long-horizon, risk, precision) is derived deterministically from each level's geometry "
           "and every model carries an intensity-weighted capability profile. LMGame-Bench [14] "
           "evaluates LLMs on real games with and without a gaming harness and hardens them against "
           "contamination; our answer to contamination is the certified mirror-variant registry — "
           "every ladder level has a validator-certified vertical-mirror twin with identical par, so "
           "memorization without reasoning is detectable. VideoGameBench [15] demonstrated the "
           "modality axis (raw-pixels VLM play); we record modality as an explicit run-schema axis "
           "while shipping the deterministic text projection as primary. Terminal-Bench [17] "
           "publishes resolution rates with confidence intervals, cost and token columns and "
           "structured error analysis; our leaderboard adopted all three, plus its failure taxonomy. "
           "AgentBench [16] established the environment-as-pluggable-protocol doctrine our engine, "
           "checker and rating layers follow."))
E.append(P("<b>Complexity theory.</b> The game family WRYM belongs to is provably hard. Sokoban is "
           "PSPACE-complete [2]; the Hearn-Demaine nondeterministic constraint logic framework [3] "
           "unified sliding-block and pushing puzzles under one PSPACE-complete umbrella; and "
           "food-collecting Snake — the closest formal cousin of our worm — is PSPACE-complete on "
           "general grid graphs [4]. Practical consequence: no polynomial shortcut will certify our "
           "levels, so the exhaustive solver is not an implementation convenience but the only "
           "available ground truth, and board sizes must stay small enough for exhaustive search to "
           "terminate inside CI (our ceiling is 25 million states)."))
E.append(P("<b>Game design lineage.</b> The ladder's difficulty vocabulary was reverse-engineered "
           "from the games that define the genre's upper bound: Snakebird [9] (unwinnable-from-one-"
           "wrong-press planning, fruit-order length contracts), Stephen's Sausage Roll [10] (long "
           "chains of irreversible acts where undo is impossible), and WOIM [8] itself (the body-as-"
           "resource economy). Section 6 details how Tier V was engineered from these sources."))

# ═══════════════════════════════════════ 3 GAME ═══════════════════════
E.append(sec("3", "The Game"))
E.append(P(
    "A level is a rectangular grid over a 19-character vocabulary (Table 1). The worm is a directed "
    "segment chain: a head @ and a body of o cells that trails it. Each turn the model emits exactly "
    "one action — up, down, left, right, or split. Movement rules are the classic worm contract with "
    "WOIM's amendment: eating an apple grows the worm by one segment; splitting severs the tail "
    "beyond the midpoint, permanently donating it as inert terrain. Gates open only while every floor "
    "button is weighted; padlocks consume keys; soft dirt is dug through and never returns; bridges "
    "crumble one turn after their last weight leaves; ice slides the worm until something stops it; "
    "spikes kill instantly, including mid-slide; one-way valves permit entry only along their arrow. "
    "The run is won when the last apple has been eaten and the head occupies the heart X, and lost "
    "on death or turn-budget exhaustion."))
vocab_rows = [
    ["#", "soil wall", "impassable bedrock; the board frame"],
    [".", "tunnel", "carved open floor"],
    ["@", "worm head", "exactly one; directed"],
    ["o", "worm body", "trail segments; length is state"],
    ["*", "apple", "each eaten apple grows the worm by one"],
    ["X", "heart goal", "win tile; unsealed by the last apple"],
    ["$", "walnut crate", "pushable, weighs buttons, floats on nothing"],
    ["%", "floor button", "depressed by any weight"],
    ["D", "golden gate", "open while every button is pressed"],
    ["~", "spikes", "instant death, also mid-slide"],
    ["+", "soft dirt", "diggable; permanently opens"],
    ["k / L", "key / padlock", "crawl over to pick up; consumes one key"],
    ["> &lt; ^ v", "one-way valves", "enter only along the arrow"],
    ["=", "crumble bridge", "crosses once, then rubble"],
    ["_", "frictionless ice", "slide until stopped"],
]
E.append(KeepTogether([
    tbl(["char", "element", "behaviour"], vocab_rows, [0.12, 0.22, 0.66], aligns=["c", None, None]),
    Paragraph("Table 1 — The 19-character grid vocabulary (two pairs share rows for space).", S["caption"]),
]))

# ═══════════════════════════════════════ 4 PROTOCOL ═══════════════════
E.append(sec("4", "The Arena Protocol"))
E.append(P(
    "The pipeline is a fixed, auditable chain: GENERATE, VALIDATE, SOLVE, PLAY, CHECK, ELO, COMMIT, "
    "PAGES. <b>Validate:</b> the exhaustive breadth-first solver proves each level solvable and "
    "computes the optimal move count (par) and the difficulty index of Section 5; uncertifiable "
    "levels never enter the ladder. <b>Solve:</b> the same solver plays perfectly, producing the "
    "reference line every model is measured against — it is ranked on the leaderboard as WYRM-BFS, "
    "visibly, as the yardstick rather than a competitor. <b>Play:</b> each LLM receives a frozen "
    "text projection of the board (the grid, worm position and length, apples remaining, keys held, "
    "turn budget) plus the complete rule book, and acts one turn at a time; invalid actions are "
    "rejected with a machine reason — free information, as in the real game — and every thought, "
    "latency and retry is recorded. <b>Check:</b> an independent deterministic checker re-executes "
    "the recorded action stream on a fresh engine and signs the run CERTIFIED or INVALID; models "
    "never grade themselves, and a mismatch voids the artifact. <b>Rate:</b> pooled Bradley-Terry "
    "MLE over all shared-level battles at once (the Chatbot Arena / Kaggle Game Arena estimator), "
    "with 400-round deterministic bootstrap 95% confidence intervals and anchor shrinkage so "
    "thin battle matrices stay finite; a solved run beats an unsolved one, efficiency breaks ties, "
    "failures draw for half a win each. <b>Commit &amp; Pages:</b> run JSON is committed to the repository and a static "
    "site re-renders from it, so the leaderboard is a pure function of versioned data."))

# ═══════════════════════════════════════ 5 DIFFICULTY ═════════════════
E.append(sec("5", "The Difficulty Index (v3)"))
E.append(P(
    "Difficulty is measured, not asserted. The index replays the certified optimal solution through "
    "the real engine and records evidence along seven dimensions (Table 2), each saturating smoothly "
    "to 100. The composite blends a weighted mean with the strongest dimension and maps to tiers "
    "TUTORIAL through NIGHTMARE. Two honesty properties matter more than the formula: a level "
    "containing no ice can never score on simulation, and no spikes means no threat score — the "
    "index refuses to reward mechanics that are absent. In the current %d-level ladder the mean "
    "difficulty is %.1f and exactly %d level(s) reach NIGHTMARE." % (len(levels), avg_diff, by_tier.get("NIGHTMARE", 0))))
dim_rows = [
    ["depth", "plan length of the optimal line", "how far the winning plan stretches"],
    ["search", "BFS states explored (log scale)", "combinatorial width of the space"],
    ["irreversibility", "permanent world mutations on the line", "digs, burns, unlocks, splits"],
    ["simulation", "forced ice glides to trace", "must-look-ahead move sequences"],
    ["threat", "legal moves that would kill", "the price of error"],
    ["choreography", "sub-goal ordering load", "apples/keys/plates interdependence"],
    ["budget", "turn-limit pressure", "par relative to the limit"],
]
E.append(KeepTogether([
    tbl(["dimension", "measured from", "meaning"], dim_rows, [0.20, 0.38, 0.42]),
    Paragraph("Table 2 — The seven dimensions of the v3 difficulty index, each 0-100.", S["caption"]),
]))

# ═══════════════════════════════════════ 6 LADDER ═════════════════════
E.append(sec("6", "The Ladder and Tier V"))
E.append(P(
    "The ladder is a hand-authored progression of %d levels whose difficulty curve is enforced, not "
    "hoped for: every level carries its computed certificate, and the tiers partition the curve "
    "(Table 3). Tier V — the Fifth Circle — was engineered from the primary sources of Section 2: "
    "Snakebird's single-wrong-press unwinnability became our threat dimension; Stephen's Sausage "
    "Roll's irreversible chains became bridges, dirt and splits that cannot be taken back; the "
    "Sokoban proof's corridor gadgets became valve mazes; WOIM's body economy became levels where "
    "the certified optimal line requires the worm to sever itself mid-route so its own remains act "
    "as slide-stoppers for the next ice glide (Absolute Zero, The Rubicon). The top of the ladder "
    "is summarised in Table 4." % len(levels)))
tier_rows = []
for t in ["TUTORIAL", "CORE", "ADVANCED", "GAUNTLET", "ABYSS", "NIGHTMARE"]:
    if by_tier.get(t):
        tier_rows.append([tier_chip(t), str(by_tier.get(t, 0)), {
            "TUTORIAL": "rules introduced one at a time", "CORE": "one mechanic under pressure",
            "ADVANCED": "mechanic pairs, mild irreversibility", "GAUNTLET": "long choreography, real threats",
            "ABYSS": "deep plans, simulation load, splits", "NIGHTMARE": "all seven dimensions simultaneously",
        }[t]])
E.append(KeepTogether([
    tbl(["tier", "levels", "character"], tier_rows, [0.22, 0.12, 0.66], aligns=[None, "c", None]),
    Paragraph("Table 3 — Tier structure of the certified ladder (computed, not declared).", S["caption"]),
]))
top_rows = []
for l in top:
    top_rows.append([
        "%s (%s)" % (l["name"], l["slug"]),
        tier_chip(l.get("tier", "?")),
        "%.1f" % l["difficulty"],
        "%d/%d" % (l["minMoves"], l.get("turnLimit", 120)),
        "{:,}".format(l.get("statesExplored", 0)),
    ])
E.append(KeepTogether([
    tbl(["level", "tier", "difficulty", "par/budget", "states"], top_rows,
        [0.36, 0.15, 0.15, 0.15, 0.19], aligns=[None, "c", "c", "c", "c"]),
    Paragraph("Table 4 — The summit of the ladder: the six highest certified difficulties.", S["caption"]),
]))

# ═══════════════════════════════════════ 7 GOVERNANCE ═════════════════
E.append(sec("7", "Community Governance: the Submission Framework"))
E.append(P(
    "Anyone can add a level, and no human can quietly break the benchmark. The Level Forge — a "
    "browser editor that ships the exact engine, exhaustive validator and difficulty index the "
    "ladder uses — lets a contributor paint, certify and playtest a level, then submit it as a "
    "GitHub pull request with a contributor card (name, GitHub handle, design intent, tags) "
    "embedded in the level file. From there a two-sided review framework takes over."))
E.append(P(
    "<b>wyrm-bot, the machine half.</b> On every PR touching the community ladder, a GitHub Actions "
    "bot re-certifies each changed level (schema, structure, size and budget policy, slug "
    "collisions, exhaustive solvability, certificate honesty) and re-validates the entire existing "
    "community ladder so regressions fail too. It posts a structured review card to the PR — "
    "contributor, intent, par, difficulty, tier, state count, mechanics on the optimal line, exact "
    "failures with fix hints — and labels the PR: bot:validated with bot:awaiting-review, or "
    "bot:needs-revision, in which case the submission is returned to the contributor with "
    "everything needed to fix it; pushing a fix restarts certification automatically."))
E.append(P(
    "<b>Maintainers, the human half.</b> What a bot cannot judge — design quality, fairness, "
    "originality, difficulty placement, honest credit — is decided by maintainers listed in the "
    "repository's MAINTAINERS file, via slash commands on the PR: /wyrm approve (label "
    "bot:approved, auto-merge engages), /wyrm request-changes with a reason (returned with notes), "
    "/wyrm revalidate (re-run certification), /wyrm help. On merge the bot posts the contributor a "
    "celebration card, the export pipeline picks the level up, and it goes live on the public "
    "ladder with the contributor's name on its certificate — then every future benchmark run, "
    "every leaderboard refresh, plays it. The whole lifecycle is public record on the site's "
    "community board, live from the GitHub API."))

# ═══════════════════════════════════════ 8 PLUG-IN ════════════════════
E.append(sec("8", "Model Plug-in Architecture"))
E.append(P(
    "The arena speaks OpenAI-style chat over pluggable adapters — fourteen provider kinds are "
    "built in, including OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, OpenRouter, xAI, "
    "Together, Ollama and LM Studio, plus a custom kind for any OpenAI-compatible endpoint — and "
    "wraps them in a production reliability layer: rate limiter (RPM/TPM/concurrency), "
    "context fitter, classified retries, circuit breaker and fallback chains, all recorded in a "
    "per-run reliability ledger. Any model not reachable this way can still enter over the "
    "Model Context Protocol [6]: a zero-dependency MCP bridge exposes the game as tools so "
    "MCP-capable clients play without custom code."))
E.append(P(
    "Entry is deliberately free. Our verified provider research (November 2026) found ten providers "
    "with genuine free tiers and no credit card — Google AI Studio (the most generous: Gemini "
    "Flash family, up to ~1,500 requests/day, 1M-token context), Groq, Cerebras, OpenRouter's "
    ":free pool, Mistral's Experiment tier (~1B tokens/month), Cloudflare Workers AI, NVIDIA NIM, "
    "Cohere's trial keys, SiliconFlow, AnyAPI, and a local Ollama — plus one retired service (GitHub "
    "Models, shut down 30 July 2026) and several that require payment details. The full, "
    "source-linked table ships on the site's Providers page and in the repository's "
    "FREE_PROVIDERS research doc. The benchmark's configuration carries ready-made entries for "
    "the free tiers, with rate limits pre-set to live inside them."))

# ═══════════════════════════════════════ 9 ARCHIVE ════════════════════
E.append(sec("9", "The Archive"))
E.append(P(
    "The archive currently holds %d certified levels and %d archived runs over %d enabled model "
    "configurations. The reference line — WYRM-BFS, the exhaustive solver — has played the entire "
    "ladder at par, certifying every level's solvability claim publicly and providing the baseline "
    "against which LLM efficiency is computed (efficiency = par moves / model moves on solved "
    "runs). Language-model runs are executed locally by whoever operates the arena and committed "
    "as JSON; the site re-renders from the commit. We publish the reference line's replays in "
    "full — every step, every state — as worked solutions, the way a textbook publishes answers."
    % (len(levels), n_runs, n_models)))
E.append(P(
    "An honesty rule governs the leaderboard: a configured model with zero archived runs is listed "
    "as awaiting first run and never shows a default rating; the solver row is ranked visibly but "
    "flagged as the reference line, not a competitor. Every model entry links to its independent "
    "Artificial Analysis [7] page so arena results can be cross-read against third-party "
    "intelligence, speed and price measurements."))

# ═══════════════════════════════════════ 10 REPRODUCIBILITY ═══════════
E.append(sec("10", "Reproducibility"))
E.append(P(
    "Everything is a pure function of committed artifacts. The engine, validator, difficulty index "
    "and Elo are single-source: the same TypeScript modules run in CI, in the local benchmark "
    "runner, and (compiled to a browser bundle) inside the Level Forge — so a certificate earned "
    "in a contributor's browser tab is bit-identical to the one CI computes. The site is static: "
    "no backend, no database, no server-side computation; the leaderboard, level atlas, replay "
    "viewer (with the model's recorded thoughts alongside the board) and community board are all "
    "rendered from committed JSON and the public GitHub API. Rebuilding the entire published "
    "artifact from a clean clone is one command; regenerating this paper is another."))

# ═══════════════════════════════════════ 11 LIMITATIONS ═══════════════
E.append(sec("11", "Limitations and Future Work"))
E.append(P(
    "Exhaustive certification bounds board size: levels must stay within ~25 million BFS states, "
    "which caps how large a single trial can be, though not how deep its plan must be. The text "
    "projection is lossy by design — that is the point — but vision models could optionally "
    "receive rendered boards, and the vocabulary could grow (eggs, teleports, time manipulation "
    "all exist in the source games). The v2 rating stack — pooled Bradley-Terry with bootstrap "
    "confidence intervals, anchor shrinkage, capability profiles, progress scores and the mirror-"
    "variant registry — was built for the thin-matrix regime, but with very few models the "
    "intervals remain wide; battle density is the honest fix. The community framework currently trusts one maintainer list; a CODEOWNERS-based "
    "review quorum is a configuration change away. Finally, the ladder measures planning under "
    "certainty — the games we drew from have no hidden information, and neither do we; imperfect-"
    "information variants remain future work."))

# ═══════════════════════════════════════ REFERENCES ═══════════════════
E.append(sec("", "References"))
refs = [
    "[1] Chiang, W.-L., Zheng, L., Sheng, Y., Angelopoulos, A. N., Li, T., Li, D., Zhang, H., Zhu, B., Jordan, M., Gonzalez, J. E., &amp; Stoica, I. (2024). Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference. arXiv:2403.04132. https://arxiv.org/abs/2403.04132 — Bradley-Terry MLE + bootstrap CI methodology: https://lmsys.org/blog/2023-12-07-leaderboard",
    "[2] Culberson, J. C. (1997). Sokoban is PSPACE-complete. Technical Report TR97-02, Department of Computing Science, University of Alberta. https://ualberta.scholaris.ca/items/12921687-eb68-4032-9a46-1af150d60008",
    "[3] Hearn, R. A., &amp; Demaine, E. D. (2002). PSPACE-Completeness of Sliding-Block Puzzles and Other Problems through the Nondeterministic Constraint Logic Model of Computation. arXiv:cs/0205005. https://arxiv.org/abs/cs/0205005",
    "[4] De Biasi, M., &amp; Ophelders, T. (2016). The Complexity of Snake. In 8th International Conference on Fun with Algorithms (FUN 2016), LIPIcs 49, 11:1-11:13. https://doi.org/10.4230/LIPIcs.FUN.2016.11",
    "[5] Elo, A. E. (1978). The Rating of Chessplayers, Past and Present. New York: Arco.",
    "[6] Anthropic (2024). Introducing the Model Context Protocol. https://www.anthropic.com/news/model-context-protocol — specification: https://modelcontextprotocol.io",
    "[7] Artificial Analysis (2026). Independent analysis of AI models and API providers. https://artificialanalysis.ai",
    "[8] Dogspawn (2026). WOIM. Steam. https://store.steampowered.com/app/4272020/WOIM",
    "[9] Noumenon Games (2015). Snakebird. Steam. https://store.steampowered.com/app/357300/Snakebird",
    "[10] Lavelle, S. (2016). Stephen's Sausage Roll. Steam. https://store.steampowered.com/app/353540/Stephens_Sausage_Roll",
    "[11] Kaggle / Google DeepMind (2025). Introducing Kaggle Game Arena. https://www.kaggle.com/blog/introducing-game-arena — Werewolf and poker expansion (2026): https://blog.google/innovation-and-ai/models-and-research/google-deepmind/kaggle-game-arena-updates",
    "[12] Paglieri, D., Cupial, B., Coward, S., Piterbarg, U., et al. (2024). BALROG: Benchmarking Agentic LLM and VLM Reasoning On Games. ICLR 2025. arXiv:2411.13543. https://arxiv.org/abs/2411.13543",
    "[13] Wu, Y., Tang, X., Mitchell, T. M., &amp; Li, Y. (2023). SmartPlay: A Benchmark for LLMs as Intelligent Agents. arXiv:2310.01557. https://arxiv.org/abs/2310.01557",
    "[14] Hu, L., et al. (2025). LMGame-Bench: How Good are LLMs at Playing Games? ICLR 2026. arXiv:2505.15146. https://arxiv.org/abs/2505.15146",
    "[15] Zhang, A. L., et al. (2025). VideoGameBench: Can Vision-Language Models complete famous video games? arXiv:2505.18134. https://arxiv.org/abs/2505.18134",
    "[16] Liu, X., et al. (2023). AgentBench: Evaluating LLMs as Agents. arXiv:2308.03688. https://arxiv.org/abs/2308.03688",
    "[17] Merrill, M. A., Shaw, A. G., Carlini, N., et al. (2026). Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces. arXiv:2601.11868. https://arxiv.org/abs/2601.11868",
]
for r in refs:
    E.append(P(r, "ref"))
E.append(Spacer(1, 8))
E.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
E.append(P("<i>Every reference above was opened and verified on 6 November 2026. This paper is a "
           "living artifact: rebuild it with <font face='Courier'>python3 scripts/build-paper.py</font>. "
           "Arena, levels, replays, community board and provider research: "
           "https://namandhakad712.github.io/WRYM/</i>", "caption"))

doc.build(E)
import shutil
shutil.copyfile(OUT[0], OUT[1])
print(f"whitepaper rebuilt: {OUT[0]} ({OUT[0].stat().st_size:,} bytes) + copy -> {OUT[1]}")
