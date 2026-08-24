# Session 5 — sideboards, variants, and the Compare tab

Planned in `memory/plan-sideboard.md`, built in one session. 747 tests green
without jsdom, 800 with it.

## What shipped

A sideboard is now parsed out of the decklist, and a **variant** is a named
sideboard plan — "vs Control", "vs Aggro" — that you can switch the entire page
over to, or line up beside the maindeck in a new Compare tab.

- `SIDEBOARD` section: `splitList`, `parseDeck`, `applyVariant`, `deckLegality`
- `ANALYSIS` made pure: `readInputs` / `analyseCards` / `analyse` / `analyseVariant`
- `COMPARE` section: `variantMetrics`, `compareColumns`, `cmpRegressions`,
  the matrix and small-multiple builders, and a common-random-numbers goldfish
- UI: sideboard card with a dropdown swap editor, a variant chip bar above the
  tabs, the Compare tab, schema-2 persistence with migration
- `tests/sideboard.test.js`, `tests/analysis.test.js`, `tests/compare.test.js`,
  `tests/dom.test.js`, plus variant coverage in `persistence.test.js`

## The bug found by reading

`parseList` skips a line matching `/^(sideboard|deck|maybeboard|commander)\b/i`
and then keeps parsing. So every Moxfield or Arena export pasted into this tool
was having its sideboard folded straight into the maindeck: 75 cards analysed as
a 60-card deck, land ratio, colour requirements and curve all computed over the
wrong list. Nothing threw and nothing looked obviously wrong — the numbers were
just quietly for a deck nobody was playing.

The tell is worth remembering: *skipping a header is not the same as skipping
what follows it*. The line that made this look correct was the one that ignored
the header.

Guarded now by the first group in `sideboard.test.js`, including the sharpest
expression of it — a blue card in the sideboard used to create a blue mana
requirement in game one.

## Decisions worth keeping

**A variant is a diff, not a copy.** `{out, in, qty}` swaps against the maindeck.
The copy version is correct exactly as long as you never touch the maindeck,
which is never; and the diff is also the sentence you want to read back. The cost
is that it can go stale, and that is handled by refusing to analyse rather than
by applying half a swap. A partially applied swap produces a confident,
plausible, wrong answer — the failure mode this codebase keeps meeting.

**Making `analyse()` pure was the enabling move, and it paid for itself twice.**
It is what lets one code path serve the maindeck and every variant, and it is
what finally made the ANALYSIS section reachable by `extract.js`. That section
had never been under test, and the reason was purely that six DOM reads sat at
the top of the function.

**Broken variants return the analysis *shape*, empty.** `analyseVariant` builds
`analyseCards([],[],opts)` and stamps `broken` on it. Every render function
already returns its empty state on `total===0`, so a broken variant degrades to
"nothing to show" everywhere rather than throwing inside whichever panel happened
to be open. Cheaper than auditing eleven render functions, and more robust to the
twelfth.

**Deterministic and sampled figures are different kinds of number, and the panel
says so.** Curve, sources, land count, payoff odds: exact, every difference real.
Keep rates: Monte Carlo, and two variants at 500 hands routinely differ by a
couple of points from luck alone. So every variant is dealt from the same base
seed (common random numbers, which correlates the shuffles and cancels shared bad
luck out of the difference), and any gap inside `2·√(SE₁²+SE₂²)` is rendered grey
and labelled noise. CRN makes the true paired error smaller than that bound, so
the band is conservative — stated in the Method tab rather than silently assumed.

**No aggregate "best variant" score.** There is no defensible exchange rate
between a point of colour consistency and a point of payoff probability. The
panel names regressions instead: which plan drops a colour below what its most
demanding spell needs. That is also the actual reason the feature exists —
sideboarding breaks manabases quietly, one land or one double-pip card at a time,
and nobody checks it by hand.

**Colour direction is per metric.** `cmpTone(dir, cur, base)` with
`up`/`down`/`zero`/`none`. A single sign→colour rule would have been wrong for a
third of the rows.

**Both ends of a swap are dropdowns.** "The card coming in must be in the
sideboard" becomes true by construction instead of validated after the fact, and
typos stop being a source of broken variants at all.

