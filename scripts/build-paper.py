#!/usr/bin/env python3
# ── WRYM · whitepaper builder ─────────────────────────────────────────
# Regenerates docs/whitepaper.pdf AND site/assets/whitepaper.pdf from
# the committed results/ + docs/. Pure reportlab, CJK-safe fonts not
# needed (English artifact), re-runnable any time:
#     python3 scripts/build-paper.py
from __future__ import annotations
import json, math, pathlib, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, HRFlowable, KeepTogether,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = [ROOT / "docs" / "whitepaper.pdf", ROOT / "site" / "assets" / "whitepaper.pdf"]

SOIL = colors.HexColor("#2b221a")
CREAM = colors.HexColor("#fce8d5")
CORAL = colors.HexColor("#ea6a65")
GOLD = colors.HexColor("#ffcf33")
INK = colors.HexColor("#241b12")
FAINT = colors.HexColor("#6b5545")

TIER_COLOR = {
    "TUTORIAL": colors.HexColor("#7ec46a"), "CORE": colors.HexColor("#9bd4ef"),
    "ADVANCED": colors.HexColor("#5fb8d4"), "GAUNTLET": colors.HexColor("#c98a2b"),
    "ABYSS": colors.HexColor("#b95a4e"), "NIGHTMARE": colors.HexColor("#c92b46"),
}

# ── data ────────────────────────────────────────────────────────────────
levels = json.loads((ROOT / "results" / "levels.json").read_text())
models = json.loads((ROOT / "results" / "models.json").read_text())
run_dirs = list((ROOT / "results" / "runs").iterdir())
n_runs = sum(1 for d in run_dirs for _ in d.glob("*.json"))
by_tier: dict[str, int] = {}
for l in levels:
    by_tier[l.get("tier", "?")] = by_tier.get(l.get("tier", "?"), 0) + 1
top = sorted(levels, key=lambda l: -l.get("difficulty", 0))[:8]
avg_diff = sum(l.get("difficulty", 0) for l in levels) / max(1, len(levels))
nightmare = [l for l in levels if l.get("tier") == "NIGHTMARE"]
now = datetime.date.today().isoformat()

# ── styles ──────────────────────────────────────────────────────────────
S = {
    "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=25, leading=30,
                            textColor=CREAM, alignment=TA_CENTER, spaceAfter=2),
    "subtitle": ParagraphStyle("st", fontName="Helvetica-Oblique", fontSize=11.5, leading=15,
                               textColor=colors.HexColor("#d8b995"),
                               alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=13.5, leading=17,
                         textColor=colors.HexColor("#8a4b3a"), spaceBefore=13, spaceAfter=5),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14,
                         textColor=colors.HexColor("#5a4632"), spaceBefore=9, spaceAfter=3),
    "body": ParagraphStyle("b", fontName="Helvetica", fontSize=9.6, leading=14.2,
                           textColor=INK, alignment=TA_JUSTIFY, spaceAfter=5),
    "meta": ParagraphStyle("m", fontName="Helvetica", fontSize=8.6, leading=12,
                           textColor=FAINT, alignment=TA_CENTER, spaceAfter=2),
    "cell": ParagraphStyle("c", fontName="Helvetica", fontSize=8.4, leading=11, textColor=INK),
    "cellb": ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=INK),
    "tldr": ParagraphStyle("tl", fontName="Helvetica", fontSize=9.8, leading=14.6,
                           textColor=INK, alignment=TA_JUSTIFY),
    "cite": ParagraphStyle("ci", fontName="Helvetica", fontSize=7.8, leading=10.6,
                           textColor=FAINT, alignment=TA_JUSTIFY),
}

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(SOIL)
    canvas.rect(0, 0, A4[0], 14 * mm, stroke=0, fill=1)
    canvas.setFillColor(CORAL); canvas.circle(14 * mm, 7 * mm, 2.4 * mm, stroke=0, fill=1)
    canvas.setFillColor(CREAM); canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(19 * mm, 6.2 * mm, "WRYM · The Worm Arena")
    canvas.setFont("Helvetica", 8.5)
    canvas.drawRightString(A4[0] - 14 * mm, 6.2 * mm, f"page {doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(
    str(OUT[0]), pagesize=A4,
    leftMargin=20 * mm, rightMargin=20 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
    title="WRYM: The Worm Arena — a deterministic grid-worm benchmark for language models",
    author="WRYM.LAB",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=footer)])

