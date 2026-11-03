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
// TIER III — THE GAUNTLET (designed so frontier models fail
// informatively; every level interleaves ≥ 3 mechanic families under a
// tight turn budget, and most punish the greedy first move):
//   13     iron vault        — key order + crate parking + sealed exit
//   14     ratchet & frost   — ice slides into valve one-way law
//   15     cathedral of rust — crumbling geometry, one-way forever
//   16     the siphon        — crate choreography across frictionless ground
//   17     uroboros          — growth economics: eat to grow, split to fit
//   18     clockwork heart   — valves + excavation + machinery timing
//   19     the gaol          — key inventory under spike discipline
//   20     wyrm crown        — everything at once, no second chances

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
      "#..oo@#",
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
      "#..oo@.#",
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
      "#oo@...#",
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
      "#...ooo@...#",
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
      "#...oo@....#",
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
      "#..oo@.......#",
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
      "#..oo@....#",
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
      "#..oo@..*..#",
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
      "#..oo@....#",
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
      "#..oo@....#",
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
      "#..oo@......#",
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
      "#..oo@......k.#",
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
      "#.oo@_______#",
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
      "#...oo@...#",
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
      "#...oo@......#",
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
      "#..oo@.....#",
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
      "#..oo@......k#",
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
      "#...oo@..k..#",
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
      "#...oo@....k.#",
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
];

export function levelFromGridText(name: string, slug: string, text: string): LevelDef {
  return { name, slug, grid: text.split("\n").map((r) => r.replace(/\r$/, "")) };
}
