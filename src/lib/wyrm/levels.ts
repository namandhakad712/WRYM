// ── WYRM.LAB · handcrafted original levels (difficulty ladder v2) ────
// 100% original layouts designed for this engine.
// Legend: # wall · . floor · @ head · o body · * apple · $ crate
//         % plate · D door · X exit · ~ spikes · + dirt
//         > < ^ v one-way valve · = crumble bridge · _ ice · k key · L lock
// Initial worm: horizontal, head at the right end, facing right.
//
// LADDER (validator-certified difficulty / 10):
//   01-06  classic families  — movement, crates, plates, split, spikes
//   07     keys              — inventory bookkeeping
//   08     ice               — forced multi-cell simulation
//   09     valves            — irreversible routing
//   10     bridges           — consumable geometry
//   11     ice + machinery   — compound planning
//   12     everything        — the model-killer trial
//
// TIER III — THE GAUNTLET (validator-certified):
//   13     iron vault        — key order + crate parking + sealed exit
//   14     ratchet & frost   — ice slides into valve one-way law
//   15     cathedral of rust — crumbling geometry, one-way forever
//   16     the siphon        — crate choreography across frictionless ground
//   17     uroboros          — growth economics: eat to grow, split to fit
//   18     clockwork heart   — valves + excavation + machinery timing
//   19     the gaol          — key inventory under spike discipline
//   20     wyrm crown        — everything at once, no second chances
//
// TIER IV — THE ABYSS (difficulty index v3, evidence-based):
//   21     serpent's choir   — THREAT: spike lanes, one-way gaps (7.5)
//   22     glass foundry     — SIMULATION: ice field, valve dive (8.1 ABYSS)
//   23     the incinerator   — IRREVERSIBILITY: dig/burn/valve chain (5.9)
//   24     cathedral of lead — CHOREOGRAPHY: crate ferry + plate run (7.7)
//   25     ouroboros rex     — SPLIT ECONOMICS: flesh for plates (7.0)
//   26     wyrm genocide     — THE END: every family at once (7.3)
//
// TIER V — THE FIFTH CIRCLE (2026-11 research sprint):
//   27     the reliquary     — flesh-economy cathedral (7.9)
//   28     salamis           — one-sweep spike lattice (6.3, purity)
//   29     absolute zero     — remains-as-stoppers ice rink (8.2)
//   30     six seals         — six permanent acts, one line (7.8)
//   31     the rubicon       — THE FLAGSHIP: certified NIGHTMARE 9.0
// NOTE (engine v3): the worm parser once silently dropped one body
// segment on `oo@` layouts; that bug is fixed. Levels 01–20 keep their
// original 2-segment starts (`.o@`) so every archived run still
// replays byte-identically; Tier IV uses full 3-segment starts.

import { LevelDef } from "./types";

