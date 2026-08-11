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

## Current state — 2026-08-11 (session 2)

Functionality is **done**. 221 tests green, working tree clean, `main` pushed to
`github.com/jschnepple/hypergeometric-deck-calculator`.

The second session put the project under version control (session one never
committed, and the files had to be recovered from a scratch directory) and then
loaded the first real decklist — Jeff's Barrel Boys brew, now in `decks/`. That
single deck surfaced **seven** bugs, all fixed: lands counted as cheap ramp/draw,
shocklands read as entering tapped, split and double-faced cards failing Scryfall
lookup entirely, MDFC lands counted as lands, fetchlands contributing zero colour,
restricted-use mana counted as unrestricted, and MDFC type lines leaking the back
face into every type test. See `memory/2026-08-11-first-real-decklist.md`.

The tool is now considered safe to share. Remaining modelling gaps — mana rocks and
dorks uncounted, X spells reading as mana value 0, split-card pips summed — are
documented in the Method tab and all err toward caution rather than false confidence.

**Next up:** the visual overhaul — Apple-grade glassmorphism plus motion on the
charts and components, ahead of sharing it with friends. See
`memory/next-session-prompt-glassmorphism.md` (the older `next-session-prompt.md`
is superseded). Functionality is frozen for that pass; the 221 tests must stay
green, which in practice means the banner comments in `index.html` must survive any
restructuring.

**One manual step outstanding:** GitHub Pages may still need enabling —
Settings → Pages → source `main` / root. `.nojekyll` is committed, but Pages itself
is a repo setting.
