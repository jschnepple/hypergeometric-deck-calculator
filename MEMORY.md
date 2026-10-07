# Memory index

Session memories for the MTG Deck Consistency Calculator, newest first.
Read `CLAUDE.md` first for current state and conventions.

| Date | File | Summary |
|---|---|---|
| 2026-10-07 | [type-selection](memory/2026-10-07-type-selection.md) | Dig payoffs can name specific types. A payoff carries `anyOf` — keys like `creature:Dwarf`, `sub:Equipment`, `type:Artifact`, ORed together and ANDed with the dropdowns — chosen from chips built out of the deck's own type lines. Motivated by Dáin's Company, whose real text is "a Dwarf or Equipment **card**", so the subtype matches and Kindred counts. Changelings are carried from Scryfall `keywords`; self-exclusion now folds the name; `addPayoff` clones the list. |
| 2026-09-13 | [lands-and-faces](memory/2026-09-13-lands-and-faces.md) | A second real decklist, two confident wrong verdicts, and in both cases a different bug from the one the panel blamed. A 20-land deck reported **12 lands**: `5 islands` and `3 spyrebluff canal` resolve only on the *fuzzy* tier, which is a guess and is deliberately never applied — and `analyseCards` turned out to be the one caller that never skipped `unknown` cards, so eight lands became eight colourless nonland 0-drops, counted as spells and curved at mana value 0 under a panel saying they were "excluded from every calculation". Fixed in two independent places: a pluralised basic now resolves **deterministically**, beside the exact tiers rather than in the guessing pass, and unresolved cards are now in neither partition with a row and a leading caveat saying so. Separately, an Izzet deck was told it was **13 black sources short**: Scryfall gives an Adventure its two costs *concatenated*, so `{1}{B} // {R}` summed into one phantom spell needing both colours at once. Colour requirements are now measured **one face at a time** — the correct reading whether or not you choose — and a deck can say which half it actually casts, inline or from a new panel, with the unchosen half leaving every calculation. The picker writes into the decklist text rather than build state, which is what makes it survive export, import and the variant paths. Also: fractional Verge sources were being printed raw (`3.802638647696905`), and the report was quoting the decklist back instead of naming the card. 1209 → 1302 tests, 1441 with jsdom. Verified end to end against the live API on Jeff's actual list. |
| 2026-08-27 | [card-resolution](memory/2026-08-27-card-resolution.md) | Three cards reported as unrecognised in one decklist; two of them had nothing to do with the assumed cause. **Scryfall already folds diacritics** — `Dain's Company` resolves fine — and the tool lost the card *after* a successful lookup, because `lookup` filed it under the canonical accented name and `parseList` asked for the typed one. Another seam, same family as session five's eight and this morning's three. `Giantcraft Helm` was real: it is `printed_name` on Through the Omenpaths #167, whose `name` is `Doc Ock's Tentacles`, and **138 of the first 175 cards in that set are renamed the same way**. Lookup is now three tiers — collection (exact, folds accents) → `!"name"` search (matches printed names, applied and reported) → fuzzy (a guess, offered with a button, never applied) — behind a dialog that distinguishes the four things that can happen instead of calling all of them "not recognised". `cardRecord` moved into PARSING on the way, putting the DB-record construction under test for the first time. Every Scryfall claim verified live against the API. 1071 → 1209 tests, 1324 with jsdom. An adversarial review of the finished green diff then found five more real bugs, one of them a showstopper: `.hide` loses the cascade to any later single-class rule that sets `display`, so the new dialog covered the whole page from first paint while every class-based test asserted it was hidden. |
| 2026-08-27 | [consistency](memory/2026-08-27-consistency.md) | Deck goals, the London mulligan chain, and the Consistency tab. A goal is your own definition of a good opening hand — a conjunction of clauses over the seven you *look at* — and its probability is an exact multivariate hypergeometric over a **Venn-atom partition**, because partitioning per clause set both double-counts overlapping cards and stops one card satisfying two clauses at once. London then makes the chain closed-form, and the reason reads like a bug until you see it: you bottom cards *after* keeping, so evaluating the goal on the seven you look at is correct and *p* is identical at every mulligan. Cross-validated against the goldfish's own seeded dealer for six goals of different shapes. Found that the kickoff prompt's DoD had merged two opposite findings into one sentence — disjoint clause sets land *below* the naive product, overlapping ones *above* it — and asserted both. Three bugs found by writing the tests, one of them the second panel to be caught by the empty-shape broken-variant convention. Then an adversarial review of the finished green diff found **three more real bugs plus six smaller things**, every one of them in the seam between `matches()` — which knows only a type line — and the rest of the tool, which knows more: an inline `[land:XY]` land that was not a land to a filter, unresolved cards *inflating* goals under a banner saying they understated them, and `vennAtoms` refusing being read as "the deck is empty". 747 → 1071 tests, 1161 with jsdom. |
| 2026-08-19 | [sideboard](memory/2026-08-19-sideboard.md) | Sideboards, named sideboard variants, and the Compare tab. A variant is a live **diff** against the maindeck, not a copy, so it follows the deck as you tune it; a stale swap marks the variant broken rather than half-applying. Found a live bug on the way — `parseList` skipped the `Sideboard` header and kept parsing, so every pasted export had its sideboard folded into the maindeck. Made `analyse()` pure to get there, which finally put the ANALYSIS section under test. The comparison separates exact figures from sampled ones, gives the sampled ones common random numbers and an explicit noise band, and refuses to invent a "best variant" score. 445 → 747 tests, plus a first-of-its-kind jsdom test that boots the real page and clicks through it. An adversarial review of the finished, all-green diff then found eight more bugs, every one of them living in the *seam* between two individually-correct functions. |
| 2026-08-12 | [goldfish](memory/2026-08-12-goldfish.md) | The opening-hand simulator. Seeded per-hand shuffles, keepability scored on the play and on the draw, drill-in with card-by-card draws and live conditional odds. Defined the on-curve probability that the tool never actually had — `P(hold) × P(lands) × P(colours\|lands)`, the last computed exactly and divided back out to avoid double-counting the land requirement. Feeding `DERIVED`'s own source counts back through it returns 0.88–0.94 flat across the grid: closed form and Monte Carlo agreeing independently. Found two real scorecard bugs (one-land hands kept 79% of the time) and four test bugs. 221 → 445 tests. |
| 2026-08-11 | [glassmorphism-overhaul](memory/2026-08-11-glassmorphism-overhaul.md) | The visual pass. Token system, three-elevation glass over a fixed bloom backdrop, motion built to survive a per-keystroke `innerHTML` rebuild, contrast solved numerically rather than by eye. Functionality untouched, 221 tests green throughout. Two findings that will bite anyone who forgets them: nested surfaces need a *dark* overlay, and CSS transitions are dead code on elements this app recreates every keystroke. |
| 2026-08-11 | [first-real-decklist](memory/2026-08-11-first-real-decklist.md) | Recovered the project into git and pushed it, then loaded Jeff's Barrel Boys brew — the first real decklist. That alone found **seven** bugs: lands counted as ramp/draw, shocklands read as tapped, split/DFC cards failing Scryfall lookup entirely, MDFC lands counted as lands, fetchlands contributing zero colour, restricted-use mana counted as unrestricted, and MDFC type lines leaking the back face. All fixed; 152 → 221 tests. |
| 2026-08-11 | [build-and-deploy](memory/2026-08-11-build-and-deploy.md) | Built the whole tool: Karsten math re-derived by simulation, six analysis panels, Verge handling, dig payoffs, two-layer persistence, 152-test suite, deploy-ready repo. Found two real bugs (Verges counted as full duals; enablers double-counted) and one card-text error (United Battlefront finds *permanents* only). |