E = []
E.append(Spacer(1, 6))
E.append(Paragraph("WRYM · The Worm Arena", S["title"]))
E.append(Paragraph("A deterministic, WOIM-style grid-worm benchmark for language models —", S["subtitle"]))
E.append(Paragraph("certified by an exhaustive solver, archived as a static site, open to any model via MCP", S["subtitle"]))
E.append(Spacer(1, 4))
E.append(Paragraph(f"Whitepaper v3.1 · {now} · {len(levels)} certified levels · {n_runs} archived runs · ladder peak "
                   + (f"{nightmare[0]['difficulty']:.1f}/10 NIGHTMARE" if nightmare else "—"), S["meta"]))
E.append(Spacer(1, 6))
E.append(HRFlowable(width="100%", thickness=1.2, color=CORAL))
E.append(Spacer(1, 8))

# abstract
E.append(Paragraph("1 · Abstract", S["h1"]))
E.append(Paragraph(
    "We introduce WRYM, a benchmark in which language models play a deterministic grid-worm puzzle game in the "
    "design tradition of <b>WOIM</b> (Dogspawn, 2026): eat every apple, then reach the heart. Around that loop the "
    "game wraps the classic toolbox of the hardest public puzzlers — sokoban-style crate pushes, weighted plates and "
    "gates, keys and padlocks, one-way valves, crumbling bridges, diggable dirt, frictionless ice, lethal spikes — and "
    "one signature mechanic: the worm can <b>cut itself in half</b>, leaving inert remains that carry weight and block "
    "slides. Models observe the board as a text projection and emit one action per turn. Every level is certified by an "
    "exhaustive BFS solver (solvability, optimal line, state count); every recorded run is re-executed by a deterministic "
    "checker and signed. A seven-dimension, evidence-based difficulty index measures each level from its certified "
    "optimal line — depth, search width, irreversibility, simulation, threat, choreography and budget — and refuses to "
    "inflate what a level does not contain. The ladder currently spans "
    f"{len(levels)} levels across six tiers (mean difficulty {avg_diff:.1f}), topping out at "
    "The Rubicon, certified 9.0 / NIGHTMARE, engineered from primary research on Snakebird, Stephen's Sausage Roll, "
    "the Sokoban PSPACE-completeness construction, and WOIM itself. The entire archive — runs, replays, model "
    "thoughts, certificates — renders from the repository as a static GitHub Pages site with zero backend, and a "
    "browser Level Forge lets anyone contribute levels via pull request, certified by the same engine that runs CI.",
    S["body"]))

# TLDR box
tldr = Table([[Paragraph(
    "<b>TL;DR.</b> Deterministic worm puzzler, text-only observations, one action per turn. Exhaustive solver "
    "certifies every level and its par; deterministic checker signs every run; seven-dimension difficulty index "
    "scores the ladder honestly (peak: <b>9.0 NIGHTMARE</b>). Any model plugs in via OpenAI-style adapters or MCP. "
    "Runs execute locally; GitHub Pages renders everything — leaderboard, level atlas, certified replays with the "
    "model's mind alongside the board. Build levels in the browser Forge and submit them by pull request.",
    S["tldr"])]], colWidths=[doc.width])
tldr.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf3e4")),
    ("BOX", (0, 0), (-1, -1), 1.1, CORAL),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
E.append(Spacer(1, 4)); E.append(tldr)

# 2 introduction
E.append(Paragraph("2 · Why a worm game", S["h1"]))
E.append(Paragraph(
    "Grid puzzle games are a clean instrument for measuring planning in language models: fully observable, compactly "
    "serialisable state; deterministic rules without dice or timers; difficulty that is structural rather than "
    "perceptual. The worm genre adds the ingredient most benchmarks lack — <b>the agent's own body is part of the "
    "state</b>. Eating apples lengthens the worm (sometimes into a trap); the split action converts half the body into "
    "inert terrain that can hold a plate down or stop a slide. Complexity theory takes this family seriously: "
    "item-collecting Snake is PSPACE-complete (De Biasi, 2018) and Sokoban is PSPACE-complete (Culberson, 1997), so "
    "the puzzles this engine generates live in the same neighbourhood as the canonical hard planning problems — while "
    "remaining small enough to certify exhaustively.", S["body"]))

# 3 the game
E.append(Paragraph("3 · The game", S["h1"]))
E.append(Paragraph(
    "A level is a rectangular grid over a nineteen-character vocabulary. The rules, in brief: invalid moves consume "
    "no turn and return a reason (free information, exactly as the real game teaches); apples grow the worm by one "
    "segment; the heart is sealed until every apple is eaten; crates push sokoban-style onto floor, plates, bridges "
    "and valves; plates are weighted by crates, remains, or any worm segment; gates open while every plate is "
    "weighted; one-way valves may only be entered along their arrow; bridges crumble to rubble the instant they are "
    "vacated; entering ice starts a slide that continues until the head lands on grippy ground or is stopped — "
    "sliding into spikes is fatal; keys are picked up by crawling over them and consumed by padlocks; the split keeps "
    "the front half (with the head) and drops the back half as remains. Each level carries its own turn limit.",
    S["body"]))
