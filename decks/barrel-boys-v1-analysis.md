# Barrel Boys v1 — analysis

Run 2026-08-11 against the shipped `index.html`. Every card resolved through
Scryfall; every probability below re-derived independently in exact BigInt
rational arithmetic and matched to the tool to 4 decimal places.

60 cards — 35 spells, 25 lands. Average MV 3.74.

---

## 1. The Castle Doom problem

`Castle Doom` reads:

```
{T}: Add {C}.
{T}: Add one mana of any color. Spend this mana only to cast an artifact spell.
```

Scryfall reports `produced_mana: [B,C,G,R,U,W]`, so the tool counts all four
copies as a source of **every** colour. That is right for artifact spells and
wrong for everything else — and the restriction is invisible to the tool,
because nothing in `produced_mana` encodes it.

The deck has exactly two non-artifact spells, so the correct source count is
split in two:

| Colour | With Castle Doom (artifact spells) | Without (non-artifact spells) |
|---|---|---|
| W | 20 | 16 |
| U | 17.6 | 13.6 |
| R | 5 | 1 |

Requirements, evaluated against whichever column actually applies. The tool now
does this split automatically — each requirement row is computed against the
spell that drives it, so Castle Doom counts for the artifacts and not for the
sorcery:

| Spell | Type | Need | Have | |
|---|---|---|---|---|
| Pinnacle Starcage `{1}{W}{W}` T3 | artifact | 18 | 20 | fine |
| Cryogen Relic `{1}{U}` T2 | artifact | 13 | 17.6 | fine |
| Simulacrum Synthesizer `{2}{U}` T3 | artifact | 12 | 17.7 | fine |
| Krang, Master Mind `{6}{U}{U}` T7 | artifact | 13 | 17.9 | fine |
| **United Battlefront `{3}{W}` T4** | **sorcery** | 11 | **16** | fine |
| **Tony Stark `{1}{U}` T2** | **creature** | 13 | **13.6** | just clears |
| **Getaway Barrel `{3}{R}` T4** | artifact | 11 | **5** | **6 short** |

Two of these moved once fetchlands were modelled properly (§ tool bugs, item 6):
the two Fabled Passage resolve to white and blue, which is what lifts Pinnacle
Starcage off its old knife-edge 18-for-18 and drags Tony Stark from ~1.4 short to
barely clearing. Red is untouched, because the deck runs no basic Mountain for a
Passage to find — which is itself the tell.

## 2. Getaway Barrel is not meant to be cast

The tool's verdict flags red as the deck's one real conflict — 5 sources against
11 needed. Technically correct, strategically misleading.

`Repurposing Bay` reads: *sacrifice another artifact, search your library for an
artifact card with mana value equal to 1 plus the sacrificed artifact's, put it
onto the battlefield.* Getaway Barrel is fetched, not cast. The red pips barely
matter.

But that reframing exposes a sharper problem. Here is the artifact ladder by
mana value:

| MV | Artifacts available | Copies |
|---|---|---|
| 2 | Cryogen Relic, Spring-Loaded Sawblades, The Mind Stone, Clay-Fired Bricks | 8 |
| 3 | Simulacrum Synthesizer, Repurposing Bay, Perilous Snare, Pinnacle Starcage, Ultron | 14 |
| **4** | **Getaway Barrel** | **1** |
| 5 | Transmutation Font | 1 |
| 6–7 | — | **0** |

The MV3 → MV4 rung is a single card. The ladder then dies completely at MV5 → MV6.

With one copy, the Barrel is in your library when you want it **83.3%** of the
time — and the other 16.7% you have drawn it, where it is close to dead, because
casting it needs red you do not have.

| Barrel copies | In library at T4 | Drawn by T4 (semi-dead) |
|---|---|---|
| 1 | 83.3% | 16.7% |
| 2 | 97.5% | 30.8% |
| 3 | 99.6% | 42.7% |

Two copies buys +14pp of engine reliability. The cost is more dead draws, which
argues for either a second Barrel plus a red source or two, or accepting the
Barrel as a pure toolbox card.

## 3. Payoffs

**United Battlefront** — 21 legal hits (noncreature, nonland, permanent, MV ≤ 3):

- P(≥1) = **96.3%**
- P(both) = **79.3%**
- expected hits seen = 2.49

This is excellent and needs no attention. Going 21 → 24 hits only buys +7.3pp on
the both-hits line.

Confirmed exclusions: Ultron is an artifact *creature*; Getaway Barrel is MV 4;
United Battlefront is a sorcery, not a permanent.

**Getaway Barrel** — 8 creature cards:

- P(≥1 creature in the top 13) = **88.2%**
- P(it is a Krang, Utrom Warlord) = **44.1%**
- P(it is a Tony Stark — a 2-drop, effectively a whiff) = 22.1%

The two effects are **perfectly disjoint**: United Battlefront wants noncreature
permanents, the Barrel wants creatures. Zero overlap. 6 non-land cards are dead
for both (1 Getaway Barrel, 1 Transmutation Font, 4 United Battlefront).

## 4. Krang, Utrom Warlord count

Four copies of a legendary `{9}` is a deliberate bet: the Warlords exist to be
Barrel targets, so more copies raise the jackpot rate — but drawing one is close
to a dead card.

| Copies | P(Barrel hits) | P(Barrel → Krang) | P(draw ≥1 by T5) |
|---|---|---|---|
| 2 | 79.2% | 26.4% | 33.6% |
| 3 | 84.3% | 36.1% | 46.2% |
| **4** | **88.2%** | **44.1%** | **56.6%** |
| 5 | 91.2% | 50.7% | 65.1% |

