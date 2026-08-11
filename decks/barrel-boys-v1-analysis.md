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
| W | 18 | 14 |
| U | 15.9 | 11.9 |
| R | 5 | 1 |

Requirements, evaluated against whichever column actually applies:

| Spell | Type | Need | Have | |
|---|---|---|---|---|
| Pinnacle Starcage `{1}{W}{W}` T3 | artifact | 18 | 18 | exactly at |
| Cryogen Relic `{1}{U}` T2 | artifact | 13 | 15.9 | fine |
| Simulacrum Synthesizer `{2}{U}` T3 | artifact | 12 | 15.7 | fine |
| Krang, Master Mind `{6}{U}{U}` T7 | artifact | 13 | 15.9 | fine |
| **United Battlefront `{3}{W}` T4** | **sorcery** | 11 | **14** | fine |
| **Tony Stark `{1}{U}` T2** | **creature** | 13 | **11.6** | ~1.4 short |
| **Getaway Barrel `{3}{R}` T4** | artifact | 11 | **5** | **6 short** |

Pinnacle Starcage landing exactly on 18 is worth noting: it only clears because
Castle Doom counts, and it clears with zero margin.

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

## Tool bugs found

1. **Lands counted as cheap ramp/draw.** `rampdraw` in the Scryfall section
   tests `cmc <= 2 && /draw a card|search your library for a( basic)? land/`
   without excluding lands, so Fabled Passage, Evolving Wilds, Terramorphic
   Expanse and every similar land depresses the recommendation by 0.28 each.

2. **Shocklands flagged as entering tapped.** The `/enters (the battlefield )?tapped/`
   test matches Hallowed Fountain's and Sacred Foundry's *"If you don't, it
   enters tapped"*. Affects the untapped-sources display only, not the
   requirements.

3. **Restricted-use mana is not modelled** (new limitation, not a bug). Castle
   Doom, Ancient Tomb-style lands and any *"spend this mana only to…"* land are
   counted as unrestricted sources. Worth a Method-tab note at minimum; the
   honest fix is a per-source restriction tag.