## Next intent

**Nothing is queued.** Session 7 was reactive — a real decklist, two wrong
verdicts, two root causes a layer below them. Candidates, in rough order of value:

- **The dismissible-suggestion gap.** A misspelled land is still silently a
  non-land until the suggestion is accepted, and the dialog can be dismissed.
  Session 7 made that visible (an Unresolved row, and the conflict report leading
  with the caveat) without making it hard to ignore. An unresolved line that
  *looks* like a land may deserve stronger treatment than an unresolved spell.

- **Mobile layout.** Never looked at. The compare matrix is the widest thing in
  the app and the goal builder is now the densest thing in the 400px left column.
  The frontier SVG has also never been rendered by a real browser at any width —
  `viewBox` scaling is precisely what jsdom does not model.
- **Sequenced land drops**, so a tapland costs a turn. Still the largest modelling
  gap, and still the prerequisite for modelling real delirium rather than the
  upper bound the Consistency tab ships.
- **Goals in the Compare tab**, as a second row group — "what does this sideboard
  plan do to my Leyline start?". The plan raised it as an open question; the maths
  is already variant-aware, so only the presentation is missing.
- Card-name autocomplete, a sample-deck gallery, richer payoff filters, and the
  older gaps: mana rocks and dorks uncounted, X spells reading as MV 0,
  split-card pips summed.