export const HANDCRAFTED_LEVELS: LevelDef[] = [
  {
    name: "First Crawl",
    slug: "01-first-crawl",
    grid: [
      "#######",
      "#..*..#",
      "#.....#",
      "#..X..#",
      "#...o@#",
      "#.....#",
      "#######",
    ],
  },
  {
    name: "Crate & Gate",
    slug: "02-crate-gate",
    grid: [
      "########",
      "#..*...#",
      "#...o@.#",
      "#......#",
      "#..$...#",
      "#..%.D.#",
      "#.....X#",
      "########",
    ],
  },
  {
    name: "Thorn Run",
    slug: "03-thorn-run",
    grid: [
      "########",
      "#.o@...#",
      "#~..~..#",
      "#.*..*.#",
      "#~..~..#",
      "#..##..#",
      "#...X..#",
      "########",
    ],
  },
  {
    name: "Self Service",
    slug: "04-self-service",
    grid: [
      "############",
      "#.....o@...#",
      "#..........#",
      "#####.######",
      "#####%######",
      "#..........#",
      "##########D#",
      "##########X#",
      "############",
    ],
  },
  {
    name: "Growth Spurt",
    slug: "05-growth-spurt",
    grid: [
      "##########",
      "#..o@.*..#",
      "#........#",
      "####%%####",
      "#.$......#",
      "#....*...#",
      "#####D####",
      "#####X####",
      "##########",
    ],
  },
  {
    name: "The Gauntlet",
    slug: "06-gauntlet",
    grid: [
      "############",
      "#....o@....#",
      "#.*......~.#",
      "####.####..#",
      "#..$#%%%#..#",
      "#...#...#..#",
      "#.........D#",
      "#.........X#",
      "#~~~~~~~~~~#",
      "############",
    ],
  },

  // ── Tier II · advanced families ──────────────────────────────────
  {
    name: "Key Note",
    slug: "07-key-note",
    grid: [
      "##############",
      "#............#",
      "#...o@.......#",
      "#............#",
      "#...........k#",
      "#............#",
      "######L#######",
      "#............#",
      "#..*.....*...#",
      "#............#",
      "#.....X......#",
      "##############",
    ],
    turnLimit: 70,
  },
  {
    name: "Slippery Slope",
    slug: "08-slippery-slope",
    grid: [
      "###########",
      "#.........#",
      "#...o@....#",
      "#.........#",
      "#.______.*#",
      "#.........#",
      "#.*......X#",
      "#.........#",
      "###########",
    ],
    turnLimit: 70,
  },
  {
    name: "No Return",
    slug: "09-no-return",
    grid: [
      "############",
      "#..*.......#",
      "#...o@..*..#",
      "#..........#",
      "####v###v###",
      "#..........#",
      "#.*......~.#",
      "#..........#",
      "#######v####",
      "#....*.....#",
      "#..........#",
      "#####X######",
      "############",
    ],
    turnLimit: 90,
  },
  {
    name: "Burnt Bridges",
    slug: "10-burnt-bridges",
    grid: [
      "###########",
      "#..*...*..#",
      "#...o@....#",
      "#.........#",
      "#..==..==.#",
      "#.........#",
      "#..*....*.#",
      "#####==####",
      "#....X....#",
      "###########",
    ],
    turnLimit: 80,
  },
  {
    name: "Cold Ledger",
    slug: "11-cold-ledger",
    grid: [
      "###########",
      "#.........#",
      "#...o@....#",
      "#.........#",
      "#.__%%_...#",
      "#.........#",
      "#..$..*...#",
      "#.........#",
      "####D######",
      "#....X....#",
      "###########",
    ],
    turnLimit: 90,
  },
  {
    name: "WYRM Trial",
    slug: "12-wyrm-trial",
    grid: [
      "#############",
      "#..*.....*..#",
      "#...o@......#",
      "#...........#",
      "####v##v#####",
      "#...........#",
      "#...______k.#",
      "#...........#",
      "####L##v#####",
      "#...........#",
      "#..*.....~..#",
      "####===#==###",
      "#..........X#",
      "#############",
    ],
    turnLimit: 100,
  },

  // ── Tier III · THE GAUNTLET — interlocked mechanics, tight budgets ─
  {
    // Key opens the lock to the middle hall; the crate must be PARKED
    // on the plate to unseal the door vault; dirt offers a tempting
    // dig, spikes guard the plate column. Greedy agents die or strand.
    name: "Iron Vault",
    slug: "13-iron-vault",
    grid: [
      "###############",
      "#...o@......k.#",
      "#.............#",
      "#######L#######",
      "#.....+....~..#",
      "#..$.......%..#",
      "#.....*.......#",
      "#####D#########",
      "#..........X###",
      "###############",
    ],
    turnLimit: 64,
  },
  {
    // Ice everywhere: the opening lane is a full slide. Valves only
    // let you descend; the crate rides DOWN over a valve platform
    // onto its plate. Apples sit beside slide lanes — eat and overshoot.
    name: "Ratchet & Frost",
    slug: "14-ratchet-frost",
    grid: [
      "#############",
      "#..*....*...#",
      "#..o@_______#",
      "#...........#",
      "####v###v####",
      "#.___...___*#",
      "#...........#",
      "#####v#######",
      "#.*..$.__...#",
      "#...........#",
      "#####%#D#####",
      "#######X#####",
      "#############",
    ],
    turnLimit: 72,
  },
  {
    // Every bridge is one-way FOREVER. The side bridges are traps that
    // crumble behind you; only the marked spine crossings survive the
    // whole route down to the burrow.
    name: "Cathedral of Rust",
    slug: "15-cathedral-rust",
    grid: [
      "###########",
      "#....o@...#",
      "#..*....*.#",
      "####==#####",
      "#.........#",
      "#..+..~~..#",
      "#.........#",
      "####=######",
      "#....*....#",
      "#.........#",
      "####=######",
      "####X######",
      "###########",
    ],
    turnLimit: 70,
  },
  {
    // Split economics: the door needs BOTH plates weighted, but only
    // one crate exists. The worm must shed its own mass onto the far
    // plate — twice — then slither through as a single segment.
    name: "The Siphon",
    slug: "16-the-siphon",
    grid: [
      "##############",
      "#....o@......#",
      "#....*.......#",
      "#..$.....*...#",
      "#....__......#",
      "#....__......#",
      "#............#",
      "####%#D#%#####",
      "#............#",
      "##########X###",
      "##############",
    ],
    turnLimit: 80,
  },
  {
    // Eat everything, grow huge — then split down to a 2-segment
    // worm so the remains can hold a plate while a 2-long body fits
    // the door. The vault bridge crumbles the instant you cross it.
    name: "Uroboros",
    slug: "17-uroboros",
    grid: [
      "############",
      "#...o@.....#",
      "#..*...*...#",
      "#..........#",
      "#...*..*...#",
      "#..%.$.%...#",
      "#####D######",
      "#..........#",
      "#####==#####",
      "#....X.....#",
      "############",
    ],
    turnLimit: 84,
  },
  {
    // One-way valves route the worm: descend only through the 'v',
    // the '<' forbids the return. The crate rides the valve column
    // down onto its plate; spikes flank the burrow vault.
    name: "Clockwork Heart",
    slug: "18-clockwork-heart",
    grid: [
      "##############",
      "#...o@......k#",
      "#.....L......#",
      "######v#######",
      "#...$....%*..#",
      "#............#",
      "#.>......%...#",
      "#............#",
      "#########D####",
      "#......~.X~..#",
      "##############",
    ],
    turnLimit: 70,
  },
  {
    // Two keys, two locks, both mandatory; the far plate is only
    // weighted by the worm's own severed mass, and the door vault
    // is a one-way tube. Inventory order is the whole level.
    name: "The Gaol",
    slug: "19-the-gaol",
    grid: [
      "#############",
      "#....o@..k..#",
      "#...........#",
      "######L######",
      "#..*.....~..#",
      "#...........#",
      "#....%......#",
      "#########D###",
      "#........X..#",
      "#############",
    ],
    turnLimit: 64,
  },
  {
    // THE CROWN. Lock descent, ice lanes, a crate ride over two
    // rows, a plate-door, a one-way bridge span whose first landing
    // is spiked, and a valve mouth into the burrow. Every family fires;
    // every greedy line ends in the dirt.
    name: "WYRM Crown",
    slug: "20-wyrm-crown",
    grid: [
      "##############",
      "#....o@....k.#",
      "#............#",
      "#####L########",
      "#...____...*.#",
      "#............#",
      "#..*..$......#",
      "#..%.........#",
      "#####D########",
      "#............#",
      "#.....====...#",
      "#......~....*#",
      "#########v####",
      "#########X####",
      "##############",
    ],
    turnLimit: 100,
  },

  // ── Tier IV · THE ABYSS — honestly measured (difficulty index v3:
  // seven evidence-based dimensions; see lib/wyrm/difficulty.ts).
  // The old ladder tops out at 5.6 honest; these run 5.9 → 8.1 and
  // every one punishes the greedy first move.
  {
    // THREAT specialist: spike-hemmed lanes, one-way valve gaps, a
    // bridge that burns behind you. Descending before eating the
    // row-1 apple strands you — the choir only sings downward.
    name: "Serpent's Choir",
    slug: "21-serpents-choir",
    grid: [
      "#########",
      "#oo@..*.#",
      "#~~v~v~~#",
      "#.*.....#",
      "#~=~~v~~#",
      "#...*...#",
      "#~~v~~~~#",
      "#......X#",
      "#########",
    ],
    turnLimit: 24,
  },
  {
    // SIMULATION specialist (ABYSS): a frictionless foundry floor,
    // island apples, spike stop-cells, and a one-way valve dive that
    // commits you to the exit run. Two spare turns. Total.
    name: "Glass Foundry",
    slug: "22-glass-foundry",
    grid: [
      "##############",
      "#...o@..*....#",
      "#__~~__~____v#",
      "#....*.......#",
      "#~___~___~___#",
      "#_~_*____~___#",
      "#___~____~__v#",
      "############X#",
      "##############",
    ],
    turnLimit: 20,
  },
  {
    // IRREVERSIBILITY specialist: dig the bulkhead, burn the bridge,
    // slide the cooling vent, valve down, dig again, burn the last
    // bridge. Five permanent acts on a 23-move line — 3 spare turns.
    name: "The Incinerator",
    slug: "23-the-incinerator",
    grid: [
      "#############",
      "#..oo@...*..#",
      "#########+###",
      "#.*.........#",
      "#~==~####~.~#",
      "#__*__.___~_#",
      "######v######",
      "#....~.~....#",
      "#.....*~~.~~#",
      "######+=X####",
      "#############",
    ],
    turnLimit: 26,
  },
  {
    // CHOREOGRAPHY specialist: key, lock, a crate ferry onto one plate,
    // your own tail (or a severed half) on the other, an ice-slot
    // descent, and a door run with three spare turns out of 65.
    name: "Cathedral of Lead",
    slug: "24-cathedral-of-lead",
    grid: [
      "#############",
      "#..oo@...k..#",
      "#..*........#",
      "#####L#######",
      "#..*.$...~*.#",
      "#...........#",
      "#~~%~~.~~~_~#",
      "#.........%.#",
      "#####D#######",
      "#.~.~.....X.#",
      "#############",
    ],
    turnLimit: 65,
  },
  {
    // SPLIT ECONOMICS: grow to six on the top row, then sever yourself
    // onto BOTH plates — the door at the far left opens only for a worm
    // that has paid in flesh. Spike fangs under the first apple.
    name: "Ouroboros Rex",
    slug: "25-ouroboros-rex",
    grid: [
      "#############",
      "#..oo@.*.*..#",
      "#######~###*#",
      "###########.#",
      "###########.#",
      "#D...%...%..#",
      "#X###~###~###",
      "#############",
    ],
    turnLimit: 27,
  },
  {
    // THE END. Key, lock, an ice hall with a spike under the key-drop,
    // a valve commit, a crate ferry across burning bridges onto the
    // plate-door, a dig, and a spiked final approach. Every family
    // fires at once — one long committed descent.
    name: "WYRM Genocide",
    slug: "26-wyrm-genocide",
    grid: [
      "###############",
      "#..oo@....k...#",
      "#~.....~...~..#",
      "###L###########",
      "#..*______*...#",
      "#.........~..v#",
      "#%.==....$....#",
      "#D#############",
      "#*+.........*~#",
      "#......~.....X#",
      "###############",
    ],
    turnLimit: 54,
  },

  // ── Tier V · THE FIFTH CIRCLE ─────────────────────────────────────
  // Designed from primary research on the hardest public grid puzzlers:
  // WOIM (Dogspawn, 2026 — self-cutting as a resource), Snakebird
  // (one wrong press = unwinnable; fruit-order length contracts),
  // Stephen's Sausage Roll (irreversible act chains), Sokoban
  // (PSPACE-complete corridor commitment, Culberson 1997), and
  // "Would You Love Me If I Was a Snake?" (your body is the tool).
  // Difficulty index v3 certifies every score below.

  {
    // CHOREOGRAPHY cathedral: pay in flesh to open the reliquary —
    // push the crate onto its plate, sever your back half onto the
    // second, then thread a one-way bridge gauntlet under spikes.
    // A 1-high farm row teaches the hardest Snakebird lesson first:
    // a worm can never turn around.
    name: "The Reliquary",
    slug: "27-the-reliquary",
    grid: [
      "#############",
      "#..oo@.*.*.k#",
      "###########L#",
      "#.......*...#",
      "#.....$%....#",
      "#.....%.....#",
      "########D####",
      "#*<==^~..*..#",
      "#v###____.__#",
      "#_____X..~..#",
      "#############",
    ],
    turnLimit: 32,
  },
  {
    // THREAT purity: a one-sweep lattice. Every row is a single pass
    // through a spike comb; every descent is a one-way valve. There is
    // no turning back and no second apple run — the order you eat in
    // IS the puzzle. (Snakebird's "plan the whole line before you move".)
    name: "Salamis",
    slug: "28-salamis",
    grid: [
      "###########",
      "#oo@...*..#",
      "#~#~#~#~#v#",
      "#....*.*..#",
      "#v#~#~#~#~#",
      "#....*....#",
      "#~#~#~#~#v#",
      "#.........#",
      "#v#~#~#~#~#",
      "#.........#",
      "#~#~#~#~#v#",
      "#.....X..*#",
      "###########",
    ],
    turnLimit: 54,
  },
  {
    // SIMULATION abyss: a frictionless relic field where your own
    // severed halves become the stop-blocks your slides need. The lock
    // on the descent line doubles as a wall until you hold the key.
    // Two splits, nine glides, thirty-five forced cells — every entry
    // vector is a commitment.
    name: "Absolute Zero",
    slug: "29-absolute-zero",
    grid: [
      "###############",
      "#o@___________#",
      "#_*_____~____*#",
      "#_~~__~____~__#",
      "#_____*____k__#",
      "#~_____~______#",
      "#______*______#",
      "#___~_____~___#",
      "#____~L_______#",
      "#______~______#",
      "######v########",
      "#....~.X.~....#",
      "###############",
    ],
    turnLimit: 21,
  },
  {
    // PRECISION shaft: six permanent seals on one committed line —
    // dig, key, lock, valve, split, dig again. The door at the bottom
    // opens only for a worm that has left its back half on the plate
    // above; drape-tricks are geometrically impossible.
    name: "Six Seals",
    slug: "30-six-seals",
    grid: [
      "#############",
      "#oo@*.......#",
      "#####~+######",
      "#*____k_____#",
      "#L###########",
      "#..*...~#####",
      "######%######",
      "######v######",
      "######.######",
      "#####~.~#####",
      "#####~.######",
      "######.######",
      "######.######",
      "######D######",
      "#~....*.==X.#",
      "#############",
    ],
    turnLimit: 29,
  },
  {
    // THE FLAGSHIP. Everything the engine knows, interlocked, with a
    // 38-move optimal line and two turns of slack. The rink demands
    // your own remains as slide-stoppers; the chamber demands you
    // re-grow and pay five bridges to reach the plate; the exit run
    // demands a final dig under spikes. Certified NIGHTMARE 9.0 —
    // the only level in the ladder that requires it.
    name: "The Rubicon",
    slug: "31-the-rubicon",
    grid: [
      "###############",
      "#o@___________#",
      "#_*_____~____*#",
      "#_~~__~____~__#",
      "#_____*____k__#",
      "#~_____~______#",
      "#______*______#",
      "#___~_____~~~_#",
      "#____~L_______#",
      "#______~______#",
      "######v#~#~####",
      "#....~=====%..#",
      "####~#~#~#~##D#",
      "#..X........+.#",
      "###############",
    ],
    turnLimit: 40,
  },

  // ── Tier VI · THE HATCHERY (engine v4 — eggs, difficulty index v4) ─
  // Primary research: WOIM's official mechanic list ("carrying eggs",
  // "egg cracking" — Steam, dogspawn) and Kotaku's review ("super-
  // difficult… the worm must be long enough to touch a switch AND go
  // through the gate it opens"). Design grammar, none of it decoration:
  //   · FORBIDDEN ZONE — an egg's support (the cell directly beneath
  //     it) is dirt/crate/bridge you must NOT dig, push or burn; the
  //     greedy route dies on move one.
  //   · DIG-CARRY-SPLIT — tunnel through the egg's own pillar: the head
  //     digs the support, the egg rides your back while the body
  //     conveys through, and a split parks it on remains forever. The
  //     worm must be LONG enough (growth first — Snakebird economics).
  //   · PUSH-CARRY-SPLIT — the pedestal crate is pushed out from under
  //     the egg while your head lands beneath; the crate is then free
  //     to serve a plate. Exactly N pushes then split — one more and
  //     the tail vacates the support: crack.
  //   · BRIDGE CUSTODY — an egg resting on a crumble bridge: cross it
  //     and the span dies behind you unless a severed half is left
  //     standing on it — one split holds bridge AND egg.
  //   · LIVING WIRE — Kotaku's WOIM lesson: be long enough to hold the
  //     plate AND walk through the door AND keep the egg aloft, all on
  //     one unbroken body, and win before the circuit breaks.
  // Hardness is measured in MINIMAL TURNS (par) with razor budgets:
  // every level below ships turnLimit ≈ par + 2..4.

  {
    // THE GATEKEEPER. One dirt pillar joins the two chambers; the egg
    // sits on it. The only way across is to dig the pillar FROM UNDER
    // the egg, convey it along your back, and sever a half as the
    // pedestal. Growth first: a 3-segment worm cannot leave a remain
    // in the support cell. The tunnel closes behind you — remains
    // block it forever — so everything on the near side must be done
    // before you commit.
    name: "Nestvakt",
    slug: "32-nestvakt",
    grid: [
      "#############",
      "#..oo@..#...#",
      "#.*.....O.*.#",
      "#.......+...#",
      "#.......#...#",
      "#....######X#",
      "#############",
    ],
    turnLimit: 22,
  },
  {
    // THE PEDESTAL. The crate under the egg is also the only weight
    // that opens the door. Push it out from beneath the egg (your head
    // lands under it), convey custody along your body, split after
    // EXACTLY four pushes — a fifth slides your tail off the support
    // and the egg dies — with the crate parked on the plate. Greedy
    // pushing is a trap; counting is the puzzle.
    name: "The Pedestal",
    slug: "33-the-pedestal",
    grid: [
      "#############",
      "#..oo@...*.*#",
      "######O####.#",
      "#%....$.....#",
      "##D##########",
      "#X..........#",
      "#############",
    ],
    turnLimit: 24,
  },
  {
    // BRIDGE CUSTODY in its pure form. The egg rests on the only
    // bridge between you and the exit. Cross it and the span dies
    // behind you — with the egg on it — unless you sever yourself so
    // a half stays standing on the span. One split, two jobs: the
    // remain holds the bridge AND parks the egg. The spike fangs the
    // shortcut through the apple row.
    name: "Bridge of Glass",
    slug: "34-bridge-of-glass",
    grid: [
      "############",
      "#.oo@..#...#",
      "#.*..~.O...#",
      "#......=...#",
      "#......#...#",
      "#......#..X#",
      "############",
    ],
    turnLimit: 19,
  },
  {
    // THE LIVING WIRE. Kotaku's WOIM lesson, weaponised: the worm
    // must be long enough to hold the plate AND carry the egg AND
    // walk through the door it opens — one unbroken body, one
    // circuit, no split at all. Push the pedestal crate twice, keep
    // crawling, and win with the current still flowing through you.
    name: "Precious Cargo",
    slug: "35-precious-cargo",
    grid: [
      "###############",
      "#..oo@........#",
      "#####.#########",
      "#....*........#",
      "#....*.~.~.O..#",
      "#.........%$..#",
      "############D##",
      "############X##",
      "###############",
    ],
    turnLimit: 15,
  },
  {
    // THE VAULT. The egg's pillar is the only way in; the only way
    // OUT is the lock, and the key is on the far side. Dig-carry-
    // split to enter (the tunnel seals behind you), take the key,
    // commit down the one-way valve, spend the key on the lock — and
    // the exit was behind you all along.
    name: "Ovum Vault",
    slug: "36-ovum-vault",
    grid: [
      "#############",
      "#..oo@..#...#",
      "#.*.....O.k.#",
      "#.......+...#",
      "##########v##",
      "#..*....L...#",
      "#..X....#####",
      "#############",
    ],
    turnLimit: 30,
  },
  {
    // COLD BROOD. The rink again — but this time what you carry is
    // not a stopper, it is a life. The egg's dirt island interrupts
    // the only clean slide; dig it and the egg rides a body handed
    // from segment to segment down a shaft with ice on every side,
    // and the split that parks it must happen mid-descent. The bottom
    // row is a two-apple sweep you must plan BEFORE the shaft,
    // because there is no way back up.
    name: "Cold Brood",
    slug: "37-cold-brood",
    grid: [
      "#############",
      "#..oo@.*.*..#",
      "##########.##",
      "#.......O...#",
      "#_______+___#",
      "########.####",
      "########.####",
      "########.####",
      "#..*...X...*#",
      "#############",
    ],
    turnLimit: 35,
  },
  {
    // THE HATCHERY — THE NEW FLAGSHIP. Two eggs, two custodies, one
    // line: grow on the farm, dig the only seam, valve-commit into
    // the vault, push the pedestal crate onto the plate while the egg
    // rides your back, split to park it, thread the open door, and
    // cross the span where the second egg dies with its bridge unless
    // a severed half is left standing on it. Par sits in the thirties
    // with two turns of slack — everything Tier VI taught, chained.
    name: "The Hatchery",
    slug: "38-the-hatchery",
    grid: [
      "################",
      "#..oo@>*.*...###",
      "############.###",
      "############+###",
      "####...<...Ov.~#",
      "####.##%...$..~#",
      "####D###########",
      "#~...###########",
      "#.*..>..O#######",
      "######~.=....###",
      "###########~X###",
      "################",
    ],
    turnLimit: 42,
  },

  // ═══ TIER VII · THE CUSTODY LADDER (v4.1, human-arena sprint) ═════
  // Four egg-custody levels where the egg is not decoration — it is
  // the puzzle. Gravity is south; dirt, bridges, locks, crates,
  // remains, other eggs and your own spine are the only things that
  // hold an egg up. Dig the support and the egg rides your head;
  // leave the cell and it drops. Every level below was hand-traced
  // then BFS-certified: the optimum is short, but each turn is an
  // irreversible commitment — exactly the minimal-turn discipline
  // the frontier models choke on.

  {
    // custody 101: the dirt column under the egg is the ONLY way into
    // the exit shaft. dig it and the egg rides your head — you must
    // already be long enough that a segment is still under the egg
    // when your head lands on the heart.
    name: "Vigil of Glass",
    slug: "39-vigil-of-glass",
    grid: [
      "############",
      "#..oo@...O.#",
      "#..*.....+.#",
      "####.####.##",
      "#~..v..~.X.#",
      "#.___*.....#",
      "############",
    ],
    turnLimit: 26,
  },
  {
    // the key turns the lock beneath the first egg — opening the door
    // is safe only with four segments of spine. one short, and the
    // egg rides down with the falling lock dust. the split is real:
    // only a severed half keeps custody while the head hunts.
    name: "The Turnkey Nest",
    slug: "40-the-turnkey-nest",
    grid: [
      "#############",
      "#..oo@.O....#",
      "#k*..*.L..*.#",
      "####v####v###",
      "#__..~~..X..#",
      "#############",
    ],
    turnLimit: 24,
  },
  {
    // double custody: two eggs, two dig columns, one spine. the second
    // dirt must be breached before the tail leaves the first — and the
    // apple beyond the eggs must be eaten MID-CUSTODY to extend the
    // spine that carries both to the heart embedded in the wall.
    name: "Ossuary Bloom",
    slug: "41-ossuary-bloom",
    grid: [
      "##############",
      "#..oo@.O.O...#",
      "#.*....+.+*..#",
      "####.#####X###",
      "#~..~~..~~...#",
      "##############",
    ],
    turnLimit: 22,
  },
  {
    // the ledger closes: egg one sleeps on a lock, egg two on dirt.
    // key run first, unlock under custody, dig under custody, eat the
    // fourth apple to grow the spine to six — then straight down the
    // valve shaft. twenty-one turns, three of them slack. the
    // cleanest no-waste line in the ladder.
    name: "The Brood Ledger",
    slug: "42-the-brood-ledger",
    grid: [
      "#############",
      "#*.oo@.O.O..#",
      "#k*..*.L.+*.#",
      "####v#####v##",
      "#__..~~...X.#",
      "#############",
    ],
    turnLimit: 21,
  },
];

export function levelFromGridText(name: string, slug: string, text: string): LevelDef {
  return { name, slug, grid: text.split("\n").map((r) => r.replace(/\r$/, "")) };
}
