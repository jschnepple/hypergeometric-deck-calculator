# Session 6 — deck goals, the London chain, and the Consistency tab

Planned in `memory/plan-consistency.md`, built in one session against the kickoff
prompt in `memory/next-session-prompt-consistency.md`. 1071 tests green without
jsdom, 1161 with it.

## What shipped

A **goal** is your own definition of a good opening hand — a conjunction of
clauses over the seven cards you look at. The Consistency tab reports its exact
probability, solves the London mulligan chain in closed form, and plots how hard
you dig against what digging costs you in cards.

- `GOALS` section between `DIG PAYOFFS` and `GOLDFISH`: `cardTypes`, `goalSets`,
  `vennAtoms`, `goalEnumerate`, `pGoal` / `pGoalCached` / `pGoalSampled`,
  `mulliganChain`, `goalFrontier`, `frontierKnee`, `pTypesSeenBy`, plus the
  state, presets and view builders
- `RENDER`: `renderGoalEditor`, `renderConsistency` — the second panel with a
  tab-hidden early return
- UI: a Consistency tab between Goldfish and Compare, a goal builder in the left
  column under the Sideboard card, schema-3 persistence with migration
- `tests/goals.test.js` (164), `tests/goalsview.test.js` (118), goal coverage in
  `persistence.test.js`, a consistency flow in `dom.test.js`, and two new
  `matches()` groups in `payoff.test.js`

## The load-bearing idea

**Partition on Venn atoms, not on clause sets.** Given the sets the clauses care
about, an atom is the group of cards belonging to precisely the same subset of
them. Atoms are disjoint by construction and sum back to the deck, so the
multivariate hypergeometric over them is exact.

Partitioning per set instead fails twice. It double-counts every card that is in
two sets — the same overlapping-category trap the Method tab already documents
for colour sources. And worse, it requires *distinct* cards for each clause, so
"at least one red card and at least one creature" silently becomes "two different
cards" and a red creature stops being able to do both jobs.

The sharpest expression of that, and the one now guarded by a test: when one
clause's set is a **subset** of another's, the conjunction collapses to the
smaller clause, so the answer has a closed form. Creatures ⊆ nonland permanents
gives exactly `hyperAtLeast(1, 20, 7, 60)` — matched to 1e-14 — while both naive
models sit measurably below it.

## The DoD line that was wrong, and why

The kickoff prompt asked for a test asserting that overlapping clause sets return
"a DIFFERENT and **lower** number than the naive per-set product". Lower is the
wrong direction for that case, and working out why is worth keeping:

- **Disjoint** clause sets compete for the same seven slots. The events are
  negatively correlated, so the exact joint is **below** the product. This is the
  Leyline goal — one Axe *and* two lands — and it is where "lower" is true.
- **Overlapping** clause sets are positively correlated, because one card can
  satisfy both. The exact joint is **above** the product.

Both are failures of the same assumption — that clauses are independent events —
and they have opposite signs. The test file asserts both, by name, rather than
picking whichever direction happened to be asserted. The prompt's DoD had merged
two different findings into one sentence.

## The London insight, which reads like a bug

Under the London rule you shuffle back and look at a fresh seven every time, and
bottom cards of your choosing **after** deciding to keep. Three consequences:

1. **Evaluating the goal on the seven you LOOK AT is correct.** You are not
   evaluating a five-card hand on the third mulligan; you are evaluating a seven
   you will then reduce to five by discarding its worst cards. Under Vancouver,
   where you were dealt one fewer card each time, this would have been wrong.
2. `p` is therefore identical at every mulligan, so the number of looks until
   success is plainly geometric and the whole chain solves in closed form.
3. **The cost of insisting is entirely card count**, which is what makes the
   frontier have exactly two axes.

Point 1 is stated in the code, in the Method tab and in CLAUDE.md, because a
reader who has not thought it through will read it as an off-by-one and "fix" it.

Deliberately not modelled and noted in Method: bottomed cards go to the bottom of
the library rather than back into a shuffled deck, which very slightly changes
later draws. It moves nothing at this resolution.

## Decisions worth keeping

**An unfinished goal is refused, not answered.** `goalIssues` separates `blocked`
— a named clause with no card chosen, do not evaluate — from `warn`, a complete
goal that happens to be impossible in this list and gets a real 0% with an
explanation. Printing a confident 0% for a goal the user has not finished writing
is the same failure mode as analysing a half-applied variant swap, and this
codebase keeps meeting that failure mode from new angles.

**The `Leyline start` preset ships with no card chosen.** The tool does not know
which card your deck's free start is, and guessing one would put a confident
number against a plan you did not write. It arrives blocked, and the dropdown is
populated from your own maindeck so it cannot name a card you do not run.

**No best policy, and no composite score.** `goalFrontier` returns points;
`frontierKnee` names the bend and says what the next step buys. There is no
defensible exchange rate between "has the Axe" and "has six cards instead of
five" — the same refusal, for the same reason, as the Compare tab's on variants.

**`method` is the label and it never switches quietly.** Over the enumeration
budget the figure is sampled and says so, with its standard error. `opts.budget`
exists purely so a test can force that path deterministically rather than hunting
for a pathological decklist — the fallback is otherwise unreachable in practice
and would have shipped untested.

**`maxMulls` is how long you insist, not the total.** Looks 0..M stop on success;
if look M fails you mulligan once more and keep whatever comes, at hand size
7−(M+1). Rather than document that parameter into the reader's head, the panel
prints the whole stop distribution — every row, including the forced keep. The
policy is easier to read off the table than off the parameter that generated it.