- [next-session-prompt-consistency](memory/next-session-prompt-consistency.md) —
  **DONE**, session 6. Kept for the record. One line of its DoD turned out to be
  wrong — see the memory — and its test counts are now stale.
- [plan-consistency](memory/plan-consistency.md) — **DONE**, session 6. Kept
  because the agreed decisions and their reasoning are still the spec for that
  tab. Its three open questions were answered: goals ARE evaluated against the
  active variant automatically; showing them per-variant in Compare was deferred;
  and the hand-score heuristic was NOT added as a third frontier axis, because
  the chart's whole point is two clean quantities.
- [plan-sideboard](memory/plan-sideboard.md) — **DONE**, session 5. Kept because the
  agreed decisions and their reasoning are still the spec for that feature.
- [plan-goldfish](memory/plan-goldfish.md) — **DONE**, session 4. Kept because the
  agreed decisions and their reasoning are still the spec for that tab.
- [next-session-prompt-glassmorphism](memory/next-session-prompt-glassmorphism.md) —
  **DONE**, session 3. See the memory above.
- [next-session-prompt](memory/next-session-prompt.md) — **SUPERSEDED.** Kept for
  history; its test count and file inventory are stale.

## Standing facts

- The colour-source math is *conditional* hypergeometric, not the textbook kind.
  If a future change makes the numbers look "too high", re-read the Method tab
  before touching it — the naive model is a known trap.
- **Verify card oracle text against Scryfall before implementing any card's math.**
  Nine of the eleven bugs across both sessions came from trusting a plausible
  assumption about a card or about Scryfall's data shape.
- **Scryfall's data lies by omission in four specific ways**, all now handled and
  all worth remembering before adding a fifth: `produced_mana` lists conditional
  and restricted colours as if unconditional; fetchlands have no `produced_mana`
  at all; `type_line` on a double-faced card concatenates both faces, so any
  regex against it matches the back face too; and `name` is not the only name a
  card answers to — `printed_name` carries Arena renames and foreign printings,
  and the collection endpoint does not match it even though search does. All four
  were found by a real decklist rather than by reading the docs.
- **Scryfall folds diacritics for you; the DB has to fold them too.** The
  collection endpoint resolves "Dain's Company" perfectly. A card can therefore
  be fetched successfully and then be permanently unreachable, because it was
  filed under the accented name and looked up under the typed one. `foldKey` +
  `dbLookup` close that; exact keys still win, so the fold only rescues a miss.
- **A name a user typed and a name Scryfall returned are different strings**, and
  anything that keys on one must be reachable by the other.
- **`.hide` loses the cascade to any later single-class rule that sets
  `display`.** Equal specificity, later wins. A dialog shipped `class="rmodal
  hide"` computing to `display:flex` — a full-screen overlay from first paint —
  while every class-based test asserted it was hidden. **Assert computed style.**
- **A refusal and a legitimate zero must not share a branch**, and neither must
  "the network failed" and "your cards do not exist". One rate limit used to make
  the tool announce a real deck as entirely missing.
- The `SCRYFALL` section can't be reached by `tests/extract.js`. Logic that needs
  a regression test belongs in `PARSING`.
- **`render()` rebuilds every panel with `innerHTML` on every keystroke.** A CSS
  transition therefore never fires on anything it regenerates — the element the
  browser paints is always brand new and starts at its final value. Anything that
  must animate has to either persist across renders or be restored to its previous
  value and released (see the glassmorphism memory).
- **Inline `[land:XY]` tags override Scryfall entirely and discard `subtypes`,
  `verge`, `fetch`, `restriction` and `mdfcLand`.** They are an escape hatch for
  unresolvable cards, not normal practice — tagging a real land silently undoes
  the manabase fixes from session two.
- **The deck-level colour model is a THRESHOLD, not a probability.**
  `required()` vs `sourcesFor()` gives "need 18, have 14". The per-hand
  *probability* is a separate thing, added in session four and living in
  `GOLDFISH` as `onCurve`. Do not conflate them; the confusion is natural enough
  that it is what kicked off session four.
- **Goldfish probabilities read library COMPOSITION, never the shuffled order.**
  The order decides only which card Draw turns over. `libraryState()` enforces
  this structurally by subtracting known cards from the deck rather than reading
  the order's tail — keep it that way if a tutor or scry is ever added.
