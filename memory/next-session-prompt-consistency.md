---
name: next-session-prompt-consistency
description: Kickoff prompt for session 6 of the MTG deck calculator — the Consistency tab. User-defined deck goals evaluated exactly on the opening hand, the London mulligan chain in closed form, and a strictness-vs-cards frontier answering "how aggressively should I mulligan for this start".
metadata:
  type: project
---

# Next session — the Consistency tab

Status: **pending.** Written at the end of session 5. The design it implements is
`memory/plan-consistency.md`, which was written in answer to Jeff's own framing of
the problem and is the spec, not a suggestion. Paste the block below to start.

---

````
Consistency tab — deck goals and the mulligan frontier

GOAL

Give the calculator a notion of what a good opening hand is FOR A SPECIFIC PLAN,
and use it to answer the decision every deck actually makes before the game
starts: how hard should I dig for the start I want, and where does digging stop
being worth the cards it costs.

Two decks define the requirement, both Jeff's own. Boros Dwarves plays Leyline
Axe, which begins the game on the battlefield for free if it is in the opening
hand, alongside Dwarven Mauler which discounts the equip cost — one Axe is good,
two is better, and the whole deck is a question about how aggressively to mulligan
toward that. Gruul Delirium wants four card types available and wants to know how
quickly and how reliably it gets there. Both are the same question: I have a
definition of a good start, tell me how often I get it, what insisting on it
costs, and when to stop insisting.

Nothing in the tool answers this. The Goldfish tab scores hands against a fixed
general-purpose heuristic and reports the share you would ship; it has no concept
of a hand being good for a plan, and it deliberately does not simulate the
mulligan chain — a gap documented since session 4. Success is a new Consistency
tab that takes a user-defined goal, returns its exact probability, solves the
London mulligan chain in closed form, and plots the frontier of strictness
against expected cards — refusing, as the Compare tab already refuses, to name a
single best answer.

CONTEXT TO LOAD FIRST
Read in order:
  - CLAUDE.md — architecture, the single-file decision, the house rules, and the
    current state. The "Sideboards and variants" and "The Goldfish tab" sections
    are the two that matter most here.
  - memory/plan-consistency.md — THE SPEC. The abstraction, the exact math, the
    London insight, the delirium scoping call, and the open questions. Read it
    before writing a line of code.
  - memory/2026-08-12-goldfish.md — the on-curve conditional math, the disjoint
    partition technique this reuses, and the cross-validation pattern the new
    math must be held to.
  - memory/2026-08-19-sideboard.md — session 5. Especially the review section:
    eight bugs found in a green diff, every one in the seam between two
    individually correct functions.
  - MEMORY.md — the standing facts. Several of them are directly binding here.

KEY FILES TO READ FIRST
  - `index.html` — the entire application, organised by banner comments. Read
    MATH CORE, then GOLDFISH (for `pSourcesAndLands`, `expandDeck`, `runBulk`),
    then DIG PAYOFFS (for `matches()` and `PERM`), then COMPARE (for `esc`,
    `cmpTone`, the `.cbar` threshold bar, and the deterministic-vs-sampled
    treatment this feature copies).
  - `tests/extract.js` — the SECTIONS map. Adding a banner means editing it, and
    the slice BEFORE the new banner must be re-pointed or it silently swallows
    the new code.
  - `tests/goldfish.test.js` and `tests/compare.test.js` — the two closest
    precedents for what the new tests should look like.
  - `tests/dom.test.js` — the jsdom integration layer. It skips itself when jsdom
    is absent; `npm install jsdom` to run it.

══════════════════════════════════════════════════════════════════
TASK — 6 phases
══════════════════════════════════════════════════════════════════

PHASE 1 — GOALS section, exact hand probability
  Add a `GOALS` banner section between DIG PAYOFFS and GOLDFISH, and update
  SECTIONS in tests/extract.js in the same commit (re-point the DIG PAYOFFS slice
  to end at GOALS).

  A goal is `{id, name, clauses:[{set, n}]}` where a clause set is either a named
  card list or a filter reusing `matches()`. Implement:

    - `goalSets(goal, cards)` — resolve each clause to the set of deck cards it
      covers, with quantities.
    - `vennAtoms(sets, cards)` — partition every card into exactly one atom by
      which clause-sets it belongs to. This is the whole correctness story: a
      per-set partition double-counts an overlapping card, which is the same trap
      the Method tab documents for colour sources.
    - `pGoal(goal, cards, handSize)` — multivariate hypergeometric over the atoms,
      summing the cells that satisfy every clause. Exact. Return
      `{p, method:'exact', atoms:n}`.
    - A cost guard: if the atom enumeration exceeds budget, fall back to Monte
      Carlo over `dealInstance` and return `{p, method:'sampled', se}`. NEVER
      switch silently — the returned method drives how the UI labels it.

  Verify against `hyperAtLeast` on single-clause goals, which must agree to 1e-12.

PHASE 2 — the London mulligan chain
  In the same section:

    - `mulliganChain(p, maxMulls, handSize)` returning the distribution over
      where you stop: `P(stop at look j) = (1−p)^j · p` with hand size
      `handSize − j`, plus the forced-keep tail `(1−p)^(maxMulls+1)`, plus
      `pGoal` overall and `eCards`.

  The load-bearing insight, which belongs in a comment AND in the Method tab:
  under London you look at a fresh seven every time and bottom AFTER keeping, so
  `p` is identical at every mulligan and evaluating the goal on the seven you
  LOOK AT is correct. Under the old Vancouver rule it would have been wrong. A
  reader who has not thought this through will read it as a bug.

  Note the second-order effect in Method and do not model it: bottomed cards go
  to the bottom of the library and very slightly affect later draws.

