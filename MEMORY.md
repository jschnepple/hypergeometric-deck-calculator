# Memory index

Session memories for the MTG Deck Consistency Calculator, newest first.
Read `CLAUDE.md` first for current state and conventions.

| Date | File | Summary |
|---|---|---|
| 2026-08-19 | [sideboard](memory/2026-08-19-sideboard.md) | Sideboards, named sideboard variants, and the Compare tab. A variant is a live **diff** against the maindeck, not a copy, so it follows the deck as you tune it; a stale swap marks the variant broken rather than half-applying. Found a live bug on the way — `parseList` skipped the `Sideboard` header and kept parsing, so every pasted export had its sideboard folded into the maindeck. Made `analyse()` pure to get there, which finally put the ANALYSIS section under test. The comparison separates exact figures from sampled ones, gives the sampled ones common random numbers and an explicit noise band, and refuses to invent a "best variant" score. 445 → 747 tests, plus a first-of-its-kind jsdom test that boots the real page and clicks through it. An adversarial review of the finished, all-green diff then found eight more bugs, every one of them living in the *seam* between two individually-correct functions. |
| 2026-08-12 | [goldfish](memory/2026-08-12-goldfish.md) | The opening-hand simulator. Seeded per-hand shuffles, keepability scored on the play and on the draw, drill-in with card-by-card draws and live conditional odds. Defined the on-curve probability that the tool never actually had — `P(hold) × P(lands) × P(colours\|lands)`, the last computed exactly and divided back out to avoid double-counting the land requirement. Feeding `DERIVED`'s own source counts back through it returns 0.88–0.94 flat across the grid: closed form and Monte Carlo agreeing independently. Found two real scorecard bugs (one-land hands kept 79% of the time) and four test bugs. 221 → 445 tests. |
| 2026-08-11 | [glassmorphism-overhaul](memory/2026-08-11-glassmorphism-overhaul.md) | The visual pass. Token system, three-elevation glass over a fixed bloom backdrop, motion built to survive a per-keystroke `innerHTML` rebuild, contrast solved numerically rather than by eye. Functionality untouched, 221 tests green throughout. Two findings that will bite anyone who forgets them: nested surfaces need a *dark* overlay, and CSS transitions are dead code on elements this app recreates every keystroke. |
| 2026-08-11 | [first-real-decklist](memory/2026-08-11-first-real-decklist.md) | Recovered the project into git and pushed it, then loaded Jeff's Barrel Boys brew — the first real decklist. That alone found **seven** bugs: lands counted as ramp/draw, shocklands read as tapped, split/DFC cards failing Scryfall lookup entirely, MDFC lands counted as lands, fetchlands contributing zero colour, restricted-use mana counted as unrestricted, and MDFC type lines leaking the back face. All fixed; 152 → 221 tests. |
| 2026-08-11 | [build-and-deploy](memory/2026-08-11-build-and-deploy.md) | Built the whole tool: Karsten math re-derived by simulation, six analysis panels, Verge handling, dig payoffs, two-layer persistence, 152-test suite, deploy-ready repo. Found two real bugs (Verges counted as full duals; enablers double-counted) and one card-text error (United Battlefront finds *permanents* only). |

## Next intent

Nothing queued. Mobile layout has moved up the list: the compare matrix is now the
widest thing in the app and the only part of it that has never been looked at on a
narrow screen. Other open choices: card-name autocomplete, a sample-deck gallery,
or closing a modelling gap. The goldfish added three of its own worth weighing
against the older ones — sequencing land drops so taplands cost a turn (the largest
and most valuable), a London mulligan chain with auto-bottoming, and Verge
conditional halves in the hypergeometric partition.

Older gaps still open: mana rocks and dorks uncounted, X spells reading as MV 0,
split-card pips summed.

- [plan-sideboard](memory/plan-sideboard.md) — **DONE**, session 5. Kept because the
  agreed decisions and their reasoning are still the spec for that feature.
- [plan-goldfish](memory/plan-goldfish.md) — **DONE**, session 4. Kept because the
  agreed decisions and their reasoning are still the spec for that tab.
- [next-session-prompt-glassmorphism](memory/next-session-prompt-glassmorphism.md) —
  **DONE**, session 3. See the memory above.
- [next-session-prompt](memory/next-session-prompt.md) — **SUPERSEDED.** Kept for
  history; its test count and file inventory are stale.

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
- **`render()` rebuilds every panel with `innerHTML` on every keystroke.** A CSS
  transition therefore never fires on anything it regenerates — the element the
  browser paints is always brand new and starts at its final value. Anything that
  must animate has to either persist across renders or be restored to its previous
  value and released (see the glassmorphism memory).
- **Inline `[land:XY]` tags override Scryfall entirely and discard `subtypes`,
  `verge`, `fetch`, `restriction` and `mdfcLand`.** They are an escape hatch for
  unresolvable cards, not normal practice — tagging a real land silently undoes
  the manabase fixes from session two.
- **The deck-level colour model is a THRESHOLD, not a probability.**
  `required()` vs `sourcesFor()` gives "need 18, have 14". The per-hand
  *probability* is a separate thing, added in session four and living in
  `GOLDFISH` as `onCurve`. Do not conflate them; the confusion is natural enough
  that it is what kicked off session four.
- **Goldfish probabilities read library COMPOSITION, never the shuffled order.**
  The order decides only which card Draw turns over. `libraryState()` enforces
  this structurally by subtracting known cards from the deck rather than reading
  the order's tail — keep it that way if a tutor or scry is ever added.
- **`render()` must never call `renderGoldfish`.** It rebuilds panels every
  keystroke and would wipe a drilled-in hand mid-draw. Its only goldfish job is
  `gfMarkStale()`.
- **Pure view builders belong in a testable slice.** `gfBulkHTML`/`gfDrillHTML`
  sit in `GOLDFISH` and the comparison builders in `COMPARE`, rather than in
  `RENDER`, for exactly this reason: a broken template literal does not throw, it
  renders `undefined` inside a percentage.
- **A sideboard variant is a DIFF against the maindeck, and a stale diff is
  refused, not half-applied.** `applyVariant` returns errors and the variant is
  marked broken. Half a swap gives a confident answer about a deck that does not
  exist, which is the failure mode this project keeps rediscovering.
- **Sampled figures never get coloured unless they clear their own noise band.**
  Variants are compared under common random numbers and any difference inside
  `2·√(SE₁²+SE₂²)` renders grey. Exact figures — curve, sources, land count,
  payoff odds — carry no such caveat, and the Compare tab keeps the two kinds of
  number visually distinct on purpose.
- **`extract.js` slices on banner comments, so adding a section means editing
  `SECTIONS`.** The slice *before* the new banner has to be re-pointed to end at
  it, or it silently swallows everything you just added. `SIDEBOARD` and
  `COMPARE` were added this way in session five.
- **Green is not finished — read the diff adversarially before wrapping up.**
  Session five's feature passed 703 tests including a jsdom run that clicked
  through the whole flow, and a review of the diff still found eight real bugs.
  All eight sat in the *seam* between two functions that were each individually
  correct and individually tested: one call site updated and another missed, a
  signature that summarised away what it needed to detect, a figure computed by
  one expression and applied by another. Unit tests are structurally blind to
  that class.
- **Commit before wrapping up.** Session one didn't, and session two opened with a
  recovery operation from a previous session's scratch directory.
