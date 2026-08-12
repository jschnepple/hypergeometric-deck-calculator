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
`DIG PAYOFFS`, `RENDER`, `PERSISTENCE`, `SCRYFALL`, `WIRING`). **The tests slice on
those banners** — rename one and `tests/extract.js` will fail loudly with the
banner name. That is intentional.

## Testing

```bash
node tests/run-all.js      # 221 tests, ~5s, zero dependencies
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

## Current state — 2026-08-11 (session 3)

**Done.** Functionality was finished in session 2; session 3 made it look the part.
221 tests green, `main` pushed to
`github.com/jschnepple/hypergeometric-deck-calculator`.

Session 2 put the project under version control and loaded the first real decklist
— Jeff's Barrel Boys brew, in `decks/` — which alone surfaced seven manabase bugs,
all fixed (`memory/2026-08-11-first-real-decklist.md`). Session 3 was the
glassmorphism pass, with functionality frozen and not one analysis number changed
(`memory/2026-08-11-glassmorphism-overhaul.md`).

Remaining modelling gaps — mana rocks and dorks uncounted, X spells reading as mana
value 0, split-card pips summed — are documented in the Method tab and all err
toward caution rather than false confidence.

**Never profiled:** runtime performance under continuous typing. If jank appears on
a 60-card list, the cause is the ~8 simultaneous `backdrop-filter` surfaces; cut the
blur radius or drop blur from the left column rather than abandoning the material.

**Next up:** open. Mobile layout, card-name autocomplete, a sample-deck gallery, or
closing one of the modelling gaps.

**One manual step outstanding:** GitHub Pages may still need enabling —
Settings → Pages → source `main` / root. `.nojekyll` is committed, but Pages itself
is a repo setting.
