# Plan — Goldfish / opening-hand simulator

Status: **agreed, not yet built.** Session 4 planning output.

## What it is

A new top-level **Goldfish** tab. Deals many independent 7-card opening hands from
uniquely shuffled copies of the current decklist, scores each one for keepability on
the play *and* on the draw, and lets you drill into any single hand to see live,
conditional draw and on-curve odds for every card in hand and every card left in that
instance's library — updating as you draw one card at a time.

## Decisions locked

| Question | Decision |
|---|---|
| Format | 60-card Constructed (deck size still reads from the existing `deckSize` input) |
| Hand rating | Heuristic scorecard, Karsten-grounded, fully itemised in the UI |
| On-curve % | Conditional joint, hand-aware — newly defined (see below) |
| Draw odds basis | Hypergeometric over the *remaining library composition*, never the actual order |
| Mulligan depth | Rate the 7s; report ship-rate. No auto-bottoming chain. |
| Play vs draw | Both computed for every instance, always, side by side |
| Placement | New top-level tab with its own state and its own render path |
| RNG | Seeded PRNG (mulberry32), seed shown per instance, reproducible |

## The correction that shapes the work

The tool does **not** currently compute a "% chance to be played on curve." `ANALYSIS`
does Karsten's *threshold* comparison: `required(pips, turn)` returns the colored-source
count needed for ~90% castability, `sourcesFor()` returns what the deck has, and the UI
reports the shortfall. That is a deck-level "need 18, have 14" verdict, not a probability
and not hand-aware.

The primitives to build the probability already exist — `hyperAtLeast`, `cardsSeen`, the
conditional `DERIVED` table — but the number itself is new code with new tests.

`required()` does not become dead weight: it becomes the **calibration target**. A deck
holding exactly the Karsten-required sources must produce a color probability near the
threshold (default 0.90) from the new math. That is a test, and it is the main defence
against the conditional-hypergeometric trap flagged in MEMORY.md's standing facts.

## Architecture

### A new banner section, and the one edit it forces

Add a `GOLDFISH` banner between `DIG PAYOFFS` and `RENDER`. Because `tests/extract.js`
slices on consecutive banner pairs, this **requires editing `SECTIONS`**:

```js
payoffs:  ['DIG PAYOFFS', 'GOLDFISH'],   // was ['DIG PAYOFFS', 'RENDER']
goldfish: ['GOLDFISH',    'RENDER'],     // new
```

Miss this and `payoffs` silently swallows the whole goldfish engine into its slice.

### Keeping clear of `render()`

`render()` rebuilds every panel with wholesale `innerHTML` on every keystroke. A drilled-in
hand with live draw state cannot survive that. So:

- Goldfish owns a module-level `GF` state object and a `renderGoldfish()` that `render()`
  never calls.
- `render()` gains exactly one goldfish responsibility: when the decklist or deck size
  changes, stamp `GF.stale = true`. The Goldfish tab then shows a "decklist changed —
  re-run" banner over the existing results rather than silently recomputing against a
  deck that no longer matches the hands on screen.
- Results are session-only. They do **not** go into `snapshotState()`, so they can never
  travel in an export or invalidate a saved build. The seed does persist, so a run is
  reproducible from the seed alone.

### Instance model

```
expandDeck(cards)   -> flat array of N card refs (qty expanded)
shuffle(deck, seed) -> Fisher-Yates driven by mulberry32(seed)
instance = { seed, order[], hand: order[0..6], libIdx: 7,
             scorePlay, scoreDraw, breakdown }
```

Per-instance seed is `baseSeed + i`, displayed as 8-char hex. Library state during
drill-in is `order.slice(libIdx)`; **the order is only ever consulted to decide which
card the Draw button reveals.** Every displayed probability is computed from the
*composition* of what remains, so the numbers are what a real player would know.

### Validity gate

The tab refuses to run, with a specific message per failure, unless:
resolved card total === deck size · no unknown/unresolved cards · at least one land ·
at least one spell. Reuses `parseList`'s existing `unknown` output.

## The math

### Hand score (0–100)

Weighted components, each itemised in the UI so a 62 can be read as *why* it is a 62.
Weights are constants at the top of `GOLDFISH`, tunable, and asserted in tests.

1. **Land band** (dominant). Centred on the deck's own ratio — ideal is
   `round(7 × landCount/N)`, clamped to a floor of 2 — rather than a fixed 3–4 band, so a
   17-land deck and a 26-land deck are judged on their own terms. Falls off sharply to 0
   at 0 and 7 lands.
2. **Early action** — is there a castable play by turn 2, by turn 3? Hands whose first
   play is turn 4 are heavily penalised regardless of land count.
3. **On-curve castability of the hand's spells** — fraction of the hand's spells castable
   on their curve turn given the hand's own lands plus expected drops, weighted toward
   the cheap end.
