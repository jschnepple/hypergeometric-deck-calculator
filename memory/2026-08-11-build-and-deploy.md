# 2026-08-11 — Built the calculator end to end, prepared for deploy

First session on this project. Went from "propose a plan" to a deployable,
tested tool in one sitting.

## What shipped

- `index.html` — the whole application, ~65KB, no dependencies
- `README.md` — user docs, decklist format, deploy steps, privacy, credits
- `tests/` — 152 tests across 5 files, zero dependencies
- `CLAUDE.md`, `MEMORY.md`, `memory/` — project conventions

Six panels: Verdict (conflict report), Land Count, Color Requirements, Mana Curve,
How Many Copies, Payoffs, plus a Method tab documenting the derivation and limits.

## The central finding

Karsten's colored-source table cannot be reproduced by the obvious hypergeometric
setup. The naive question — "P(≥2 white sources among the 9 cards seen by turn 3)"
— yields **22** sources for a double pip; Karsten publishes **18**.

The naive model double-counts failure: it fails you both when you are colour-screwed
*and* when you simply did not have three lands. Karsten conditions on having made
your land drops and measures colour screw **given** you were not mana screwed —
land count being a separate problem, solved by the regression.

Re-derived the whole table by Monte Carlo (London mulligan, conditioned on ≥N lands).
It reproduces the published anchors **exactly** at turns 1–2 (14 for a single pip on
T1, 20 for a double pip on T2) and sits 1–3 low at later turns. Mean absolute error
vs published: **1.12 conditional, 7.61 unconditional**.

Decisive proof the conditioning is required: the unconditional model **saturates** —
no number of sources reaches 90% for a five-drop, because with 24 lands you cannot
reliably have five lands on turn five at all. The unconditional question has no answer.

Because the simulation sits at or just below Karsten everywhere, the tool shows both
as a band and **recommends the higher**. A mana base one source too rich costs almost
nothing; one source too thin costs games.

## Two real bugs found

**1. Verges counted as full duals.** Scryfall's `produced_mana` lists *both* colours
for a Verge with no signal about which is conditional, so each Verge was inflating the
off-colour by a full source. Now parses oracle text (first `{T}: Add` line is the
unconditional colour) and discounts the off-colour by P(controlling an enabling basic
land type). Detector traps, both real: the article varies (`an Island` vs `a Swamp`,
breaking a naive regex on 4 of 10 cards) and basic-type order flips between Duskmourn
and Aetherdrift, so clause position does not encode which colour is conditional.

**2. Enablers double-counted.** Found because Jeff asked me to double-check the Verge
rules. Enablers were tallied per type then summed, so a land carrying *both* required
types (Blood Crypt is `Land — Swamp Mountain`) counted twice — 4 Blood Crypt read as 8
enablers. Overstated a Verge's off-colour by ~4.4pp, worst precisely in the dual-heavy
manabases where Verges are most attractive. Now counted per permanent.

## Card text correction

Jeff described United Battlefront as finding "noncreature, nonland cards with mana
value 3 or less". The actual text says **permanent** cards — so instants and sorceries
are not hits. Materially changes the hit count. Also: Getaway Barrel is `{3}{R}`, MV 4,
so **United Battlefront cannot find Getaway Barrels**.

## The payoff insight

Jeff framed the United Battlefront / Getaway Barrel tension as a two-way tug of war.
It is really three buckets: UB hits, Barrel hits, and **dead for both**. Trading
between the two hit buckets is roughly zero-sum; shrinking the dead bucket is not.
Barrel saturates fast (96.5% at 12 creatures, only +2.6pp going to 16) while UB's
full-value line is still climbing steeply at 16 hits. That asymmetry is the real lever.
The Tension panel breaks this out and names the non-land dead cards.

## Decisions

- **Stay single-file.** Explicitly considered converting to a real project and
  rejected it. See CLAUDE.md.
- **Two-layer persistence.** localStorage for autosave, `.json` export as the durable
  copy — `file://` origins are treated as opaque by Chrome and Safari and can silently
  drop storage. Hosting on Pages fixes this, but the export path stays.
- **Tests run against shipped `index.html`**, not copies, so they cannot drift.

## Verification

152 tests, all passing. Hypergeometric checked against exact BigInt rational
arithmetic across 288 cases (max error 9.3e-14). Payoff probabilities cross-checked
against a 200k-game Monte Carlo *that draws cards before digging*, confirming the
exchangeability argument — drawing 10 first leaves the odds unchanged (0.8156 vs
0.8162). Three test failures during the session turned out to be wrong test
constants or harness scoping, not product bugs; fixed the tests rather than
weakening them.

## Open for next time

**Jeff's actual decklist has still never been loaded.** Building generically first
was the right call, but the original goal — tune his brew — is untouched.
