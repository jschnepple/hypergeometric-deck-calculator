# Memory index

Session memories for the MTG Deck Consistency Calculator, newest first.
Read `CLAUDE.md` first for current state and conventions.

| Date | File | Summary |
|---|---|---|
| 2026-08-11 | [first-real-decklist](memory/2026-08-11-first-real-decklist.md) | Recovered the project into git and pushed it, then loaded Jeff's Barrel Boys brew — the first real decklist. That alone found **seven** bugs: lands counted as ramp/draw, shocklands read as tapped, split/DFC cards failing Scryfall lookup entirely, MDFC lands counted as lands, fetchlands contributing zero colour, restricted-use mana counted as unrestricted, and MDFC type lines leaking the back face. All fixed; 152 → 221 tests. |
| 2026-08-11 | [build-and-deploy](memory/2026-08-11-build-and-deploy.md) | Built the whole tool: Karsten math re-derived by simulation, six analysis panels, Verge handling, dig payoffs, two-layer persistence, 152-test suite, deploy-ready repo. Found two real bugs (Verges counted as full duals; enablers double-counted) and one card-text error (United Battlefront finds *permanents* only). |

## Next intent

- [next-session-prompt-glassmorphism](memory/next-session-prompt-glassmorphism.md) —
  **pending.** Apple-grade glassmorphism visual overhaul: glass material system,
  animated charts, premium component states. Functionality frozen; 221 tests must
  stay green and the banner comments must survive.
- [next-session-prompt](memory/next-session-prompt.md) — **SUPERSEDED** by the
  above. Kept for history; its test count and file inventory are stale.

## Standing facts

- The colour-source math is *conditional* hypergeometric, not the textbook kind.
  If a future change makes the numbers look "too high", re-read the Method tab
  before touching it — the naive model is a known trap.
- **Verify card oracle text against Scryfall before implementing any card's math.**
  Nine of the eleven bugs across both sessions came from trusting a plausible
  assumption about a card or about Scryfall's data shape.
- **Scryfall's data lies by omission in three specific ways**, all now handled and
  all worth remembering before adding a fourth: `produced_mana` lists conditional
  and restricted colours as if unconditional; fetchlands have no `produced_mana`
  at all; and `type_line` on a double-faced card concatenates both faces, so any
  regex against it matches the back face too.
- The `SCRYFALL` section can't be reached by `tests/extract.js`. Logic that needs
  a regression test belongs in `PARSING`.
- **Commit before wrapping up.** Session one didn't, and session two opened with a
  recovery operation from a previous session's scratch directory.
