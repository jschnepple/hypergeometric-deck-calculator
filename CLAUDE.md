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
  dom.test.js       the exception: boots the real page in jsdom and clicks it.
                    Skips itself with a message if jsdom is absent, so the
                    zero-dependency promise holds on a clean checkout.
decks/              real decklists + their written analyses
research/mana-engine/  Python Monte Carlo that derived the conditional
                    Karsten table. Not runtime code — this is the provenance
                    of the numbers in MATH CORE. Do not delete.
memory/             session memories
MEMORY.md           index of memories
```

`index.html` is organised by banner comments (`MATH CORE`, `PARSING`, `SIDEBOARD`,
`ANALYSIS`, `DIG PAYOFFS`, `GOALS`, `GOLDFISH`, `COMPARE`, `RENDER`,
`PERSISTENCE`, `SCRYFALL`, `WIRING`). **The
tests slice on those banners** — rename one and `tests/extract.js` will fail loudly
with the banner name. That is intentional. Adding a banner means editing
`SECTIONS`: the slice before it must be re-pointed to end at the new name, or it
silently swallows everything you just added.

## Testing

```bash
node tests/run-all.js      # 1016 tests, ~13s, zero dependencies
npm install jsdom          # optional; adds 90 more from dom.test.js
```

In a sandbox that cannot write to the checkout, jsdom goes somewhere else:

```bash
npm install --prefix /tmp/jd --cache /tmp/npmcache jsdom
NODE_PATH=/tmp/jd/node_modules node tests/run-all.js
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

## Sideboards and variants

Added in session 5 (`memory/2026-08-19-sideboard.md`, planned in
`memory/plan-sideboard.md`). A sideboard is parsed out of the same textarea, and
a "variant" is a named sideboard plan you can switch the whole page over to and
compare against the maindeck.

