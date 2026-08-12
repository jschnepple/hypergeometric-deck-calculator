# MTG Deck Consistency Calculator — working notes

## What this is

A single-file browser tool for tuning Magic: The Gathering decklists using Frank
Karsten's mana math. Jeff's own use case is a custom Standard brew; the tool is
built generically so anyone can use it.

**Live:** GitHub Pages (public repo, `main` / root).

## Architecture — and why it stays this way

**One HTML file.** No npm, no framework, no build step, no server, no CDN
dependencies. `index.html` is the entire application. This was a deliberate call,
revisited in the 2026-08-11 session: a build toolchain buys nothing for a tool one
person opens by double-clicking, and single-file means it works offline, deploys
by drag-and-drop, and can be emailed to a friend.

Revisit this only if live cross-device sync or a shared deck database is wanted.

The only runtime network call is the Scryfall API, on demand, when the user clicks
"Look up costs". Results cache to localStorage so the tool works offline after.

## Layout

```
index.html          the whole app (~70KB)
README.md           user-facing docs + deploy steps
.nojekyll           stops GitHub Pages running Jekyll
tests/              node test suite, no dependencies
  run-all.js        entry point:  node tests/run-all.js
  extract.js        pulls sections out of index.html
  harness.js        tiny assertion helpers
  *.test.js         one file per concern
decks/              real decklists + their written analyses
research/mana-engine/  Python Monte Carlo that derived the conditional
                    Karsten table. Not runtime code — this is the provenance
                    of the numbers in MATH CORE. Do not delete.
memory/             session memories
MEMORY.md           index of memories
```

`index.html` is organised by banner comments (`MATH CORE`, `PARSING`, `ANALYSIS`,
`DIG PAYOFFS`, `GOLDFISH`, `RENDER`, `PERSISTENCE`, `SCRYFALL`, `WIRING`). **The
tests slice on those banners** — rename one and `tests/extract.js` will fail loudly
with the banner name. That is intentional. Adding a banner means editing
`SECTIONS`: the slice before it must be re-pointed to end at the new name, or it
silently swallows everything you just added.

## Testing

```bash
node tests/run-all.js      # 445 tests, ~10s, zero dependencies
```

Tests run against the **shipped** `index.html`, not a copy — `extract.js` pulls the
script block out and evaluates named sections. Two gotchas already solved there,
documented in the file: it must be *indirect* eval (`(0,eval)`), and top-level
`const`/`let` are rewritten to `var` because lexical globals aren't visible from a
CJS module.

Run the suite after any edit to `index.html`.

## House rules learned the hard way

- **Verify numbers, don't recall them.** Every Karsten figure in the tool was
  re-derived by simulation and cross-checked against exact rational arithmetic.
  Nine of the eleven bugs found so far came from plausible-looking assumptions.
- **Check card text against Scryfall before implementing a card's math.** United
  Battlefront's "permanent" clause and the Verge oracle wording both materially
  changed the calculation.
- **Scryfall's data lies by omission, in three known ways.** `produced_mana` lists
  conditional and restricted colours as though they were unconditional; fetchlands
  have no `produced_mana` at all; and `type_line` on a double-faced card
  concatenates both faces, so any regex against it also matches the back. Assume a
  fourth exists and check the raw JSON before trusting a field.
- **Logic that needs a regression test belongs in `PARSING`.** `tests/extract.js`
  cannot reach the `SCRYFALL` section — it touches the network. Anything that has
  regressed once should live where a test can see it.
- **When a test fails, work out whether the test or the code is wrong.** Twice the
  test was wrong; fix the test rather than weakening the assertion.
- Scryfall asks for 50–100ms between requests. Batches are spaced 120ms with a 429
  handler. Do not remove this.
- Any public MTG tool needs the Wizards Fan Content Policy notice — it's in the
  footer and the README.
- **The deck-level colour model is a threshold; the per-hand one is a probability.**
  `required()` vs `sourcesFor()` answers "need 18, have 14" and cannot move as you
  draw. `onCurve()` in `GOLDFISH` is the probability, and it is a separate thing
  built on separate maths. Conflating them is the natural mistake — it is what
  started session four.
- **Pure logic goes in a testable slice, even when it produces markup.**
  `gfBulkHTML`/`gfDrillHTML` return strings and live in `GOLDFISH`, not `RENDER`,
  so `extract.js` can reach them. A broken template literal does not throw; it
  renders the word `undefined` inside a percentage and nothing notices.
  `tests/goldfishview.test.js` regexes every rendered hand for exactly that.
