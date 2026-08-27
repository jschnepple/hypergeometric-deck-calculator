---
name: plan-consistency
description: Design for the Consistency tab — user-defined deck goals evaluated exactly on the opening hand, the London mulligan chain solved in closed form, and a strictness-vs-cards frontier that answers "how aggressively should I mulligan for this".
metadata:
  type: project
---

# Plan — the Consistency tab (goals and mulligan policy)

Status: **proposed, not yet agreed.** Written at the end of session 5, in answer
to Jeff's question: *"how would you suggest we implement this?"*

## What Jeff actually asked for

Not more payoff filters. Two worked examples, both of which are the same question
wearing different clothes:

**Gruul Delirium.** How quickly and consistently do I turn delirium on? What do
the best opening hands look like? How many mulligans should I be willing to take
to find one?

**Boros Dwarves.** Leyline Axe starts on the battlefield for free if it is in the
opening hand, and Dwarven Mauler discounts the equip cost. One Axe is good, two is
better. So: how hard do I dig for that start before the card loss stops being
worth it?

Both are the same shape. *I have a definition of a good start. Tell me how often
I get it, what it costs me to insist on it, and where to stop insisting.*

Nothing in the tool answers that today. The Goldfish tab scores hands against a
fixed five-component heuristic — a general-purpose "is this keepable" — and
reports the share you would ship. It has no notion of a hand being good *for a
specific plan*, and it explicitly does not simulate the mulligan chain (a
documented gap since session 4).

## The abstraction

**A goal is a conjunction of clauses over the opening hand**, where each clause
is *at least n cards from set S*.

```
Boros Dwarves:   ≥1 {Leyline Axe} AND ≥2 lands
Better:          ≥2 {Leyline Axe} AND ≥2 lands
Best:            ≥1 {Leyline Axe} AND ≥1 {Dwarven Mauler} AND ≥2 lands
Delirium:        ≥3 distinct card types AND ≥2 lands
```

Sets are named card lists, or built from the filters `matches()` already
understands (type, mana value), so the existing payoff filter UI is reusable
rather than reinvented.

That covers every mulligan decision either example deck actually makes, and it is
exactly computable.

## The math, and why it is exact

### P(a 7-card look satisfies the goal)

Multivariate hypergeometric over a **disjoint partition** — the same technique
`pSourcesAndLands` already uses in GOLDFISH, and for the same reason. When the
clause sets are pairwise disjoint:

```
P = Σ over (x₁…x_k), xᵢ ≥ nᵢ, Σxᵢ ≤ h
      [ ∏ C(|Sᵢ|, xᵢ) ] · C(N − Σ|Sᵢ|, h − Σxᵢ)  /  C(N, h)
```

When sets **overlap** — "≥1 red card AND ≥1 creature" — a per-set partition
double-counts, which is the same overlapping-category trap the Method tab already
warns about for colour sources. The fix is to partition on the **Venn atoms**:
every card belongs to exactly one atom (the subset of clause-sets it belongs to),
atoms are disjoint by construction, and the sum runs over atom counts with the
clauses evaluated on their sums.

With k clauses there are ≤2^k atoms, but only non-empty ones matter and real
goals have two or three clauses. Enumerate with a cost guard; if the enumeration
exceeds budget, fall back to the goldfish's Monte Carlo and **label the figure as
sampled**, reusing the deterministic-vs-sampled distinction the Compare tab
already established. Never silently switch methods.

### The London mulligan chain

The reason this is worth building now is that London makes the math clean, and
the cleanliness is not obvious until you look at it.

Under London you shuffle back and look at a fresh seven **every time**. So
P(a look satisfies the goal) is the same `p` at every mulligan — the number of
looks until success is plainly geometric. You then bottom *m* cards of your
choosing, after keeping.

Two consequences, both load-bearing:

1. **Evaluating the goal on the seven you look at is correct**, because you keep
   first and bottom afterwards, choosing the worst cards. Under the old Vancouver
   rule it would have been wrong. State this in the Method tab; it is the sort of
   thing that looks like a bug to a reader who has not thought it through.
2. **The cost of insisting is entirely card count.** A hand found on the second
   mulligan is a five-card hand.

So for a policy "keep iff the goal is met, forced keep after M mulligans":

```
P(keep a goal hand)     = 1 − (1−p)^(M+1)
P(stop at look j)       = (1−p)^j · p          hand size 7 − j
P(forced keep)          = (1−p)^(M+1)          hand size 7 − (M+1)
E[cards]                = Σ over the above
```

Exact, closed form, no simulation. The goldfish's seeded dealer then
**cross-validates** it — the same independent-agreement pattern that made the
session-4 on-curve math trustworthy, and it should be held to the same standard.

### The frontier, and what the tab refuses to do

For a family of candidate policies — loosest to strictest — plot P(goal) against
E[cards kept]. That is a Pareto frontier, and it is the actual answer to "how
aggressive should I be".

**Do not name a best policy.** There is no defensible exchange rate between
"has the Axe" and "has six cards instead of five", exactly as there is no
defensible exchange rate between a point of colour consistency and a point of
payoff probability. The Compare tab already refuses to invent one and names
regressions instead; this tab shows the frontier and names the knee. Same rule,
same reason.

## Delirium, honestly

Opening-hand type diversity is exactly computable — card types form a set system
the Venn-atom partition already handles, including cards with two types.

**Delirium by turn N is not**, and should not be faked. It needs a play policy
(which spells you cast, in what order), self-mill modelling, and fetch/cycling
sequencing — the same machinery the goldfish's "land drops are not sequenced" gap
has been waiting on since session 4. The honest scope:

- Ship: P(≥T distinct card types in the opening hand), exact.
- Ship: distinct types **seen** by turn N, labelled explicitly as an upper bound
  on delirium — seeing a type is not putting it in the graveyard.
- Defer: real delirium, and say so in Method rather than shipping an optimistic
  number with a confident label.

That is the same call the tool already makes for restricted lands and Verge
conditional halves: understate rather than overstate, and document.

## Where it lives

A new top-level **Consistency** tab, sibling to Goldfish, with a `GOALS` banner
section for the pure math and the view builders.

Goldfish keeps opening hands as a *browsing* surface; Consistency answers a
*decision*. Putting goals inside Goldfish would also mean `render()` reaching into
`GF` state, which the architecture notes forbid for good reason.

The goal builder itself belongs in the left column under the Sideboard card, and
goals should be per-build state that persists — meaning schema 3, and the same
sanitisation treatment `sanitizeVariants` gets.

## Reuse, deliberately

- `hyperAtLeast`, `lnC`, `LG` — MATH CORE, already exact and tested
- `pSourcesAndLands` — the disjoint-partition pattern to copy, in GOLDFISH
- `matches()` / `PERM` — DIG PAYOFFS, for building sets from filters
- `expandDeck` / `runBulk` / `dealInstance` — GOLDFISH, for the cross-check
- `esc`, `empty`, `cmpTone`, the `.cbar` threshold bar — COMPARE
- `analyseCards(cards, unknown, opts)` — so a goal can be evaluated against the
  active **variant**, not just the maindeck. A sideboard plan that cuts the Axes
  should visibly move the frontier.

## Open questions for the session

- Should a goal be evaluated against the active variant automatically (yes,
  probably) and shown per-variant in the Compare tab (a second row group)?
- Presets: ship "Leyline start", "delirium types", "two lands and a two-drop"?
- Does the frontier want the hand-score heuristic as a third axis, or does that
  muddy a chart whose whole point is two clean quantities?
