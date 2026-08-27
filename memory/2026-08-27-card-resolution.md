# Session 6b — card resolution, and a warning you cannot scroll past

Reported by Jeff against one decklist: three cards unrecognised, and the notice
saying so "too discrete". Two of the three turned out to have nothing to do with
the cause anyone assumed, including him and including me before I checked.

1209 tests green without jsdom, 1324 with it.

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

## The review round, which caught a showstopper

Green at 1176 tests including a jsdom run that drove the whole dialog, and an
adversarial read of the diff found **five real bugs and five smaller things**.
One of them would have shipped a completely unusable page.

1. **The dialog was visible on load and could not be closed.** `.hide` is
   `display:none` at specificity (0,0,1,0); `.rmodal{display:flex}` is declared
   310 lines later at the *same* specificity, so `class="rmodal hide"` computed
   to `flex`. A fixed, full-viewport, 62%-opaque blurred overlay covered the app
   from first paint, and `closeResolveDialog()` added a class that did nothing.

   **Every visibility test passed**, because they all asserted
   `classList.contains('hide')` — the test and the stylesheet disagreed about
   what "hidden" means and only the stylesheet talks to the user. `#rmodal` is
   the first element in the file to combine `.hide` with a class that sets
   `display`, so nothing had needed the guard before. There is now a boot check
   that sweeps every `.hide` element for a computed `display:none`.

2. **One rate limit made the tool announce a real deck as entirely missing.**
   The 429 `break` exited only pass 1; execution fell into passes 2 and 3, which
   fire one request per card — all also rate-limited — and pass 3 pushed every
   failure into `missing`. The dialog then said "Not found — 47 cards, excluded
   from every calculation" about a perfectly good sixty. `report.halted` now
   stops the remaining passes and says the run could not finish; `missing` is
   assembled at the end from what is genuinely still unresolved.

3. **`!"name"` is not the single-result endpoint it looks like.** It matches
   faces too, so `!"Lightning Bolt"` returns two distinct oracle ids and was
   refused as ambiguous. `searchPrimaries` narrows to whole-name matches. Worth
   noting the reviewer's proposed fix — dropping `include_extras` — was
   *incomplete*: I checked it live and it takes three ids down to two, not one.
   The house rule paid out again; the fix that was verified is not the fix that
   was suggested.

4. **"Use this" was a no-op on MTGO `SB:` lines, forever.** `splitList` strips
   the prefix before `parseList`, so the card parses and gets a suggestion, but
   `renameInList` reads the raw text where the prefix is still there and
   `parseEntry` rejected it. The row could be clicked indefinitely.

5. **Accepting one of several suggestions left it rewritten but unresolved** —
   the re-lookup ran only when it was the last one, so the line ended up
   correctly spelled and still unknown, with the banner blaming it. The comment
   claimed the behaviour the code did not have.

Plus: the fold index's collision guard compared object identity, which the
localStorage round trip breaks (it compares oracle ids now); `renameInList`
searched from index 0 and could rewrite a quantity; `dbLookup` read through
`Object.prototype`; the button label was corruptible by the new callers; and
fuzzy returning the name you typed — Scryfall *confirming* the card — was filed
under "not found".

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
