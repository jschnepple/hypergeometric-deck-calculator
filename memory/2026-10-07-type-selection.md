# 2026-10-07 — Dig payoffs that name specific types (session 8)

## What was asked

Jeff is tuning Boros Dwarves and wanted the Payoffs tab to answer Dáin's
Company: look at the top four, take a Dwarf or an Equipment. The three
dropdowns (creature / land / permanent) can only be ANDed and know no subtypes,
so the effect could not be expressed at all.

## What shipped

- A payoff carries `anyOf`, a list of keys ORed together and ANDed with the
  dropdowns: `type:Artifact`, `sub:Equipment`, `creature:Dwarf`. Empty or absent
  means no restriction, so every saved payoff reads exactly as before. No schema
  bump — payoffs are stored as plain JSON.
- The chips are built from the deck (`payoffTypeOptions`): permanent card types,
  non-creature subtypes of permanents, and creature types actually present, each
  with its count. A selection the deck no longer supports stays, dashed, at 0.
- `+ Dáin's Company` preset: top 4, take 1, Dwarf or Equipment.
- `matches()` owns the rule, so the Compare tab's payoff rows, the tension
  analysis and goal filters all see it without changes. The goal builder has no
  UI for it yet.

## Things worth knowing

- **The card says "a Dwarf or Equipment card", not "Dwarf creature card".**
  Checked against the live Scryfall record. So `creature:Dwarf` matches the
  SUBTYPE and a Kindred Dwarf spell counts. To require an actual creature, set
  the creature dropdown too.
- **Changelings.** Nothing on "Creature — Shapeshifter" says it is a Dwarf; only
  `keywords` does. `cardRecord` now stores `changeling` and `parseList` copies
  it. Cards cached before this session lack the flag until "Look up costs" is
  run again (it refetches every card in the list, so one click does it).
- **Self-exclusion now folds the name** and also tries `displayName`. The preset
  is called "Dáin's Company" and the decklist says "Dain's Company"; the old
  lowercase compare would have left the resolving copy in the library.
- **`addPayoff` clones `anyOf`.** `Object.assign` is shallow, and two Companies
  sharing the preset's array would have toggled together. dom.test.js checks it.
- `NONCREATURE_SUBS` decides which row a subtype on a creature card is filed in
  ("Artifact Creature — Equipment Fox"). A type missing from it still counts
  correctly; it is only shown under creature types and matched by changelings.
- Two-word subtypes ("Time Lord") split into two chips. Not Standard-relevant.

## Verification

- `tests/payoff.test.js` 33 → 100: matching, a 60-card Dwarves fixture checked
  against 1 − C(32,4)/C(59,4) worked by hand, option building, chips, toggling.
- `tests/dom.test.js` gained a group that clicks the chips in the real page
  (run against a staged copy with jsdom: 156 green).
- First time the page has been rendered in a real browser by the agent:
  headless Chromium over file://, wide and 420px. No horizontal scroll.

## Noticed, not changed

With "take up to 1" the distribution table lists "exactly 0" and "exactly 1"
only, and "exactly 1" is the chance of precisely one hit in the cards seen — so
the two rows do not sum to 100% and the second is not the headline. It predates
this session (Getaway Barrel shows the same) and deserves a deliberate decision:
the last row should probably read "N or more".