- **Inline `[land:XY]` overrides Scryfall entirely.** `parseList` checks the tag
  before the DB, and the tagged branch hardcodes `tapped:false` and carries no
  `subtypes`, `verge`, `fetch`, `restriction` or `mdfcLand` — precisely the data
  the seven session-two bugs were about. It is an escape hatch for cards Scryfall
  cannot resolve, not normal practice.

## Known limitations (documented in the Method tab)

- Fetchlands are resolved against the deck's own land base — a fetch counts for a
  colour only if the deck runs a retrievable land producing it. Scryfall gives
  fetches no `produced_mana` at all, so without this they count as nothing.
- Restricted-use lands ("spend this mana only to cast an artifact spell") count
  per-spell, and do not count at all when the restriction can't be checked
  against a type line.
- Mana dorks and rocks are not auto-counted as colour sources.
- The Verge discount uses cards *seen* as a proxy for lands *in play* — mildly optimistic.
- Tainted lands and Nimbus Maze use the Verge mechanic but a different text shape;
  not auto-detected.
- The colour table assumes ~24 lands; very high or low land counts shift it slightly.
- Cantrips/card selection help consistency more than the colour table reflects.

## The visual layer

Added in session 3. All of it lives in the single `<style>` block; no markup was
restructured and no render function's output changed shape.

- **Tokens in `:root`** — surfaces, text, semantics, a 4px spacing grid
  (`--s1`…`--s7`), radii, motion durations/easings, two elevation shadows.
- **`--panel`, `--panel2`, `--line` are load-bearing aliases, not cruft.** RENDER
  writes them into inline styles (payoff card background, the tension bar's dead
  segment, the footer rule). Delete them and those surfaces break silently.
- **`--panel2` is deliberately a *dark* overlay** (`rgba(0,0,0,.16)`). Nested
  surfaces composite over an already-translucent parent, so a white value makes a
  nested well brighter than its container — backwards, and it was what pushed
  muted text under 4.5:1. Nested wells recede.
- **Three glass elevations** — `--g0` recessed, `--g1` panel (`.card`), `--g2`
  raised (chrome, active tab). `.card .card{backdrop-filter:none}`: a second
  stacked blur costs double and looks identical.
- **The backdrop must stay fixed.** `body::before` (three radial blooms) and
  `body::after` (SVG grain, inline, no network) at negative z-index. Glass over
  flat black is just grey; glass over a scrolling backdrop swims.
- **Colours are solved, not chosen.** Every token clears 4.5:1 against its
  composited background. After changing any colour or surface alpha, re-derive:
  composite canvas → the three blooms at full alpha → the surface's own overlay,
  then WCAG-ratio each token against that. Tightest today is `--warn` on
  `.pill.warn` at 4.56.

### Onboarding

Added after session 3. Three parts, deliberately chosen over a coach-mark tour —
a tour fires when every panel is still empty, so it has nothing to point at.

- **Empty states teach in place.** Each render function returns early when
  `A.total===0` and writes an `empty(title, body)` block explaining what that
  panel will show. No chrome, no dismissal state, no positioning maths, correct at
  every breakpoint, and the explanation sits where the answer will appear.
- **The getting-started card** (`#guide`) is ticked off by the deck's own state —
  paste, resolve, snapshot — not by a step counter. Completing all three retires
  it permanently; the `?` in the header forces it back (`GUIDE_FORCE`), the X
  dismisses early. It lives under its own localStorage key so it can never travel
  in an export or invalidate a saved build.
- **No auto-loaded demo.** First run leaves the list empty behind a placeholder.
  The old behaviour also minted a saved build called "Example build" that the user
  then had to delete. The example is a button in the Decklist card instead, and it
  fires the Scryfall lookup so one click goes from empty to fully resolved.

A consequence worth knowing: `STATE.active` is now legitimately `null` on first
run, so `updateSaveState` has a branch for it. `autosave` already no-opped.

### Motion, and the constraint that shapes it

`render()` rebuilds every panel with wholesale `innerHTML` on every keystroke, so a
CSS transition never fires on anything it regenerates — the browser paints each new
element at its final value. (The old `transition:height` on the curve bars had been
dead code since the day it was written.) Three mechanisms work around it:

- `renderCurve` builds its eight columns **once**, then patches height and label.
- Bars carry `data-bk`. `captureBars()` records where each one actually is —
  mid-transition included — before the rebuild; `runBars()` restores that width,
  forces a reflow, then releases it to the target, so the motion continues rather
  than restarting.
