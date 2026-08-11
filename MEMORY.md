# Memory index

Session memories for the MTG Deck Consistency Calculator, newest first.
Read `CLAUDE.md` first for current state and conventions.

| Date | File | Summary |
|---|---|---|
| 2026-08-11 | [build-and-deploy](memory/2026-08-11-build-and-deploy.md) | Built the whole tool: Karsten math re-derived by simulation, six analysis panels, Verge handling, dig payoffs, two-layer persistence, 152-test suite, deploy-ready repo. Found two real bugs (Verges counted as full duals; enablers double-counted) and one card-text error (United Battlefront finds *permanents* only). |

## Next intent

- [next-session-prompt](memory/next-session-prompt.md) — **pending.** Apple-style
  glassmorphism visual overhaul plus chart/component animation. Functionality frozen;
  152 tests must stay green.

## Standing facts

- **Jeff's decklist has never been loaded into the tool.** The original goal —
  tuning his custom Standard brew — is still open. It runs United Battlefront and
  Getaway Barrel; both have built-in payoff presets.
- The colour-source math is *conditional* hypergeometric, not the textbook kind.
  If a future change makes the numbers look "too high", re-read the Method tab
  before touching it — the naive model is a known trap.
- Verify card oracle text against Scryfall before implementing any card's math.