- **`render()` must never call `renderGoldfish`.** It rebuilds panels every
  keystroke and would wipe a drilled-in hand mid-draw. Its only goldfish job is
  `gfMarkStale()`.
- **Pure view builders belong in a testable slice.** `gfBulkHTML`/`gfDrillHTML`
  sit in `GOLDFISH` and the comparison builders in `COMPARE`, rather than in
  `RENDER`, for exactly this reason: a broken template literal does not throw, it
  renders `undefined` inside a percentage.
- **A sideboard variant is a DIFF against the maindeck, and a stale diff is
  refused, not half-applied.** `applyVariant` returns errors and the variant is
  marked broken. Half a swap gives a confident answer about a deck that does not
  exist, which is the failure mode this project keeps rediscovering.
- **Sampled figures never get coloured unless they clear their own noise band.**
  Variants are compared under common random numbers and any difference inside
  `2·√(SE₁²+SE₂²)` renders grey. Exact figures — curve, sources, land count,
  payoff odds — carry no such caveat, and the Compare tab keeps the two kinds of
  number visually distinct on purpose.
- **`extract.js` slices on banner comments, so adding a section means editing
  `SECTIONS`.** The slice *before* the new banner has to be re-pointed to end at
  it, or it silently swallows everything you just added. `SIDEBOARD` and
  `COMPARE` were added this way in session five.
- **Overlapping clause sets need a VENN partition, not a per-set one.** Every
  card belongs to exactly one atom — the group sharing its full membership
  signature. Partitioning per set both double-counts an overlapping card and
  requires *distinct* cards for each clause, so a red creature stops being able
  to satisfy "a red card" and "a creature" at once. Same family as the colour
  source trap, and easy to reintroduce the next time two categories overlap.
- **Clauses are not independent events, and the error has two signs.** Disjoint
  sets compete for the seven slots, so the exact joint is BELOW the product of
  the clauses taken separately; overlapping sets are positively correlated and
  land ABOVE it. Multiplying two probabilities together asserts independence in
  both cases and is wrong in both.
- **Under London you bottom AFTER keeping, so evaluating a goal on the seven you
  LOOK AT is correct.** `p` is therefore the same at every mulligan and the chain
  is geometric in closed form. Under the old Vancouver rule this would have been
  wrong, which is why it reads like an off-by-one to anyone who has not thought
  it through — do not "fix" it.
- **`matches()` is the tool's NARROWEST reader of a card** — a type line and a
  mana value, nothing else. It falls back to `card.land` when there is no type
  line (an inline `[land:XY]` tag has none), and every caller must skip `unknown`
  cards itself, because an unresolved card passes every NEGATIVE filter and every
  "MV ≤ n" test. Both rules exist because a caller assumed it knew as much as
  `analyseCards` does. Check what it does with a type-line-less card BEFORE
  reusing it, not after.
- **`total===0` is not a reliable test for "no deck".** A broken variant carries
  the analysis SHAPE, empty, so it has total zero and any check that reaches the
  empty state first tells the user to paste a list they already pasted. Two
  panels have been caught by this now; check `broken` first.
- **An unfinished input is refused, not answered.** A half-applied variant swap,
  a goal clause with no card chosen — both get an explanation rather than a
  confident number. Plausible-looking wrong answers are the failure this codebase
  keeps rediscovering, and refusing is cheaper than being subtly wrong.
- **A refusal and a legitimate zero must not share a branch.** `vennAtoms`
  returning null means "I cannot answer this"; `total===0` means "the answer is
  zero". Merging them printed a confident exact 0% for a sixty-card deck.
- **Every live handler clamps to the same range its `sanitize*` does.** A number
  input's `max` is not enforced for a typed value, so a looser handler means the
  figure on screen and the figure after a reload differ with nothing to explain
  it. Three of these shipped in session six and were caught in review.
- **A test holding a DOM node across an edit stops testing.** `render()` rebuilds
  panels wholesale, so a node captured before a change is detached and the events
  fired at it go nowhere. Re-query after every interaction in `dom.test.js`.
- **Green is not finished — read the diff adversarially before wrapping up.**
  Session five's feature passed 703 tests including a jsdom run that clicked
  through the whole flow, and a review of the diff still found eight real bugs.
  All eight sat in the *seam* between two functions that were each individually
  correct and individually tested: one call site updated and another missed, a
  signature that summarised away what it needed to detect, a figure computed by
  one expression and applied by another. Unit tests are structurally blind to
  that class.
- **Commit before wrapping up.** Session one didn't, and session two opened with a
  recovery operation from a previous session's scratch directory.