PHASE 3 — the frontier
  `goalFrontier(goals, cards, handSize, maxMulls)` — for a family of policies from
  loosest to strictest, return `{label, p, eCards, pGoal}` points.

  Do NOT compute a best policy or a composite score. There is no defensible
  exchange rate between "has the Axe" and "has six cards instead of five". Name
  the knee of the curve and let the player choose — the same rule, for the same
  reason, as the Compare tab's refusal to rank variants.

PHASE 4 — cross-validate against the goldfish
  This is not optional and it is the phase that makes the math trustworthy.
  Deal hands with the existing seeded dealer, count how many satisfy each goal
  empirically, and assert the closed form sits inside the sampling error. Same
  independent-agreement pattern that validated the on-curve math in session 4 —
  hold it to the same standard, and if it fails, assume the closed form is wrong
  before assuming the simulation is.

PHASE 5 — UI
  New `Consistency` tab between Goldfish and Compare. Goal builder in the LEFT
  column under the Sideboard card, matching the swap-editor pattern — dropdowns
  over free text wherever the choice can be enumerated.

  Evaluate against the ACTIVE VARIANT via `analyseCards`, not just the maindeck: a
  sideboard plan that cuts the Axes should visibly move the frontier.

  Pure view builders go in GOALS, not RENDER, so extract.js can reach them — a
  broken template literal does not throw, it renders `undefined` inside a
  percentage. Empty states follow the existing `empty(title, body)` convention.

  Ship presets for "Leyline start" and "delirium types".

PHASE 6 — persistence, Method, docs
  Goals are per-build state: schema 3, with a `sanitizeGoals` mirroring
  `sanitizeVariants` (reserve valid ids before minting new ones — session 5 got
  that wrong in the first pass). Old builds must load unchanged.

  Method tab: the Venn-atom partition, the London insight, the exact-vs-sampled
  labelling, and the delirium scoping call below. Then update CLAUDE.md, write
  the session memory, update MEMORY.md.

CONSTRAINTS
  - Single file. No npm, no framework, no build step, no CDN. `index.html` IS the
    application. This was revisited and reaffirmed in the 2026-08-11 session.
  - `node tests/run-all.js` must stay green and dependency-free. 747 tests today,
    800 with jsdom installed. Run it after every edit to index.html.
  - Adding a banner section means editing SECTIONS in tests/extract.js, and
    re-pointing the slice before it. It will fail loudly if you forget, which is
    intentional.
  - Verify numbers, never recall them. Every Karsten figure in the tool was
    re-derived by simulation and cross-checked against exact rational arithmetic.
    Nine of the first eleven bugs came from plausible-looking assumptions.
  - Check card text against Scryfall before implementing any card's math.
  - When a test fails, work out whether the test or the code is wrong. Twice it
    was the test; fix the test rather than weakening the assertion.
  - `render()` rebuilds every panel with innerHTML on every keystroke, so CSS
    transitions never fire on anything it regenerates, and it must never call
    `renderGoldfish`. Any new panel that owns session state needs the same
    treatment — a `renderCompare()`-style early return when its tab is hidden.
  - No new colour values. Reuse solved tokens on surfaces no lighter than the one
    they were solved against; nested wells use the dark `--panel2` overlay.
  - User text rendered into markup goes through `esc()`.
  - The sandbox cannot install to /sessions (no space). Use
    `npm install --prefix /tmp/jd --cache /tmp/npmcache jsdom` and run with
    `NODE_PATH=/tmp/jd/node_modules`.

OUT OF SCOPE
  - Real delirium by turn N. It needs a play policy, self-mill modelling and
    fetch sequencing — the same machinery the "land drops are not sequenced" gap
    has been waiting on since session 4. Ship P(≥T distinct types in the opening
    hand) exactly, ship "distinct types SEEN by turn N" labelled explicitly as an
    upper bound, and document the rest as a known limitation. Do not ship an
    optimistic number with a confident label.
  - Sequenced land drops, and the London chain as a per-card bottoming simulation.
  - New payoff filter dimensions (types, subtypes, colours, named lists). Jeff
    reframed away from that; it is a separate arc.
  - Mobile layout, though the Compare matrix remains the widest thing in the app
    and the most likely to need it.
  - Any change to an existing analysis number. If one moves, that is a bug.

DEFINITION OF DONE
  - `node tests/run-all.js` passes with zero dependencies, test count > 747.
  - `NODE_PATH=/tmp/jd/node_modules node tests/run-all.js` passes, including
    dom.test.js driving the new tab with real clicks.
  - `pGoal` on a single-clause goal agrees with `hyperAtLeast` to 1e-12.
  - The Monte Carlo cross-check in Phase 4 puts the closed form inside the
    sampling band for at least three goals of different shapes, including one
    with overlapping clause sets.
  - A goal built from two overlapping sets returns a DIFFERENT and lower number
    than the naive per-set product, with a test asserting exactly that — it is
    the double-counting trap and it needs a regression test by name.
  - `mulliganChain` probabilities sum to 1 within 1e-12 for every maxMulls 0..4.
  - Every rendered cell of the new tab is swept for leaked `undefined` and `NaN`,
    as goldfishview.test.js and compare.test.js already do.
  - A build saved before this session loads with no goals and no errors.
  - The Method tab explains the Venn partition, the London insight, and the
    delirium limitation in the voice of the existing entries.
  - CLAUDE.md, MEMORY.md and a session memory are updated; the work is committed.
````