**`cloneCard` is not defensive tidiness.** `produces` and `subtypes` are shared
references off the DB record, and `analyse` *reassigns* `produces` for
fetchlands. Without the clone, analysing a variant could change what the baseline
column says about the maindeck — a comparison silently corrupting the thing it
compares against.

## The test that is new in kind

`tests/dom.test.js` boots the real `index.html` in jsdom and clicks through it:
paste a list with a sideboard, make a variant, pick both ends of a swap from the
dropdowns, watch the panels change, open Compare, run the simulation, save,
reload, then delete the swapped-out card from the maindeck and check the variant
breaks visibly instead of silently.

Everything else in `tests/` slices pure logic and calls it directly, which cannot
see event wiring or element ids — a typo in `$('sbLst')` passes all of them and
breaks the page on load. This one catches that class.

It **skips itself with a message** when jsdom is absent, so `node tests/run-all.js`
still works on a clean checkout with nothing installed. The zero-dependency
promise was not worth trading away for it.

Its one wrinkle: jsdom has no `matchMedia`, which the page reads once for
`prefers-reduced-motion`, so the harness shims it in `beforeParse`. Real browsers
have it; the shim is a jsdom gap, not a code fix.

## The review round, which was the most valuable hour of the session

The feature was green — 703 tests, a jsdom run clicking through the whole flow —
and then an adversarial read of the diff found eight real bugs, none of which any
test was positioned to catch. Worth recording both the findings and *why* the
tests missed them.

1. **`analyseVariant` passed the maindeck's `unknown` list.** A variant boarding
   in an unresolved sideboard card sailed past `validateDeck` and simulated it as
   a colourless 0-drop — precisely what that check exists to stop. Missed because
   every test list resolved cleanly. Fixed with `unknownIn(r.cards)`.
2. **The printed noise band was not the test being applied.** The band was
   computed at the baseline rate and quoted once for the whole table, while
   `cmpSignificant` used each variant's own p. At 80% and 500 hands it printed
   ±5.06pp and then coloured a 5.0pp gap as a finding while greying a 5.5pp one —
   wrong in both directions. Now per cell, with the band in the tooltip.
3. **The mean-score row was coloured unconditionally.** A mean is not a
   proportion; its standard error needs the spread. `cmpSim` now carries
   `sdPlay`/`sdDraw` and the row is tested like everything else.
4. **The compare staleness signature was too weak.** It hashed total, land count
   and average mana value, so the most ordinary sideboard move there is —
   swapping one two-mana instant for another — left it unchanged and the previous
   deck's keep rates stayed on screen labelled current. Now hashes the card list,
   like `gfSig` always did.
5. **`lookup()` never resolved `SB:` lines.** One call site had been updated to
   `parseDeck` and the other had not, so MTGO-style sideboards stayed permanently
   unresolved.
6. **Duplicate entries broke quantity accounting.** `findCard` returns the first
   match, so "2 Abrade" on two lines read as two copies and a legal three-card
   swap errored. Real exports do this. `mergeEntries` now collapses them.
7. **Pre-existing four-copy violations were blamed on every variant in turn**, and
   half-filled editor rows appeared in the regression headline. Problems are
   tagged with a `kind` now, and the copy check only looks at cards the swaps
   touched.
8. **Id minting could steal a later variant's id**, silently repointing the saved
   "currently viewing" selection at a different variant — the exact failure ids
   exist to prevent. Now reserves before minting.

Plus a real one from Arena: `Companion` is printed in its own block *and* again
in the sideboard, so routing it to the sideboard reported 16 cards for a legal
deck. It is ignored now.

The pattern in all of this: the tests asserted that each function did what it was
written to do. What they could not see was the *seam* between two functions —
one call site updated and another not, a signature that summarised away the thing
it needed to detect, a band computed by one expression and applied by another.
Every one of the eight is a disagreement between two pieces of code that were
individually correct. Worth remembering next time something is green and feels
finished.

## Left undone

- Layout is still unverified by eye. jsdom does not lay out, so the compare
  matrix's behaviour when it grows wide enough to scroll is unknown, and it is
  now the widest thing in the app.
- One sideboard per build. Multiple sideboards would need a different data model
  and it is not clear anyone wants one.
- The comparison says nothing about whether a plan is *good* against a matchup.
  That is a question about gameplay and the tool has no opinion on it, which is
  stated in the Method tab rather than left to be inferred.
