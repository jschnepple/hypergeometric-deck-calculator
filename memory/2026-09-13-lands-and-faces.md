# Session 7 — the land count that lost eight lands, and the colour a deck does not play

Jeff loaded a second real decklist — "Izzet Whizz", a 60-card Izzet wizards brew —
and the Verdict tab opened with two confident, wrong sentences. Both turned out to
be a *different* bug from the one the panel blamed.

## What he saw

```
Land count 12 is 9 below the 21 your 1.33 average mana value implies.
Blue:  3.802638647696905 sources, need 14 … 10.197361352303094 short.
Black: 0 sources, need 13 for callous sell-sword on curve — 13 short.
Red:   10 sources, need 18 … 8 short.
Your colour requirements total 45 sources but 12 lands can supply at most 24
  even if every single land were a dual. This mana base is not buildable.
```

The deck has **20 lands** and plays **no black**.

## Bug 1 — eight lands became eight colourless nonland 0-drops

The Unresolved panel named two entries: `islands` (×5) and `spyrebluff canal` (×3).
Eight cards. 20 − 8 = 12, the reported land count. The mana curve showed **8 cards
in the MV-0 column** — the same eight — under a panel that said in as many words
that unresolved cards were "excluded from every calculation."

They were not. Two independent failures, stacked:

**1a. The resolution tiers could not take a pluralised basic.** Verified live
against the API, not assumed:

| name | collection (exact) | `!"name"` search | `named?fuzzy=` |
|---|---|---|---|
| `islands` | not_found | *no cards matched* | → `Island` |
| `spyrebluff canal` | not_found | *no cards matched* | → `Spirebluff Canal` |

Only the **fuzzy** tier finds either, and fuzzy is a GUESS: session six deliberately
made it offer a button rather than apply itself, which is right and stays. But
`5 Islands` is not a guess. Nobody has ever meant anything else by it, and
hand-typed lists are full of it. So there is now a fourth resolution path,
`basicAlias`, sitting *with the exact tiers* rather than in the guessing pass —
plurals and `Snow-Covered` forms of the six basics, and nothing else. The
misspelling still goes to the suggestion dialog, because that one really is a guess.

`lookup()` also had to ask Scryfall for the canonical name: `dbLookup` can fold
"islands" onto an Island record, but only once one is *in* the DB, and a deck
naming no Island would never put one there.

**1b. `analyseCards` was the one caller that never skipped unknowns.** The house
rule was already written in CLAUDE.md — "callers must skip `unknown` cards
themselves", which `evalPayoff` and `goalSets` do. `analyseCards` partitioned on
`c.land` alone, and `parseList` gives an unresolved card `land:false, cmc:0`. So
every unresolved card fell into `spells`: counted, curved at mana value 0,
averaged. Spells read 48 instead of 40; average mana value 1.33 instead of 1.60;
the land recommendation was regressed off that depressed average.

Now: `total` keeps them, because they really do fill library slots; **neither
partition** does. `landCount + spellCount` is therefore legitimately less than
`total` whenever anything is unresolved, so Deck at a Glance grows an
**Unresolved** row and the conflict report *leads* with the caveat instead of
burying it under a land-count verdict derived from the very gap it describes.

## Bug 2 — an Izzet deck told it was 13 black sources short

`2 callous sell-sword` is in the deck for exactly one reason: the Adventure half,
**Burn Together**, is a red removal spell. The creature half is never cast on
purpose. Scryfall:

```
layout:    adventure
mana_cost: "{1}{B} // {R}"      <- the two costs CONCATENATED
cmc:       2
faces:     Callous Sell-Sword {1}{B}  |  Burn Together {R}
```

`parseCost` reads every symbol in that string, so one phantom spell costing
`{1}{B}{R}` came out the other side, and the colour table dutifully demanded 13
black sources. This is the "split-card pips summed" line that had been sitting in
the Method tab's known limitations since session one; a real deck finally made it
expensive.

Two changes, and the second is the one worth remembering:

- **`reqFaces` + `faceViews`: colour requirements are measured one face at a
  time.** You cast one side or the other and never both at once, so summing their
  pips invents a spell needing every colour on the card simultaneously. This
  applies with or without an explicit choice — it is not a preference, it is the
  correct reading. `faceViews` returns exactly one view for an ordinary card, so
  nothing else in the tool changed shape.
- **A deck can say which half it casts**: `[face:main]` / `[face:adventure]`
  inline, or the new Two-faced cards panel. The unchosen half leaves *everything*
  — pips, mana value, cost, type line.

With `[face:adventure]` on Jeff's deck: black requirement gone, the card curves at
MV 1 instead of 2, average mana value 1.60 → 1.55, recommended lands 22 → 21.

**Scope, deliberately narrow.** Only `adventure`, `split`, and modal DFCs whose
back is *not* a land. A transform card's back face is never cast. An MDFC land is
already modelled by `mdfcLand` and Karsten's −0.74/−0.38 term, and letting it also
be "a choice of two spells" would put two parts of the tool back into disagreement
about one card — the exact failure the front-face type-line rules exist to stop.

**The face picker writes into the decklist text, not into build state.** Same call
`renameInList` makes. The textarea is what gets exported, imported, pasted into
another build and re-read by the sideboard and variant paths; a choice recorded
anywhere else quietly disappears down one of them. It cost a schema bump and got
sideboard-, variant- and export-compatibility for free.

## Smaller things fixed on the way

- **A conditional dual contributes a *fraction* of a source** — that is the whole
  point of the Verge weighting — so `have` and the shortfall are floats, and the
  conflict report was interpolating them raw: `3.802638647696905 sources`. Rounded
  for display only; the comparison stays exact. A shortfall under a tenth of a
  source is now a rounding artefact and is not reported.
- **The report was quoting the decklist back at you** — "need 14 for wild ride on
  curve". `cardRecord` now carries `displayName` (the oracle name) alongside the
  typed name, which `renameInList` still needs to find the line. For a two-faced
  card the *face* name wins over both, which is the point: "need 13 for
  **Burn Together**" says which half is asking.

## Verification

- 1209 → **1302 tests** (1441 with jsdom), all green. New `tests/faces.test.js`
  (93) plus 24 in `dom.test.js`, which now clicks the face picker and asserts the
  black requirement disappears from the rendered conflict report.
- Jeff's actual 60-card list run end to end against the **live** Scryfall API:
  20 lands, 40 spells, 0 unresolved, avg MV 1.60, `landCount + spellCount +
  unknownCount === total`, and with the typo left in, 17/40/3 — still summing to 60.
- Two of my own test assertions were wrong before the code was: a collision test
  that went down the exact-match tier and never reached the fold, and `\b` after a
  number in `"Spells32Unresolved4"`, where the boundary is against a letter. Fixed
  the tests, per the house rule.
- jsdom cannot be installed on the machine this ran from, so the DOM layer was run
  in a container against a staged copy. Worth knowing: **Scryfall rejects a default
  HTTP-library User-Agent with a 400**, so any node-side harness hitting the API
  needs a custom one. The browser is unaffected.

## Still open

- The suggestion dialog is the only thing standing between a *typo* and a wrong
  land count, and it is dismissible. A misspelled land is still silently a
  non-land until you accept the suggestion — the new Unresolved row and the
  leading caveat make that visible, but they do not make it hard to ignore.
- `[face:...]` on a card with no second face is accepted and does nothing.
- Mana rocks and dorks still uncounted; X spells still read as mana value 0.