- **A variant is a diff, not a copy.** `{out, in, qty}` swaps applied to the
  maindeck. A copy is correct only until you next tune the deck, which is never
  long; the diff also reads back as the sentence you want ("−2 Cut Down,
  +2 Duress"). The price is staleness, handled by `applyVariant` returning
  errors and the variant being marked **broken** rather than analysed with half
  a swap applied.
- **A broken variant returns a full analysis SHAPE, empty** (`analyseVariant`
  builds `analyseCards([],[],o)` and stamps `broken` on it). Every render
  function already handles `total===0`; without this, a broken variant would
  throw somewhere deep inside whichever panel happened to be open.
- **`analyse()` is pure now, and ANALYSIS is testable for the first time.** The
  six DOM reads moved into `readInputs()` in RENDER. `analyseCards(cards,
  unknown, opts)` is the old body verbatim. This is what lets one code path
  serve the maindeck and every variant; it is also why `tests/analysis.test.js`
  exists at all.
- **Sideboard splitting fixed a live bug.** `parseList` skips a `Sideboard`
  header line and keeps parsing, so every pasted Moxfield/Arena export was
  silently analysing 75 cards as the maindeck. `splitList` runs first now.
  Regression-tested in `sideboard.test.js`.
- **No blank-line heuristic, deliberately.** Blank lines separate spells from
  lands in mainboard lists constantly — the demo deck does it. An explicit
  header (`Sideboard`, `//Sideboard`, `SIDEBOARD:`, `SB:` per line) or nothing.
- **`cloneCard` is load-bearing.** `produces` and `subtypes` are shared
  references off the DB record and `analyse` *reassigns* `produces` for
  fetchlands. Without the clone a variant could rewrite what the baseline column
  says about the maindeck.
- **Both ends of a swap are dropdowns.** That makes "the card coming in must be
  in the sideboard" true by construction rather than validated afterwards, and
  removes typos as a source of breakage.
- **Deterministic vs sampled is the organising distinction of the Compare tab.**
  Curve, sources, land count and payoff odds are exact — any difference is real.
  Keep rates are Monte Carlo. Those get common random numbers (every variant
  dealt from the same base seed) plus a noise band computed **per cell**:
  differences inside `2·√(SE₁²+SE₂²)` render grey and say "noise", with the band
  in the tooltip. Per cell, not one figure for the table — rates near 50% are
  noisier than rates near 90%, and quoting a single band contradicts the test
  actually applied (it did, in the first version). The mean-score row uses
  `sd/√n`, which is why `cmpSim` carries `sdPlay`/`sdDraw`: a mean is not a
  proportion and colouring it unconditionally asserts findings that aren't there.
  CRN makes the true paired error smaller than these bounds, so they are
  conservative on purpose.
- **`cmpSig` hashes the whole card list, like `gfSig`.** Summary figures are not
  enough for staleness: swapping one two-mana instant for another leaves total,
  land count and average mana value all identical, and the previous run's keep
  rates would sit on screen labelled current.
- **`applyVariant` merges duplicate entries and tags every problem with a
  `kind`.** `findCard` returns the first match, so a card split across two lines
  ("2 Abrade" twice, which real exports do) would otherwise break legal swaps.
  The `kind` tag is what keeps a half-filled editor row (`noop`) and a maindeck
  that already ran five of something out of the Compare tab's regression
  headline — that panel answers "what does sideboarding cost you", so only
  swap-caused problems belong in it.
- **`analyseVariant` recomputes `unknown` from its own cards** (`unknownIn`).
  Reusing the maindeck's list let a variant board in an unresolved card and
  still pass `validateDeck`, simulating it as a colourless 0-drop — the exact
  thing that check exists to prevent.
- **`parseDeckCached` keys on text *and* `DB`.** A Scryfall lookup changes what
  identical text parses into; `lookup()` also clears `PD_VAL` explicitly.
- **No aggregate "best variant" score, ever.** There is no defensible weighting
  between a point of colour consistency and a point of payoff probability. The
  panel names *regressions* instead — which plan drops a colour under its
  requirement — because that is the actual decision the player is making.
- **Direction is per metric, not per sign.** `cmpTone(dir, …)` takes
  `up`/`down`/`zero`/`none`. A single sign→colour rule is wrong for a third of
  the rows (a smaller shortfall is good, a smaller payoff probability is bad, a
  changed average mana value is neither).
- **`renderCompare()` returns immediately unless its tab is on screen.** Every
  variant costs a parse and a full analysis; with four variants that is five
  analyses per keystroke on a path that has never been profiled. The tab
  handler calls it on arrival instead.
- **COMPARE reaches into RENDER for `empty` and `colDot`.** Fine at runtime
  (they are top-level consts, referenced only inside function bodies), but
  `extract.js` cannot see them, so `compare.test.js` seeds stand-ins. If either
  is renamed, that test needs the same rename.
- `esc()` was added in COMPARE and is the first HTML-escaping helper in the
  file. Variant names are user input rendered into markup; use it.

## The Consistency tab

Added in session 6 (`memory/2026-08-27-consistency.md`, planned in
`memory/plan-consistency.md`). A **goal** is your own definition of a good
opening hand; the tab reports its exact probability, solves the London mulligan
chain in closed form, and plots strictness against the cards it costs.

- **A goal is a conjunction of clauses over the seven you LOOK AT.** Two clause
  kinds and no more: `{kind:'cards', n, sel}` (at least *n* from a set, where
  `sel` is a named card list or a filter handed to `matches()`) and
  `{kind:'types', n}` (at least *n* distinct card types). Anything richer needs
  a language rather than two dropdowns, and these two cover both worked
  examples — Leyline Axe starts and delirium.
- **The Venn partition is the whole correctness story.** `vennAtoms` puts every
  card in exactly one atom, the group belonging to precisely the same subset of
  the clause sets. Partitioning per *set* double-counts an overlapping card —
  the trap the Method tab documents for colour sources — and worse, it makes a
  card that satisfies two clauses at once look as though it can only satisfy
  one. A `types` clause contributes one set per card type present, so the set
  count is not bounded by the clause count; over 30 sets the mask would wrap and
  `vennAtoms` returns null instead.
- **Both naive shortcuts are wrong, in opposite directions.** Disjoint clause
  sets compete for the seven slots, so the exact joint is BELOW the product of
  the clauses taken separately. Overlapping sets go the other way, because one
  card does both jobs. `tests/goals.test.js` asserts both signs; the kickoff
  prompt's DoD claimed only the "lower" one, and it is the disjoint case.
- **`method` is the label, and it never switches quietly.** Over the enumeration
  budget the figure is sampled and says so, reusing the Compare tab's
  exact-vs-sampled distinction. `opts.budget` exists so a test can force the
  fallback deterministically rather than hunting a pathological deck.
- **London is what makes the chain closed-form, and it reads like a bug.** You
  look at a fresh seven every time and bottom AFTER keeping, so `p` is identical
  at every mulligan and evaluating the goal on the seven you look at is correct.
  Under Vancouver it would have been wrong. Stated in the code, in Method, and
  here, because a reader who has not thought it through will "fix" it.
- **`mulliganChain`'s `maxMulls` is how long you insist, not the total.** Looks
  0..M stop on success; if look M fails you mulligan once more and keep whatever
  comes, at hand size 7−(M+1). The stop distribution sums to 1 and is printed in
  full — the policy is easier to read off the table than off the parameter.
- **No best policy, ever.** `goalFrontier` returns points and `frontierKnee`
  names the bend. There is no defensible exchange rate between "has the Axe" and
  "has six cards instead of five", the same reason the Compare tab refuses to
  rank variants.
- **An unfinished goal is REFUSED, not answered.** `goalIssues` distinguishes
  `blocked` (a named clause with no card chosen — do not evaluate) from `warn`
  (complete but impossible in this list — a real 0%, with an explanation). A
  confident 0% for a goal the user has not finished writing is the same failure
  as analysing a half-applied variant swap.
- **`consistencyHTML` checks `A.broken` BEFORE `A.total===0`.** A broken variant
  carries the analysis shape empty, so the ordinary empty state would tell you
  to paste a decklist you already pasted. Found by the view test, not by eye.
- **`pGoalCached` keys on everything `pGoal` reads** — quantities, names, type
  lines, mana values, the land verdict. A Scryfall lookup changes no name and no
  quantity and changes every type line; session five's compare-signature bug was
  exactly this shape.
- **`cardTypes` reads the segment BEFORE the em dash** and matches whole words
  from a fixed list. Supertypes are not card types; subtypes are not card types;
  Tribal folds into Kindred. It relies on `typeLine` being the FRONT face, which
  `SCRYFALL` guarantees — a combined DFC line would read "Sorcery // Land" as two
  types, one of which the card does not have in your hand.
- **`renderConsistency()` returns immediately unless its tab is on screen**, like
  `renderCompare()`, and the tab handler calls it on arrival. It evaluates
  against `currentA()`, so a sideboard plan that cuts the payoff moves the
  frontier.
- Goals are per-build state at **schema 3**, with `sanitizeGoals` mirroring
  `sanitizeVariants` — including reserving valid ids before minting new ones,
  because the panel keys its headline tween on the goal id. A `types` clause
  arriving with a stale `sel` has it dropped: a clause whose description and
  whose maths disagree is worse than one that is merely wrong.
- GOALS view builders reach into COMPARE for `esc` and RENDER for `empty` and
  `NUMSTATE`. Fine at runtime, invisible to `extract.js`, so
  `tests/goalsview.test.js` seeds stand-ins. Rename either and that file needs
  the same rename.

## Current state — 2026-08-27 (session 6)

**Done.** 1016 tests green (1106 with jsdom installed). Session 2 loaded the first
real decklist and fixed seven manabase bugs; session 3 was the glassmorphism pass
with functionality frozen; session 4 added the Goldfish tab and produced the
strongest cross-validation the mana math has had — the closed-form conditional
model and the `research/mana-engine` Monte Carlo agreeing to ~2 points across the
whole grid. Session 5 added sideboards, variants and the Compare tab, made
`analyse()` pure on the way, and fixed the silent sideboard-folding bug.
Session 6 added deck goals, the Venn-atom partition, the London mulligan chain
and the Consistency tab, and cross-validated the new maths against the goldfish's
own dealer for six goals of different shapes.

Remaining modelling gaps — mana rocks and dorks uncounted, X spells reading as mana
value 0, split-card pips summed — are documented in the Method tab and all err
toward caution rather than false confidence.

**Never profiled:** runtime performance under continuous typing. If jank appears on
a 60-card list, the cause is the ~8 simultaneous `backdrop-filter` surfaces; cut the
blur radius or drop blur from the left column rather than abandoning the material.
The goldfish itself is not a suspect — 1000 hands score twice each in 39ms. The
compare panel is not a suspect either, because it does not compute while hidden —
but if that gate is ever removed it becomes the first place to look. `render()`
would otherwise parse the list several times per keystroke, which is what
`parseDeckCached` is for.

The consistency panel has the same gate and, behind it, `pGoalCached`. A realistic
three-clause goal enumerates in about 0.1ms; a goal whose clauses slice the deck
into ten atoms took 16ms in a scratch measurement, and that is per goal per
keystroke without the memo. If that panel ever feels slow, check the memo key is
still busting correctly before touching the enumeration.

**Still never opened in a real browser by the agent** — but the gap is narrower
than it was. `tests/dom.test.js` now boots the actual page in jsdom and drives the
whole sideboard flow AND the whole consistency flow with real clicks, so wiring,
element ids and handler behaviour are covered. What remains unverified is anything
jsdom does not do: layout, wrapping at narrow widths, `backdrop-filter`, whether
the compare matrix reads well when it gets wide enough to scroll, and **whether
the frontier SVG scales properly** — it is the first chart in the app that is not
built from divs, and `viewBox` behaviour is exactly what jsdom does not model.
The goal builder is also now the densest thing in the 400px left column.

**Next up:** nothing is queued. The obvious candidates, in rough order of value:

- **Mobile layout.** The compare matrix is still the widest thing in the app and
  the goal builder is the most cramped, and neither has been looked at narrow.
- **Sequenced land drops.** Still the largest modelling gap, and still the
  prerequisite for ever modelling real delirium rather than the upper bound the
  Consistency tab ships.
- **Goals in the Compare tab**, as a second row group — "what does this sideboard
  plan do to my Leyline start". The plan flagged it as an open question and the
  maths is already variant-aware; only the presentation is missing.
- Card-name autocomplete, a sample-deck gallery, or the older gaps: mana rocks
  and dorks uncounted, X spells reading as MV 0, split-card pips summed.

**One manual step outstanding:** GitHub Pages may still need enabling —
Settings → Pages → source `main` / root. `.nojekyll` is committed, but Pages itself
is a repo setting.
