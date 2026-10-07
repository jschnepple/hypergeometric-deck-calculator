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
node tests/run-all.js      # 1209 tests, ~15s, zero dependencies
npm install jsdom          # optional; adds 115 more from dom.test.js
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
- **Scryfall's data lies by omission, in four known ways.** `produced_mana` lists
  conditional and restricted colours as though they were unconditional; fetchlands
  have no `produced_mana` at all; `type_line` on a double-faced card concatenates
  both faces, so any regex against it also matches the back; and `name` is not the
  only name a card answers to — `printed_name` carries the Arena rename and the
  foreign printing, and the **collection endpoint does not match it** even though
  search does. Assume a fifth exists and check the raw JSON before trusting a
  field. Every one of these four was found by a real decklist, not by reading
  the docs.
- **Logic that needs a regression test belongs in `PARSING`.** `tests/extract.js`
  cannot reach the `SCRYFALL` section — it touches the network. Anything that has
  regressed once should live where a test can see it. `cardRecord`, `cardKeys`,
  `indexCard`, `foldKey`, `renameInList` and the resolution-dialog builders all
  moved or were written there for exactly this reason; `SCRYFALL` is now only the
  three fetches and the report they build.
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
- **`.hide` loses to any later single-class rule that sets `display`.** Both are
  specificity (0,0,1,0), so `.rmodal{display:flex}` declared after it made
  `class="rmodal hide"` compute to `flex` — a full-viewport blurred overlay from
  first paint, unclosable, while every `classList.contains('hide')` assertion in
  `dom.test.js` passed. **Assert on computed style, not on the class**; there is
  now a boot check that sweeps every `.hide` element for `display:none`. Any new
  component that sets `display` needs its own `.x.hide{display:none}`.
- **Pure logic goes in a testable slice, even when it produces markup.**
  `gfBulkHTML`/`gfDrillHTML` return strings and live in `GOLDFISH`, not `RENDER`,
  so `extract.js` can reach them. A broken template literal does not throw; it
  renders the word `undefined` inside a percentage and nothing notices.
  `tests/goldfishview.test.js` regexes every rendered hand for exactly that.
- **Inline `[land:XY]` overrides Scryfall entirely.** `parseList` checks the tag
  before the DB, and the tagged branch hardcodes `tapped:false` and carries no
  `subtypes`, `verge`, `fetch`, `restriction`, `mdfcLand` **or `typeLine`** —
  precisely the data the seven session-two bugs were about. It is an escape hatch
  for cards Scryfall cannot resolve, not normal practice.
- **A card name has to be FOLDED before it is a DB key.** `foldKey` strips
  diacritics, curly apostrophes, dashes and ligatures. Nobody types "Dáin's
  Company" with the accent — and Scryfall's collection endpoint resolves the
  accent-less spelling perfectly, so the card came back and was then filed under
  a key `parseList` would never ask for. `dbLookup` tries the exact key first and
  the fold only rescues a miss, so a correctly spelled name can never be
  redirected. `foldIndex()` is DERIVED from DB (memoised on identity, like
  `parseDeckCached`) rather than stored, because DB is what travels through
  localStorage and any parallel structure would need rebuilding on every load,
  import and cache restore. **Folded collisions are refused, not guessed** — two
  different cards wanting one folded key empty the slot.
- **`printed_name` is a name the card answers to.** It is how Arena decklists
  work: on Through the Omenpaths, 138 of the first 175 cards carry a printed name
  different from their oracle name (#167 is `name: "Doc Ock's Tentacles"`,
  `printed_name: "Giantcraft Helm"`). It is also what a non-English printing
  carries. `cardKeys` indexes it, both faces, and both faces' printed names.
- **The lookup has three tiers and they are not interchangeable.** Collection
  endpoint (exact, folds accents) → `!"name"` search (matches printed names,
  still exact, applied and reported) → `named?fuzzy=` (a GUESS: offered with a
  button, never applied). Only the first two may touch the deck on their own.
- **`!"name"` is not the single-result endpoint it looks like.** It matches any
  name a printing carries, faces included: live, `!"Lightning Bolt"` returns two
  distinct oracle ids, because a card exists with a face by that name.
  `searchPrimaries` narrows to hits whose WHOLE name (`name` or `printed_name`)
  folds equal, falling back to all hits when none does so "4 Fire" still finds
  Fire // Ice. It deliberately does **not** reuse `cardKeys`, which includes face
  names on purpose — "has a face called X" and "is called X" are different
  questions and conflating them refuses Lightning Bolt.
- **A halted lookup reports nothing about the deck.** One 429 used to cascade:
  the later passes fired a request per card, each also rate-limited, and the
  dialog announced a real sixty-card deck as "Not found — 47 cards". `report.halted`
  stops the remaining passes, clears `missing`, and says the run could not
  finish. `missing` is assembled at the END from what is still unresolved, not
  pushed to as we go.