- Numbers carry `data-nk` and tween **by key, not by element** (`tweenNum`), so a
  tween survives its node being replaced and retargets from the displayed figure.
  Never blanks, never resets to zero.

One-shot entrance keyframes *do* fire on creation, so they are gated behind
`body.typing`, cleared 380ms after the last keystroke. Calculation stays instant;
only the animation waits, then everything settles at once.

## The Goldfish tab

Added in session 4 (`memory/2026-08-12-goldfish.md`). Deals hundreds of opening
hands, each from its own seeded shuffle, scores every one on the play and on the
draw, and opens any of them for card-by-card draws with live odds.

- **Probabilities read library composition, never the shuffled order.** The order
  decides exactly one thing: which card Draw turns over. `libraryState()` enforces
  this structurally, by subtracting known cards from the deck rather than reading
  the order's tail. Keep it that way if a tutor, scry or bottoming step is added.
- **On-curve is `P(hold) × P(lands) × P(colours | lands)`.** The third factor is
  `P(sources AND lands) / P(lands)` over a **disjoint** three-way partition —
  colour-producing lands, other lands, everything else. Disjointness is why duals
  don't break it. Multiplying an unconditional colour probability by the land
  probability instead double-counts the land requirement; that is the same trap
  the deck-level table documents, and it is easy to reintroduce.
- **Colours are multiplied, i.e. assumed independent.** Exact for one colour,
  approximate for gold cards — the same approximation `required()` already makes.
- **The calibration test is load-bearing.** Feeding `DERIVED`'s own source counts
  back through `onCurve` returns 0.88–0.94, flat across the grid. Flatness is the
  signature of correct conditioning: bad conditioning drifts with turn number. If
  that test goes red, the conditioning has regressed — do not adjust the band.
- **`GF` owns its state and render path.** `render()` must never call
  `renderGoldfish` (it would wipe a drilled-in hand every keystroke); its only job
  is `gfMarkStale()`, which flags rather than silently redeals. Results are
  session-only and absent from `snapshotState()` by design.
- **Hand scores are a heuristic and are presented as one** — five weighted
  components, each shown with its reasoning. The score rates the opening seven and
  deliberately does *not* move as you draw; the probabilities do.
- **The one-land trap.** Scoring "earliest turn with a play" kept 79% of one-land
  hands. `deployment()` replaced it: P(a play) on each of turns 1–4 with spells
  consumed as cast. A regression group asserts keep rates by land count — if
  one-land keeps climb back above 10%, that mistake has returned.

Its own modelling gaps, all in the Method tab: land drops aren't sequenced (a
tapland is treated as producing mana the turn it's played — optimistic, and the
most valuable one to close), Verge conditional halves are excluded from the
partition, and mulligans are reported as a ship rate rather than simulated as a
London chain.

## Current state — 2026-08-12 (session 4)

**Done.** 445 tests green. Session 2 loaded the first real decklist and fixed seven
manabase bugs; session 3 was the glassmorphism pass with functionality frozen;
session 4 added the Goldfish tab and, in doing so, produced the strongest
cross-validation the mana math has had — the closed-form conditional model and the
`research/mana-engine` Monte Carlo agreeing to ~2 points across the whole grid.

Remaining modelling gaps — mana rocks and dorks uncounted, X spells reading as mana
value 0, split-card pips summed — are documented in the Method tab and all err
toward caution rather than false confidence.

**Never profiled:** runtime performance under continuous typing. If jank appears on
a 60-card list, the cause is the ~8 simultaneous `backdrop-filter` surfaces; cut the
blur radius or drop blur from the left column rather than abandoning the material.
The goldfish itself is not a suspect — 1000 hands score twice each in 39ms.

**Never opened in a browser by the agent.** Session 4's UI was verified headlessly:
the view builders are pure and tested for structure and for leaked `undefined`/`NaN`
across 400 rendered hands, but nobody has *looked* at the Goldfish tab. Layout,
wrapping at narrow widths, and the histogram's proportions are unverified.

**Next up:** open. Mobile layout, card-name autocomplete, a sample-deck gallery, or
closing one of the modelling gaps — sequenced land drops is now the biggest.

**One manual step outstanding:** GitHub Pages may still need enabling —
Settings → Pages → source `main` / root. `.nojekyll` is committed, but Pages itself
is a repo setting.