4. **Color support** — do the hand's lands actually produce the pips its two cheapest
   spells need, accounting for taplands, verges, fetches and restrictions via the
   existing `sourcesFor` machinery.
5. **Clumping penalty** — several copies of the same slot (four 5-drops) scores below a
   spread hand of the same land count.
6. **Dead-card penalty** — cards the deck's own sources cannot support.

Scored twice per instance. The on-the-draw pass uses `cardsSeen(turn, false)`, so it sees
an extra card by turn 1 and applies a looser keep threshold — which is exactly the
"8 cards allows some room for different strategies" effect.

Labels: **Snap keep · Keep · Marginal · Ship.** The keep threshold is a slider, defaulting
to different values for play and draw, and the ship-rate headline follows it live.

### On-curve probability, hand-aware and conditional

For a card `c` of mana value `m`, in a given instance, at current turn `t`:

```
P_oncurve(c) = P_have(c) × P_lands(m) × P_colors(c, m | lands)
```

- `P_have` — 1 if already in hand; else `hyperAtLeast(1, copiesLeft, drawsRemaining, libSize)`
  where `drawsRemaining = cardsSeen(m, onPlay) − cardsSeen(t, onPlay)`.
- `P_lands` — `hyperAtLeast(m − landsSeen, landsLeftInLib, drawsRemaining, libSize)`.
  Land-drop-capped by construction: needing `m` lands *among cards seen by turn m* is the
  same condition as making every drop.
- `P_colors` — conditional hypergeometric on the remaining library, conditioned on having
  the lands, mirroring the approach `sourcesFor` already uses. **This is the known trap.**
  Cross-validated against `required()` in tests before it is trusted.

Every factor is recomputed from the post-draw library composition on each Draw, so the
whole board moves in real time. Cost is O(distinct cards) per draw — instant.

Displayed alongside it, for library cards: copies left, P(draw next), P(≥1 by T3), P(≥1 by T5).

### Modeling gaps, inherited and new

Inherited from the existing engine and documented in the Method tab: mana rocks and dorks
uncounted, X spells reading as MV 0, split-card pips summed.

New to this feature, to be written into the Method tab as they land:
- A tapland played on turn `m` produces nothing that turn. Land drops will be sequenced
  taplands-first, which is optimistic; the alternative is a full play-policy sim, which
  was explicitly ruled out.
- Fetchlands replace themselves and so do not cost an extra drop, but a fetch that gets a
  tapped land buys no mana that turn — `fetch.tapped` already carries this.

## UI

**Bulk view.** Controls (hand count, base seed, keep thresholds), Run, then: ship-rate on
play vs on draw as the headline pair, mean score, a land-count histogram across all hands,
and a grid of instance cards — seed, the 7 card names, two score badges. Display caps at
~100 cards with "show more"; the simulation itself runs the full count.

**Drill view.** The 7 cards as text cards (name, cost, MV, type) laid out as a hand. Score
breakdown itemised by component. Then two live tables — Hand and Library-remaining — plus
Draw, turn counter, play/draw toggle, reset, and back. Reuses existing glass tokens and
`.card` elevation; no new visual language.

## Test plan — `tests/goldfish.test.js`

- PRNG determinism: same seed, same order, across runs
- Shuffle is a true permutation (multiset preserved) — the correctness bug that would
  poison every downstream number
- Shuffle uniformity: chi-square over positions, small deck, many trials
- Hand/library partition: 7 + rest, no duplication, no loss
- Validity gate rejects each failure mode with the right message
- Scorecard: hand-crafted hands land in expected bands; components sum to the total;
  the same hand scores ≥ on the draw than on the play
- On-curve: in-hand 1-drop with its color available ≈ 1.0; zero copies left → 0
- **Calibration:** a deck holding exactly `required(pips, turn)` sources yields a color
  probability inside a band around the threshold — ties the new math to the Karsten table
- Live draw: hand +1, library −1, and probabilities move in the correct direction
- Play vs draw: on-draw ≥ on-play for the same instance and turn

Whole suite (221 existing + new) must stay green.

## Phasing

1. Engine — PRNG, shuffle, expand, instance model, validity gate — plus tests
2. Scorecard — plus tests
3. On-curve conditional math — plus calibration tests
4. Bulk view UI + aggregate stats
5. Drill-in view + live draw
6. Method tab entry, README, session memory, commit

Phases 1–3 are testable with zero UI and should be green before any markup is written.

## House rules that apply here

- Verify numbers, don't recall them. Every figure in this feature gets derived and
  cross-checked, as with the original Karsten pass.
- Conditional hypergeometric is the known trap. If the color numbers look "too high",
  re-read the Method tab before touching them.
- Commit before wrapping up.