At four copies you draw a dead Krang in 57% of games by turn five. The curve is
also visibly flattening — the 4th copy buys +8.0pp of jackpot for +10.4pp of
dead draws, and the 5th is worse still. Three copies is the more efficient
point if the dead draws are hurting in play.

## 5. Land count

Karsten regression gives **25.02**, and the deck runs 25 — an apparently perfect
match. It is not quite.

The tool auto-filled the cheap ramp/draw term as 6: four Cryogen Relic (correct)
plus **two Fabled Passage**. Fabled Passage is a land. Karsten's −0.28 term
counts cheap *spells* that draw or ramp; a land is already counted in the 25.

Correcting the term to 4 gives **25.58 → 26 lands**. Given the deck's real curve
tops out at four `{9}` Warlords, 26 is the better number.

---

## 6. The Iron Man failsafe does not work

The intended line is: Barrel hits Tony Stark → he arrives as The Invincible Iron
Man → at the beginning of combat, put a drawn Krang from hand onto the
battlefield. It breaks in two independent places.

**A card put onto the battlefield enters front face up.** Getaway Barrel says
*put a random creature card onto the battlefield*. It does not cast anything and
it does not say "transformed", so what arrives is Tony Stark, the 1/3 — never The
Invincible Iron Man. This is true of every double-faced card put onto the
battlefield by an effect.

**Reaching Iron Man needs red the deck does not have.** The transform costs
`{4}{U}{R}`, and it is an *activated ability*, not casting an artifact spell —
so Castle Doom's coloured mana cannot pay for it. Usable red sources: **one**
(Sacred Foundry). Karsten wants 9 for a single red pip on turn 6. There is a
20% chance Sacred Foundry is even in play by then.

So a drawn Krang has no out. It is not a failsafe; it is a dead card 57% of games.

**But Tony Stark is still worth running — for the front face.** `{1}, {T}: look
at the top four, take an artifact` is a repeatable dig, and the deck is 29
artifacts in 60:

- P(≥1 artifact in the top four) = **94.0%**
- P(≥2) = 68.1%

That finds Getaway Barrel, which matters given the ladder is single-threaded
through one copy. And keeping Tony in raises the Barrel's overall hit rate,
because he is a creature: cutting both copies drops it from 88.2% to **79.2%**.

The honest summary: Tony Stark earns his slot as a cheap artifact tutor that
happens to be a legal Barrel target. He does not earn it as a Krang enabler. If
you want the Krang-from-hand plan to be real, that is a mana-base decision — 8
or so more red sources — not a card-selection one.

## Tool bugs found

All seven are fixed as of 2026-08-11; 221 tests green, up from 152.

1. **Lands counted as cheap ramp/draw.** `rampdraw` tested
   `cmc <= 2 && /draw a card|search your library for a( basic)? land/` without
   excluding lands, so Fabled Passage, Evolving Wilds and Terramorphic Expanse
   each docked 0.28 off the recommendation. Cost this deck a full land: 25.02
   (a fake perfect match) versus the correct **25.58 → 26**.

2. **Shocklands flagged as entering tapped.** `/enters (the battlefield )?tapped/`
   matched Hallowed Fountain's and Sacred Foundry's *"If you don't, it enters
   tapped"*. Untapped W went 12 → 16, U went 7 → 10. The conditional
   "enters tapped unless…" family deliberately still counts as tapped.

3. **Split and double-faced cards failed lookup entirely.** Scryfall's
   `/cards/collection` `name` identifier matches the front face only, so the
   full `A // B` name that Moxfield and Archidekt export returned `not_found` —
   and an unresolved card silently becomes mana value 0 with no pips. Four
   Fire // Ice would have dragged the average mana value down and understated
   both land count and colour requirements.

4. **MDFC lands were counted as lands.** Scryfall types Bala Ged Recovery //
   Bala Ged Sanctuary as `Sorcery // Land`, and the old `/Land/` test on the
   combined string called it a land. Worse, `mdfcLand` was `(!isLand && backLand)`,
   so the MDFC term in Karsten's regression never fired for the exact cards it
   exists to handle. Classification now reads the front face.

5. **Restricted-use mana was counted as unrestricted.** Castle Doom, Cavern of
   Souls and Spire of Industry add "one mana of any color" and then take most of
   it back, and `produced_mana` carries no hint of it. Now parsed and checked
   per-spell: a requirement row only counts the source if the spell driving it
   satisfies the restriction. Where it cannot be verified against a type line —
   "multicolored", Cavern's chosen creature type, or any summary figure with no
   spell in hand — it does not count at all. Erring low costs a land you did not
   need; erring high costs the game.

6. **Fetchlands contributed zero coloured sources.** Scryfall gives Misty
   Rainforest and Fabled Passage no `produced_mana` at all, so they counted as
   lands producing nothing — and the Method tab claimed the exact opposite,
   which is worse than the bug. Fetches are now resolved against the deck's own
   land base: a fetch counts for a colour only if this deck runs a retrievable
   land producing it. Verified on a real Modern manabase, where Polluted Delta
   correctly picks up red through Volcanic Island, and blue/red go from roughly
   7/4 to 23/22 — the difference between the tool condemning a fine manabase and
   passing it.

7. **MDFC type lines leaked the back face into every type test.** Scryfall's
   combined line for Tony Stark reads `Legendary Creature — Human Artificer Hero
   // Legendary Artifact Creature — Human Hero`, so an `/artifact/` test matched
   and Castle Doom appeared to pay for a creature spell it cannot cast. Found
   only because the restriction model made the wrong answer visible. Type lines
   now come from the front face, which is also what fixed `Sorcery // Land`
   matching a land filter in the payoff matcher.