**`pGoalCached` keys on everything `pGoal` reads.** Quantities, names, type
lines, mana values, the parser's land verdict. A Scryfall lookup changes no name
and no quantity and changes every type line — a summary signature would have left
a stale figure on screen labelled current, which is exactly what session five's
compare-signature bug did.

## Bugs found by writing the tests

1. **`consistencyHTML` checked `A.total===0` before `A.broken`.** A broken variant
   carries the analysis shape *empty*, so its total is zero and the panel told you
   to paste a decklist you had already pasted. That empty-shape convention is a
   session-five decision, and this is the second panel to be caught by it — worth
   remembering that `total===0` is not a reliable test for "no deck".
2. **A `types` clause could keep a stale `sel`** through `sanitizeClause` if one
   arrived in a file, giving a clause whose printed description and whose maths
   disagreed. Dropped on the way in, and asserted.
3. **A test holding a DOM node across an edit stops testing.** `render()` rebuilds
   the builder wholesale, so a node captured before a change is detached and its
   events go nowhere — the assertion passed for the wrong reason until it was
   re-queried. Not a product bug, but the same class as a test that quietly
   asserts nothing.

## The review round, again the most valuable part

Session five's lesson held: the feature was green — 1016 tests, a jsdom run that
clicked the new tab from empty through a two-goal frontier — and an adversarial
read of the whole diff found **three more real bugs plus six smaller things**,
none of which any test was positioned to catch. Every one of the three lived in
the seam between `matches()`, which knows only a type line, and the rest of the
tool, which knows more.

1. **`matches()` and `cardTypes()` disagreed about what a land is.** An inline
   `[land:RG]` tag produces a card with **no type line** — the tag discards
   everything Scryfall would have known, and `land:true` is all that survives.
   `analyseCards` counted it in the land count, `cardTypes` called it a Land, and
   `matches()` said it was neither a land nor a permanent. So on any deck using
   the documented escape hatch, a "must be a land" clause returned a confident
   **exact 0%** three feet from a panel reporting 24 lands — and the *same* card
   also passed "must NOT be a land" and counted as a two-drop. `matches()` now
   falls back to the parser's own verdict when there is no type line.

   **This is the one existing figure that moves in this session.** It was
   measured rather than assumed: `analyseCards` and `evalPayoff` were run at
   `d9eadff` and at HEAD over a fixture holding resolved cards, four inline
   `[land:BR]` cards and four unresolved ones, and the outputs diffed. Total,
   land count, spell count, average mana value, the land recommendation, every
   colour source, every requirement, the curve, every driver row, and both
   shipped payoff presets are byte-identical. The single difference is a
   `land:'yes'` dig filter finding **24 hits instead of 20** — the four tagged
   lands the land count had been counting all along.
2. **Unresolved cards inflated goals, under a banner saying the opposite.** An
   unresolved card has no type line and no mana value, so `matches()` reads it as
   not-a-creature, not-a-land, not-a-permanent, MV 0 — it passes every *negative*
   filter and every `MV ≤ n` test. On a 60-card list with 24 unresolved cards the
   "two lands and a two-drop" preset read **85.6%** against a true **67.6%**,
   while the panel's own flag said the figures were *understated*. `evalPayoff`
   had always skipped `unknown`; `goalSets` had not. It does now, and they stay
   in the deck total, which makes the flag true.
3. **`vennAtoms` refusing was read as "the deck is empty".** `null` (more than 30
   sets, the mask would wrap) and `total === 0` shared a branch, so instead of
   falling back to sampling — which the function's own comment promised — `pGoal`
   returned an exact 0% "over 0 disjoint atoms of the 0-card list" for a
   sixty-card deck. A types clause contributes one set per card type, so five of
   them reaches it in a handful of clicks. The branches are separate now.

The smaller six, all fixed: three clamp mismatches where the live handler and
`sanitize*` bounded the same quantity differently (`mvVal`, clause count,
`glMulls`) so what you saved was not what you had been looking at; a goal naming
a card the deck no longer holds showing as unfinished in the builder and as a
confident 0% in the panel; `goalTypesHTML` answering only the first of several
types clauses; a `n = 0` clause flagged "cannot be met" beside a figure of 100%;
and `tweenNum` leaving the headline one render behind under
`prefers-reduced-motion` — pre-existing, shared with the payoff panel, and now
fixed for both.

The pattern to remember: **`matches()` is the tool's narrowest reader of a card.**
It sees a type line and a mana value and nothing else, and every one of these
bugs was a caller assuming it knew as much as `analyseCards` does. The next
feature that reuses it should check what it does with a card that has no type
line before, not after.

## Left undone

- **The frontier SVG has never been rendered by a browser.** It is the first
  chart here not built from divs, and `viewBox` scaling is precisely what jsdom
  does not model. Its markup is asserted — coordinates are real numbers, hues are
  solved tokens, one polyline per goal — but its *appearance* is unverified.
- **Delirium by turn N**, as scoped. Opening-hand type diversity is exact; types
  *seen* by a turn is an upper bound and labelled as one; real delirium waits on
  sequenced land drops, a play policy and self-mill.
- **Goals in the Compare tab**, which the plan raised as an open question. The
  maths is already variant-aware — the tab evaluates against `currentA()` — so
  only the presentation is missing.
- Clause vocabulary is `at least n from a set`. No "or", no "at most". Anything
  richer wants a language rather than two dropdowns.
- The goal builder is now the densest thing in a 400px column and has never been
  seen at a narrow width.