- **An unresolved card belongs to NEITHER partition.** `parseList` gives it
  `land:false, cmc:0` — the only honest thing it can do — so partitioning on
  `c.land` alone sweeps every one of them into `spells`, where they are counted,
  curved at mana value 0 and averaged. That is what reported a 20-land deck as
  twelve lands with an average mana value of 1.33, under a panel stating they were
  excluded from every calculation. `analyseCards` was the last caller not applying
  the skip-unknowns rule below. Consequence to keep in mind: **`landCount +
  spellCount` is legitimately less than `total`**, and the Glance row and the
  conflict report's leading caveat exist so that gap is stated rather than
  absorbed into one of the columns.
- **A pluralised basic is not a guess, and must not be resolved like one.**
  `5 Islands` fails the collection endpoint AND `!"islands"`; only `named?fuzzy=`
  finds it, and fuzzy is deliberately a suggestion that never applies itself. So
  `basicAlias` is a fourth tier sitting *with the exact matches* — plurals and
  `Snow-Covered` forms of the six basics, nothing else. It runs last, and
  `dbLookup` checks the folded index with `in` rather than truthiness so a
  collision's stored `null` reads as REFUSED and does not fall through to it. A
  genuine misspelling ("spyrebluff canal") still goes to the suggestion dialog,
  which is where it belongs. `lookup()` also sends the canonical name to Scryfall:
  folding "islands" onto an Island record only helps once one is in the DB.
- **A two-faced card's colour requirements are measured ONE FACE AT A TIME.**
  Scryfall's top-level `mana_cost` for an Adventure or split card is the two costs
  CONCATENATED — `"{1}{B} // {R}"` — and `parseCost` reads every symbol in it, so
  the card arrives as one phantom spell needing both colours at once. That told an
  Izzet deck it was thirteen black sources short of a card it casts purely as red
  removal. `faceViews` yields one view per intended face and exactly one for an
  ordinary card, so nothing else changed shape. This is not a preference — you
  cast one side or the other, never both at once — and it applies with or without
  an explicit choice.
- **`[face:main]` / `[face:adventure]` narrows a card to one half**, and the
  unchosen half leaves *everything*: pips, mana value, cost, type line.
  `applyFace` REPLACES the top-level fields rather than adding beside them, which
  is why the curve, the goldfish, the goal clauses and the payoff matcher needed
  no changes at all. Scope is deliberately narrow — `adventure`, `split`, and a
  modal DFC whose back is **not** a land. A transform back face is never cast; an
  MDFC land is already modelled by `mdfcLand` and the Karsten MDFC term, and
  letting it also be a choice of two spells puts two parts of the tool back into
  disagreement about one card.
- **The face picker writes into the DECKLIST TEXT, not into build state.** Same
  call `renameInList` makes, for the same reason: the textarea is what gets
  exported, imported, pasted into another build and re-read by the sideboard and
  variant paths, so a choice recorded anywhere else quietly disappears down one of
  them. It also meant no schema bump.
- **Source counts are FLOATS.** A conditional dual contributes a fraction — that
  is the whole point of the Verge weighting — and the conflict report was
  interpolating it raw: "3.802638647696905 sources … 10.197361352303094 short".
  `num1` rounds for display only; comparisons stay exact, and a shortfall under a
  tenth of a source is a rounding artefact rather than a finding.
- **`displayName` is the name to PRINT; `name` is the name the user typed.** The
  parser keeps the typed one because `renameInList` has to find the line again.
  Before this the conflict report quoted the decklist back — "need 14 for wild ride
  on curve". For a two-faced card the FACE name beats both, which is the point:
  "need 13 for Burn Together" says which half is asking.
- **`matches()` is the tool's NARROWEST reader of a card.** It sees a type line
  and a mana value; `analyseCards` sees more. Every caller that assumed otherwise
  has been a bug. Two rules follow, both now enforced and tested:
  - It falls back to `card.land` when there is **no type line**, so an inline
    `[land:XY]` tag is a land (and a permanent) to the filter as well as to the
    land count. Without it, three parts of the tool disagreed about one card and
    the same card passed both "must be a land" and "must not be a land".
  - **Callers must skip `unknown` cards themselves.** An unresolved card has no
    type line and no mana value, so it reads as noncreature, nonland,
    nonpermanent, MV 0 and passes every negative filter there is. `evalPayoff`
    and `goalSets` both drop them from the sets and keep them in the deck total.

## Known limitations (documented in the Method tab)

- With both halves of a two-faced card in play, the curve, the goldfish and the
  goal clauses read the FRONT face — one card cannot occupy two columns of a
  curve. Only the colour requirements see both faces.
- A misspelled land is still silently a non-land until the suggestion is accepted.
  The Unresolved row and the conflict report's leading caveat make that visible;
  they do not make it hard to ignore, and the dialog is dismissible.