vocab = [
    ["#", "soil wall", "impassable bedrock"],
    [".", "tunnel", "carved open floor"],
    ["@ / o", "worm head / body", "exactly one head; grows with apples"],
    ["*", "apple", "eat all to unseal the heart"],
    ["X", "heart goal", "the win tile"],
    ["$", "walnut crate", "pushable, parks on plates"],
    ["%", "floor button", "weighted by crate / remains / worm"],
    ["D", "golden gate", "open while every button is pressed"],
    ["~", "spikes", "instant death, also mid-slide"],
    ["+", "soft dirt", "diggable, permanent"],
    ["k / L", "key / padlock", "inventory + consumption"],
    ["> < ^ v", "one-way valves", "enter along the arrow only"],
    ["=", "crumble bridge", "cross once, then rubble"],
    ["_", "frictionless ice", "slide until stopped"],
]
vt = Table(
    [[Paragraph(c, S["cellb"] if ri == 0 else S["cell"]) for c in row]
     for ri, row in enumerate([["glyph", "element", "semantics"]] + vocab)],
    colWidths=[22 * mm, 42 * mm, doc.width - 64 * mm])
vt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#efe0cb")),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8c3a8")),
    ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
E.append(vt)

# 4 benchmark contract
E.append(Paragraph("4 · The benchmark contract", S["h1"]))
E.append(Paragraph(
    "An agent observes a text serialisation of the full game state plus the rule book, and emits one action per turn. "
    "Runs are scored on levels solved, moves against par, deaths, and wasted turns; pairwise Elo across models is "
    "computed per level and folded into a leaderboard. Resilience telemetry (retries, rate waits, degradation, tokens, "
    "cost) is archived per call. The local half is the repository: <code>bun scripts/run-benchmark.ts</code> executes "
    "any configured model or the exhaustive <b>wyrm-bfs</b> baseline and writes JSON artifacts. The remote half is "
    "GitHub: CI re-certifies the ladder on every push and pull request, and Pages renders the archive — leaderboard, "
    "level atlas, and a replay viewer that shows the board and the model's mind side by side, certified frame by "
    "frame. A Model Context Protocol server (<code>mcp/llm-bridge.mjs</code>) exposes the game as tools, so any "
    "MCP-capable client can play without custom integration code.", S["body"]))

# 5 difficulty index
E.append(Paragraph("5 · The difficulty index (v3)", S["h1"]))
E.append(Paragraph(
    "Difficulty is measured, not asserted. The index replays the certified optimal solution through the real engine "
    "and records evidence: plan length; BFS states explored; every permanent world mutation (digs, unlocks, valve "
    "lock-ins, burned bridges, splits); every forced ice glide; and, at every state along the line, each legal "
    "alternative probed for fatality. Seven dimensions saturate smoothly to 100 — <b>depth</b>, <b>search</b> (log "
    "scale), <b>irreversibility</b>, <b>simulation</b>, <b>threat</b>, <b>choreography</b> (sub-goal ordering load), "
    "<b>budget</b> (turn-limit pressure) — and the composite blends their weighted mean with the strongest dimension, "
    "mapping to six tiers from TUTORIAL to NIGHTMARE. The index refuses to inflate: a level with no ice can never "
    "score on simulation; no spikes, never on threat. Reaching 9.0 requires extremity in every dimension "
    "simultaneously — which is why one level in thirty-one achieves it.", S["body"]))

# 6 tier V research
E.append(Paragraph("6 · Tier V — engineering the extreme", S["h1"]))
E.append(Paragraph(
    "The five levels of the Fifth Circle were designed against primary sources rather than intuition. From "
    "<b>Snakebird</b> we took one-wrong-press unwinnability and fruit-order length contracts; from <b>Stephen's "
    "Sausage Roll</b>, chains of irreversible acts; from the <b>Sokoban PSPACE proof</b>, corridor registers — "
    "one-way commitment structures; from <b>nuworm</b>'s design essays, action at a distance; and from <b>WOIM</b> "
    "itself, the cut-yourself-in-half economy where flesh is a resource. The certified optimal lines then exhibited "
    "behaviours we did not explicitly design: in Absolute Zero and The Rubicon the worm splits mid-route so that its "
    "own inert remains become the stop-block the next ice slide requires — body-as-infrastructure emerging from the "
    "rules rather than the layout. The full dossier, with citations, ships as docs/DESIGN_RESEARCH.md.", S["body"]))

