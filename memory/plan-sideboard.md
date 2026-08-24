# Plan — sideboards and sideboard variants (session 5)

## The problem, stated properly

A Magic deck is not one deck. It is a maindeck plus up to fifteen sideboard cards,
and across a match you play two or three *different* decks assembled from them.
Every existing number in this tool describes game one. Nobody checks games two and
three, because doing it by hand means re-typing the list once per matchup.

The consequence is a specific, common, invisible failure: **sideboarding quietly
breaks manabases.** You cut two lands for two hate cards, or you bring in a
double-pip card your deck only has eleven sources for, or you side out the four
cheap spells that were holding your curve down. Each is a mana problem that only
exists in game two, and the tool as it stands cannot see any of it.

So the headline output of this feature is not "here are your variants". It is:
**which of my sideboard plans breaks my mana, and by how much.**

## A bug found while reading the code

`parseList` skips lines matching `/^(sideboard|deck|maybeboard|commander)\b/i`
and then keeps parsing. Paste any Moxfield or Arena export today and the
sideboard is silently folded into the maindeck — a 75-card deck analysed as
though all 75 were the maindeck, land ratios and colour requirements included.
The feature fixes this as a side effect; it gets its own regression test.

## Data model

A variant is a **live diff**, not a copy.

```js
variant = {
  id:    1,                                   // stable, monotonic
  name:  "vs Control",
  swaps: [ {out:"Cut Down", in:"Duress", qty:2}, … ],
  note:  ""                                    // optional free text
}
```

Stored on the build, so it exports and imports with the deck:

```js
build = { schema:2, list, variants:[…], activeVariant:null, …existing fields }
```

`activeVariant: null` means the maindeck. The maindeck is never itself a variant —
it is the baseline everything is measured against, and it cannot be deleted.

**Why a diff and not a copy.** A copy is correct for exactly as long as you don't
touch the maindeck, which is never. The diff also *is* the thing you want to
read: "vs Control: −2 Cut Down, +2 Duress" is the sentence a player wants,
and a stored full list would have to be diffed back to produce it.

**The cost of a diff** is that it can break: delete Cut Down from the maindeck
and the swap has nothing to remove. Handled loudly, per the house rules — a
broken variant is not analysed with a partial swap applied. It is marked broken,
excluded from the comparison, and shows the reason in its column.

## Parsing the sideboard

`splitList(text)` → `{main, side, ignored}`, splitting on section headers before
any card parsing happens. Recognised:

- `Sideboard`, `//Sideboard`, `SIDEBOARD:` → side
- `Deck`, `Main`, `Maindeck`, `Commander` → main
- `Maybeboard`, `Considering`, `Tokens` → ignored
- `SB: 2 Duress` (MTGO per-line prefix) → that one line to side

No blank-line heuristic. Blank lines are used cosmetically inside mainboard
lists all the time, and guessing wrong silently moves cards between decks —
the exact class of error this codebase keeps getting bitten by.

`parseDeck(text)` → `{cards, unknown, side, sideUnknown}` runs `splitList` and
then the existing `parseList` over each block. `parseList` itself is unchanged,
so every existing parser test still describes the same function.

Scryfall lookup resolves main **and** sideboard names — you cannot evaluate a
swap against a card the DB has never heard of.

## Applying a variant

`applyVariant(mainCards, sideCards, swaps)` → `{cards, problems}`.