- `[face:...]` on a card with no second castable face is accepted and does nothing.
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
- **`vennAtoms` returning null is a REFUSAL, not an empty deck.** `pGoal` keeps
  the two branches apart: `total===0` is an exact zero, `null` falls back to
  sampling. Collapsing them reported a confident exact 0% "over 0 atoms of the
  0-card list" for a sixty-card deck, which five delirium clauses reach.
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
  as analysing a half-applied variant swap. A goal naming a card the deck no
  longer holds keeps that name in the dropdown, flagged, rather than falling back
  to the placeholder: the builder saying "no card chosen" while the panel prints
  "at least 1 × Leyline Axe — 0.0%" is the two halves of the page disagreeing.
- **Every live handler clamps to the SAME range `sanitize*` does.** `mvVal` to
  0–16, clauses to `GOAL_MAX_CLAUSES`, `glMulls` to 0–6. A number input's `max`
  is not enforced for a typed value, so a looser handler means the figure on
  screen and the figure after a reload are different, with nothing to explain it.
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

## Current state — 2026-10-07 (session 8)

**Done.** Dig payoffs can name specific types: a payoff's `anyOf` is a list of
keys (`type:Artifact`, `sub:Equipment`, `creature:Dwarf`) ORed together and
ANDed with the three dropdowns, picked from chips that `payoffTypeOptions`
builds out of the deck's own type lines. New `+ Dáin's Company` preset. Rules
that came out of it, all in `memory/2026-10-07-type-selection.md`:

- **A creature-type key matches the SUBTYPE, not the Creature card type** —
  Dáin's Company says "a Dwarf or Equipment card". Verified on Scryfall.
- **`changeling` is a field on the card record**, read from `keywords`. Records
  cached before session 8 lack it until the next lookup.
- **Anything a preset holds by reference must be cloned in `addPayoff`.**
- `typeChipsHTML` and `payoffTypeOptions` live in `DIG PAYOFFS`, not `RENDER`,
  and reach into COMPARE for `esc`; `tests/payoff.test.js` seeds a stand-in.

`node tests/run-all.js` is green locally; `dom.test.js` was run against a staged
copy with jsdom (156) and the Payoffs tab was rendered in headless Chromium at
1280px and 420px. Sessions 7 and 8 are both still uncommitted.

**Open:** the goal builder has no UI for `anyOf`; the "exactly N" row of the
distribution table is misleading when N is the take limit (see the memory).

## Previous state — 2026-09-13 (session 7)

**Done.** 1302 tests green (1441 with jsdom). Session 7 was the second real
decklist, and like the first it found bugs nothing synthetic would have: a
20-land deck reported as twelve lands, and an Izzet deck told it was thirteen
BLACK sources short. Both root causes were a layer below the panel complaining —
unresolved cards silently classified as 0-mana spells, and an Adventure's two
costs read as one. Full write-up in `memory/2026-09-13-lands-and-faces.md`.
New in the UI: a **Two-faced cards** panel in the left column (hidden unless the
deck holds one) and an **Unresolved** row in Deck at a Glance. New test file
`tests/faces.test.js`; `dom.test.js` now drives the face picker and asserts the
black requirement leaves the rendered conflict report.

Two process notes for next time. **jsdom will not install on Jeff's machine**
(the local VM has no reachable npm registry), so the DOM layer skips there and
has to be run against a staged copy elsewhere — do that before calling a session
done, because it is the only layer that catches a bad element id or a handler
wired to a name that does not exist. And **Scryfall returns 400 to a default
HTTP-library User-Agent**, so any node-side harness that hits the API needs a
custom one; the browser is unaffected, which is why nothing in the app noticed.

**Next up:** nothing is queued. The list below is unchanged from session 6 except
for one addition it earned:

- **The dismissible-suggestion gap.** A misspelled land is still silently a
  non-land until you accept the suggestion, and the dialog can be dismissed. The
  new Unresolved row and leading caveat make it visible; they do not make it hard
  to ignore. Worth deciding whether an unresolved LAND-shaped line deserves
  stronger treatment than an unresolved spell.
- **Mobile layout.** Still never looked at, and the left column just gained
  another panel.
- **Sequenced land drops.** Still the largest modelling gap.
- **Goals in the Compare tab.**
- Mana rocks and dorks uncounted; X spells reading as mana value 0.

## Previous state — 2026-08-27 (session 6)

**Done.** 1209 tests green (1324 with jsdom installed). Session 2 loaded the first
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

**The page itself has still never been rendered in a real browser by the agent**
— the Chrome extension will not load `file://`, so that gap stands. What HAS now
been done live, in a browser, is the Scryfall side: the three-tier lookup was run
against `api.scryfall.com` with the real reported card names, and all three
resolve (`Dain's Company` → `Dáin's Company` by fold, `Giantcraft Helm` →
`Doc Ock's Tentacles` by printed name, a deliberate typo → a suggestion). The
fixtures in `tests/resolve.test.js` are the real API payloads from that session,
not payloads typed from memory.

Otherwise the gap is narrower than it was. `tests/dom.test.js` now boots the actual page in jsdom and drives the
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
