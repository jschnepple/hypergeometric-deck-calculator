# 2026-08-11 — First real decklist, seven bugs, repo recovered

Second session, same day. Started by recovering the project from a previous
session's outputs folder, then finally loaded Jeff's actual brew — the thing the
first session deliberately deferred. Loading one real deck found seven bugs.

## What shipped

- Recovered the whole project into `/Users/jeff/Projects/Mtg/hypergeometric-deck-calculator`
  and put it under version control — 4 commits, pushed to
  `github.com/jschnepple/hypergeometric-deck-calculator`
- `decks/barrel-boys-v1.txt` — Jeff's decklist in the tool's format
- `decks/barrel-boys-v1-analysis.md` — the full written analysis
- `tests/manabase.test.js` — 39 new tests for fetchlands and restricted mana
- **221 tests**, up from 152

## The recovery

The connected folder held an empty git repo — no commits, no files. The work was
in a *previous session's* outputs directory under
`.../local_82612278-.../outputs/mtg-mana-calculator/`, reachable from the host
but not from the session sandbox. Copied via `osascript` → `do shell script`.

Also brought over `research/mana-engine/` (the Python Monte Carlo scripts that
derived the conditional Karsten table). Those were *not* in the deliverable
folder and would have been the one genuinely unrecoverable piece — the reasoning
behind the central finding, with no way to re-check the numbers.

**Lesson:** the first session ended without committing. That is how it went
missing. Commit before wrapping.

## Seven bugs, all found by one real deck

1. **Lands counted as cheap ramp/draw.** `rampdraw` tested `cmc<=2 && /draw a
   card|search your library for a basic land/` without excluding lands, so every
   Fabled Passage docked 0.28 off the land recommendation. Made Barrel Boys look
   like a perfect 25/25 match when the real number is 25.58 → 26.
2. **Shocklands flagged as entering tapped** — `/enters tapped/` matched "if you
   don't, it enters tapped". The conditional "enters tapped *unless*" family
   still counts as tapped, deliberately.
3. **Split and DFC cards failed lookup entirely.** Scryfall's
   `/cards/collection` `name` identifier matches the **front face only**, so the
   `A // B` name Moxfield and Archidekt export returned `not_found` — and an
   unresolved card silently becomes MV 0 with no pips.
4. **MDFC lands counted as lands.** `Sorcery // Land` matched `/Land/`, which
   inflated the land count *and*, because `mdfcLand` was `(!isLand && backLand)`,
   stopped the MDFC regression term firing for the exact cards it exists for.
5. **Fetchlands contributed zero coloured sources.** Scryfall gives them no
   `produced_mana` at all. The Method tab claimed the *opposite* — that fetches
   count for every colour they can retrieve. Documentation being backwards is
   worse than the bug.
6. **Restricted-use mana counted as unrestricted.** Castle Doom, Cavern of Souls,
   Spire of Industry.
7. **MDFC type lines leaked the back face into every type test.** Found only
   because fixing #6 made the wrong answer visible — Scryfall's combined line for
   Tony Stark contains "Artifact Creature", so Castle Doom's artifact-only mana
   appeared to pay for a creature spell. Type lines now come from the front face.

## Decisions made

**Fetchlands resolve against the deck's own land base.** A fetch counts for a
colour only if this deck runs a retrievable land producing it. Misty Rainforest
with no Islands is not a blue source; Polluted Delta picks up red through
Volcanic Island. Verified on a real Modern manabase where blue/red went from
roughly 7/4 to 23/22 — the difference between condemning a fine manabase and
passing it.

**Restricted mana is checked per spell, and errs low.** Each requirement row
counts the source only if the spell driving it satisfies the restriction, so
Castle Doom counts for Pinnacle Starcage and not for United Battlefront in the
same analysis. Where it can't be verified against a type line — "multicolored",
Cavern's chosen type, or any summary with no spell in hand — it doesn't count.
Understating a restricted land costs a land you didn't need; overstating it costs
the game.

**Conditional-tapped lands stay classified as tapped.** Shocklands are untapped
(the choice is always there, costs only life), but "enters tapped unless you
control a Mountain" stays tapped. That flag feeds the untapped-source display,
where optimism is the failure mode.

**Requirement binding now selects the biggest shortfall, not the biggest
requirement.** With per-spell supply the largest number is no longer the worst
problem — a spell needing 18 with 20 sources is fine; one needing 11 with 5 is not.

**Logic moved out of `SCRYFALL` into testable helpers in `PARSING`** —
`landFaces`, `entersTapped`, `isRampDraw`, `scryfallName`, `parseFetch`,
`resolveFetch`, `parseRestriction`, `restrictionAllows`. The `SCRYFALL` section
touches the network and can't be reached by `tests/extract.js`; anything that
regressed once needs to live where a test can see it.

## About the deck (Barrel Boys v1)

Full write-up in `decks/barrel-boys-v1-analysis.md`. The three findings worth
carrying forward:

- **Getaway Barrel is fetched, not cast.** Repurposing Bay tutors artifacts onto
  the battlefield by mana value, so the tool's "red is 6 short" verdict is
  technically right and strategically misleading. But the ladder is
  single-threaded through **one** MV4 card and dies entirely at MV5→MV6.
- **The Iron Man failsafe doesn't work.** A card put onto the battlefield enters
  front face up, so Barrel gives you Tony Stark the 1/3, never The Invincible
  Iron Man. And the transform is an activated ability, so Castle Doom can't pay
  for it — usable red sources: one. A drawn Krang has no out.
- **Tony Stark still earns his slot** as a repeatable artifact tutor (94% to hit
  in the top four of a 29-artifact deck) that happens to be a legal Barrel target.

## Follow-ups identified

- **Mana rocks and dorks aren't counted as sources.** Barrel Boys runs The Mind
  Stone (`{T}: Add {W}`); a deck leaning on Birds of Paradise gets no credit at
  all. Fix path: extend `sourcesFor` to accept nonland permanents with a
  discount for summoning sickness / removal risk. Nontrivial — needs a model, not
  just a parser change.
- **X spells read as MV 0.** Chalice of the Void and Walking Ballista are `{X}{X}`
  → Scryfall cmc 0, which understates the curve and therefore the land count.
  Correct by the rules, wrong for deckbuilding. Fix path: an inline override, or
  treat X as 1 in the curve only.
- **Split-card pips are summed across both halves.** `Fire // Ice` yields MV 4
  with one R and one U pip. Defensible, but genuinely ambiguous under Karsten.
- **The Verge discount uses cards *seen* as a proxy for lands *in play*** —
  known, documented, mildly optimistic.
- **Tainted lands and Nimbus Maze** use the Verge mechanic with a different text
  shape and still aren't auto-detected.

## Cleanup pending

None. Working tree clean, 4 commits pushed, no stray processes. A local
`python3 -m http.server 8731` was used to exercise the UI in Chrome and was
stopped; if anything ever survives a crashed session, `pkill -f 'http.server 8731'`.

## State

- 221 tests passing (`node tests/run-all.js`), 6 files
- Working tree clean, `main` at `ab467a1`, pushed to origin
- **GitHub Pages may still need enabling** — Settings → Pages → `main` / root.
  `.nojekyll` is committed but Pages itself is a repo setting.
- Functionality is now considered done. Next session is the visual pass —
  see [[next-session-prompt-glassmorphism]].

Related: [[2026-08-11-build-and-deploy]]
