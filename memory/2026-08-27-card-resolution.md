# Session 6b — card resolution, and a warning you cannot scroll past

Reported by Jeff against one decklist: three cards unrecognised, and the notice
saying so "too discrete". Two of the three turned out to have nothing to do with
the cause anyone assumed, including him and including me before I checked.

1176 tests green without jsdom, 1287 with it.

## The reported symptom

> 3 card(s) not recognised. They are excluded from every calculation.
> · Dain's Company · Kili the Resourceful · Giantcraft Helm

The stated diagnosis was that the first two contain characters nobody types
(`Dáin`, `Kíli`) and the third is an Arena-only rename. Half right, and the
wrong half is the interesting one.

## What was actually wrong

**Scryfall already folds diacritics. The tool lost the cards afterwards.**

I asked the live collection endpoint for `Dain's Company` and `Kili the
Resourceful`, no accents, and it returned both cards happily. So the lookup
never failed. What failed is what happened next:

```
lookup()    →  DB["dáin's company"] = record     // Scryfall's canonical name
parseList() →  DB["dain's company"]              // what the user typed
```

The record was fetched, stored, and instantly unreachable. Every accented card
in Magic is affected — Lótus Petal, Jötun Grunt, Æther Vial — and the tool's own
error message blamed the user for a spelling Scryfall had accepted.

This is the same shape as the eight bugs from session five and the three from
the review earlier today: **two functions, each individually correct,
disagreeing about a key.** Nothing threw, nothing looked wrong, and the unit
tests could not see it because neither function is wrong on its own.

**Giantcraft Helm was real, and bigger than one card.** It is not an oracle
name. Through the Omenpaths #167 has `name: "Doc Ock's Tentacles"` and
`printed_name: "Giantcraft Helm"` — a field the tool had never read, and one I
had assumed was for non-English printings only. It is populated on an `en` card
here. **138 of the first 175 cards in that set are renamed the same way**, so an
Arena decklist from that set was almost entirely unresolvable.

The collection endpoint does not match printed names. Scryfall's *search* index
does: `!"Giantcraft Helm"` returns exactly one card.

## What shipped

**`foldKey` and a derived fold index.** Diacritics, curly apostrophes, dashes
and ligatures (`Æther`/`Aether` fold together; NFD will not decompose a
ligature). `dbLookup` tries the exact key first, so the fold can only ever
rescue a miss and never redirect a name that already resolved.

The index is **derived from DB and memoised on identity**, like
`parseDeckCached`, rather than stored alongside it. DB is what travels through
localStorage, export and import; a parallel structure would need rebuilding on
every one of those paths, and the one path someone forgets is the one that
silently stops resolving accents.

**Folded collisions are refused.** Two different cards wanting one folded key
empty the slot rather than resolving to whichever was indexed last. Both still
resolve by their exact spellings. Resolving a correctly-spelled name to an
arbitrary one of two cards is the confident-wrong-answer this codebase keeps
meeting.

**Three lookup tiers, and they are not interchangeable:**

| tier | endpoint | exact? | applied? |
|---|---|---|---|
| 1 | `/cards/collection` | yes, folds accents | silently |
| 2 | `/cards/search?q=!"name"` | yes, matches printed names | applied **and reported** |
| 3 | `/cards/named?fuzzy=` | **no — a guess** | never; offered with a button |

Tier 2 is not a guess: one result is Scryfall stating that this printed name
belongs to that card, and for everything this tool computes the two *are* the
same card. More than one result is ambiguous and refused. Tier 3 is a guess and
is treated like one — Jeff chose this explicitly when asked, and it is the same
rule as refusing a half-applied variant swap or an unfinished goal.

**The warning is no longer something you scroll past.** A strip above the tabs
whenever anything is unresolved, and a dialog after a lookup. The dialog exists
because the old message could not distinguish four different situations that
need four different sentences: resolved under another name (informational),
a guess awaiting one click, ambiguous, and genuinely missing. Lumping them into
"3 cards not recognised" is precisely what made two self-fixable problems look
like user error.

Every message states the **consequence** rather than the count. "3 cards
unresolved" is a fact nobody acts on; "excluded from every figure on this page,
so all of them are understated" is.

## The refactor that came free

`cardRecord` moved out of `SCRYFALL` into `PARSING`. That section touches the
network, so `tests/extract.js` cannot reach it — which meant the DB-record
construction had **never been under test**, including the front-face type-line
rule that three separate bugs have now turned on. It is tested now, and
`SCRYFALL` is down to the three fetches and the report they build.

This is the house rule ("logic that needs a regression test belongs in PARSING")
paying out for the second time; making `analyse()` pure in session five was the
first.

## Verified live, not assumed

Every claim above about Scryfall's data was checked against `api.scryfall.com`
in a browser during this session, because the house rule is that nine of the
first eleven bugs in this project came from a plausible assumption about a card
or about Scryfall's data shape. The fixtures in `tests/resolve.test.js` are the
real payloads, trimmed. The final check ran all three tiers over Jeff's actual
four names:

```
tier 1 resolved:  Dain's Company, Kili the Resourceful
tier 2 resolved:  Giantcraft Helm  →  Doc Ock's Tentacles (OM1)
tier 3 suggested: Lightnig Bolt    →  Lightning Bolt      (not applied)
```

## Bugs found by writing the tests

1. **The unresolved banner reads the VIEWED deck**, so a broken variant shows no
   banner — its analysis shape is empty. Correct, and consistent with every
   other panel, but it caught a test that had assumed otherwise.
2. **A test that appends to the demo list appends to the SIDEBOARD**, because
   the list ends with a `Sideboard` block. `A.unknown` is the maindeck's list
   and correctly ignored it. The test was wrong; `splitList` was right.

## Left undone

- `file://` will not load in the Chrome extension, so the page itself still has
  never been rendered by the agent. The frontier SVG from earlier today remains
  unverified by eye, and so does this dialog's layout.
- The dialog is not keyboard-trapped. Escape, the X and the backdrop all close
  it, but focus is not cycled inside it.
- Tier 3 costs one request per unresolved name at 120ms apart. A decklist with
  forty typos would sit there for five seconds. Nobody has such a decklist, but
  the cap is worth adding before someone pastes a CSV by mistake.
- `printed_name` is now indexed, which means a foreign-language decklist
  partially resolves. That is untested and unclaimed — the parser's quantity
  regex and the `Sideboard` header matching are both English-shaped.