rows = [["level", "tier", "score", "par", "states", "signature"]]
for l in top:
    rows.append([
        f"{l['slug'].split('-',1)[1].replace('-',' ')}".title(),
        l.get("tier", "?"), f"{l.get('difficulty',0):.1f}",
        f"{l.get('minMoves',-1)}/{l.get('turnLimit','—')}",
        f"{l.get('statesExplored',0):,}",
        "all seven ≥ 65" if l.get("tier") == "NIGHTMARE" else "",
    ])
tt = Table([[Paragraph(c, S["cellb"] if i == 0 else S["cell"]) for c in row] for i, row in enumerate(rows)],
           colWidths=[42*mm, 24*mm, 15*mm, 18*mm, 24*mm, doc.width-123*mm])
tstyle = [
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#efe0cb")),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8c3a8")),
    ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]
for i, l in enumerate(top, start=1):
    if l.get("tier") == "NIGHTMARE":
        tstyle.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fbe4d6")))
        tstyle.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
tt.setStyle(TableStyle(tstyle))
E.append(KeepTogether([Paragraph("Top of the certified ladder:", S["h2"]), tt]))

# 7 architecture
E.append(Paragraph("7 · The fully-static archive", S["h1"]))
E.append(Paragraph(
    "The deliverable is the repository itself. Local runs write results/ as JSON; CI certifies and the export script "
    "compiles the site's data; GitHub Pages serves it with no backend, no database and no build-time secrets. The "
    "Level Forge page ships the same engine, validator and difficulty index — compiled from the identical source CI "
    "runs — so a level that certifies in a contributor's browser is, by construction, the level CI will certify. "
    "Submitted levels arrive as pull requests to community-levels/, are certified by the verify job, and upon merge "
    "join the public ladder automatically. Reproducibility is not a property of the artefact; it is the user "
    "interface.", S["body"]))

# 8 results snapshot
E.append(Paragraph("8 · Snapshot", S["h1"]))
snap = [
    ["certified levels", str(len(levels))],
    ["tier spread", " · ".join(f"{k} {v}" for k, v in sorted(by_tier.items(), key=lambda kv: -[
        "NIGHTMARE","ABYSS","GAUNTLET","ADVANCED","CORE","TUTORIAL"].index(kv[0]) if kv[0] in [
        "NIGHTMARE","ABYSS","GAUNTLET","ADVANCED","CORE","TUTORIAL"] else 9))],
    ["archived runs (current export)", str(n_runs)],
    ["configured models", str(len([m for m in models if m.get("enabled", True)])) + " (incl. any-model-via-MCP)"],
    ["ladder peak", (f"{nightmare[0]['difficulty']:.1f} / NIGHTMARE — {nightmare[0]['slug']}" if nightmare else "—")],
    ["mean difficulty", f"{avg_diff:.1f} / 10"],
]
st = Table([[Paragraph(a, S["cellb"]), Paragraph(b, S["cell"])] for a, b in snap],
           colWidths=[52 * mm, doc.width - 52 * mm])
st.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8c3a8")),
    ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
E.append(st)

# 9 references
E.append(Paragraph("9 · References", S["h1"]))
E.append(Paragraph(
    "Culberson, J. (1997). Sokoban is PSPACE-complete. &nbsp;·&nbsp; "
    "De Biasi, M. (2018). The complexity of snake and undirected NCL variants. Theoretical Computer Science. &nbsp;·&nbsp; "
    "Hearn, R. &amp; Demaine, E. (2002). PSPACE-completeness of sliding-block puzzles. arXiv:cs/0205005. &nbsp;·&nbsp; "
    "Dogspawn (2026). WOIM. store.steampowered.com/app/4272020. &nbsp;·&nbsp; "
    "Noumenon Games (2015). Snakebird. &nbsp;·&nbsp; "
    "increpare (2016). Stephen's Sausage Roll. &nbsp;·&nbsp; "
    "noa (2023). Journey to nuworm. cubestudio.itch.io/nuworm. &nbsp;·&nbsp; "
    "Icely Puzzles (2026). Would You Love Me If I Was a Snake? store.steampowered.com/app/4284670.",
    S["cite"]))

doc.build(E)

import shutil
OUT[0].parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(OUT[0], OUT[1])
print(f"built {OUT[0]} ({OUT[0].stat().st_size:,} bytes) → copied to {OUT[1]}")