Card objects are cloned before mutation (`produces` is a shared array reference
from `DB`; `analyse` reassigns it for fetchlands, and a variant must not be able
to reach back into the maindeck's data).

Problems, in two levels:

| level | condition |
|---|---|
| error | `out` card not in the maindeck |
| error | `out` qty exceeds the maindeck's copies |
| error | `in` card not in the sideboard |
| error | `in` qty exceeds the sideboard's copies, summed across the variant's swaps |
| warn | net (in − out) ≠ 0 — the variant is 59 or 61 cards |
| warn | post-swap copies of a non-basic card > 4 |
| warn | sideboard exceeds 15 cards |

Any error ⇒ `broken`. Warnings still analyse; a 61-card variant is a legal
choice and the tool should tell you what it costs, not refuse.

Note that the deck-size input stays user-controlled. If a variant's total
disagrees with it, that surfaces in the existing conflict report rather than
being silently corrected — the hypergeometric N is an assumption the user owns.

## What gets compared, and how

Two kinds of number, and the distinction is load-bearing:

**Deterministic** — computed exactly from the list. Any difference between
variants is real, however small.

- land count, and its distance from the Karsten regression recommendation
- average mana value, and the eight-bucket curve
- per colour: sources available vs sources required by the binding spell
- payoff probabilities (plain hypergeometric, exact)
- count of hard conflicts

**Sampled** — Monte Carlo, so any difference is noise until proven otherwise.

- mulligan/ship rate on the play and on the draw
- mean hand score, land-count distribution

Sampled figures get two protections. First, **common random numbers**: every
variant is dealt from the same base seed sequence, so the shuffles are
correlated and a shared run of bad luck largely cancels out of the difference.
Second, an explicit **noise band**: a proportion at n hands has
SE = √(p(1−p)/n), the difference of two has SE_diff = √(SE₁² + SE₂²), and any
gap smaller than 2·SE_diff renders greyed with the band printed next to it.
(CRN makes the true paired error *smaller* than that bound, so the band is
conservative — stated as such in the Method tab rather than silently assumed.)

Refusing to invent a single "best variant" score is deliberate. There is no
defensible weighting between a point of colour consistency and a point of payoff
probability, and inventing one would be exactly the false confidence the rest of
the tool avoids. The comparison flags **regressions** instead: a variant that
pushes a colour below its requirement, or moves the land count away from the
recommendation, gets called out by name at the top of the panel.

Colour direction is per-metric, not per-sign. "Sources short" going down is
good; payoff probability going down is bad; average mana value going up is
neither. A single sign→colour rule would be wrong for a third of the rows.

## UI

**Variant chip bar**, directly above the existing tab strip:

```
Deck:  [ Maindeck ]  [ vs Control ]  [ vs Aggro ⚠ ]  [ + ]
```

Selecting a chip switches what *every* existing panel describes. That gives
drill-down for free: the Land Count, Colour Requirements, Curve, Payoffs and
Goldfish tabs all already take an `A`, so they simply receive the variant's `A`.

The obvious risk is forgetting which deck you are looking at. Two mitigations:
`body.variant-on` paints an accent rail down the panel column, and the chip bar
prints the applied swaps inline underneath when a variant is active. It should
be impossible to misread a variant's numbers as the maindeck's.

**Sideboard card**, left column, under Decklist: parsed sideboard with a
`n/15` counter and legality flags, then the swap editor for the active variant —
one row per swap, `out` chosen from a maindeck dropdown, `in` from a sideboard
dropdown, plus a quantity. Dropdowns rather than free text: they make "the card
coming in must be in the sideboard" structurally true instead of validated after
the fact, and they remove typo-driven breakage entirely. A live `net 0 ✓`
readout sits under the rows.

**Compare tab**, added between Goldfish and Method:

1. *Regression callout* — the headline. "vs Control drops you to 12 black
   sources for a card that needs 14" or "nothing breaks".
2. *Matrix* — rows are metrics grouped (Shape · Mana base · Colours · Payoffs),
   columns are Maindeck (baseline, pinned) then each variant showing value + Δ.
   Broken variants show their error here instead of numbers.
3. *Colour rows* carry a small surplus bar (have vs need) reusing the existing
   bar idiom, because "14 of 16" means more as a length than as a fraction.
4. *Curve small multiples* — one eight-bar sparkline per variant with the
   baseline drawn behind it as a ghost outline. Small multiples beat a grouped
   bar chart past three series, and the ghost makes the comparison local instead
   of forcing an eye-track to a legend.
5. *Goldfish comparison* behind a button, never on a keystroke, with the noise
   band applied.

Empty states follow the existing `empty()` convention: with no sideboard, the
Compare tab explains what it will show and how to get there.

## Code layout

Two new banner sections. `tests/extract.js` slices on banners, so `SECTIONS`
must be updated in the same commit — the slice before each new banner has to be
re-pointed or it swallows the new code.

```
MATH CORE
PARSING
SIDEBOARD    ← new: splitList, parseDeck, applyVariant, legality
ANALYSIS     ← becomes pure and therefore testable for the first time
DIG PAYOFFS
GOLDFISH
COMPARE      ← new: variantMetrics, comparison view builders, CRN runner
RENDER
PERSISTENCE
SCRYFALL
WIRING
```

`analyse()` currently reads six values straight out of the DOM, which is why the
ANALYSIS slice has never been under test. It splits into:

- `readInputs()` — the only DOM contact, in RENDER's orbit
- `analyseCards(cards, unknown, opts)` — pure, the whole existing body
- `analyse(input)` — parse then analyse; `input` defaults to `readInputs()`
- `analyseVariant(input, variant)` — parse, apply swaps, analyse

Comparison view builders return strings and live in COMPARE, not RENDER, for the
same reason `gfBulkHTML` does: a broken template literal does not throw, it
renders the word `undefined` inside a percentage, and only a test that regexes
the output will ever notice.

## Test plan

- `tests/sideboard.test.js` — header forms, `SB:` lines, the folded-sideboard
  regression, swap application, every problem level, clone isolation
- `tests/analysis.test.js` — `analyse` purity (same input, same output, no DOM),
  and the known figures from the existing example deck
- `tests/compare.test.js` — metric extraction, per-metric direction, CRN
  determinism (same seed ⇒ identical stats), the noise-band arithmetic, and an
  `undefined`/`NaN` sweep over every rendered comparison cell
- `tests/persistence.test.js` — variant round-trip, pre-variant build migration,
  malformed-variant rejection on import

## Build order

1. SIDEBOARD section + `extract.js` SECTIONS + tests → green
2. `analyse()` purity refactor + analysis tests → green
3. Persistence, schema 2, migration → green
4. COMPARE section, pure, fully tested before any markup exists
5. UI: sideboard card, chip bar, Compare tab, styles, empty states
6. Full suite, plus a headless smoke render of the new panel

## Explicitly out of scope

- Simulating actual sideboarding decisions (which cards you'd draw first)
- Matchup win rates — the tool models mana, not gameplay
- More than one sideboard per build
- Best-of-one / companion sideboard rules beyond the 15-card count
