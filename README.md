# MTG Deck Consistency Calculator

A single-file browser tool for tuning Magic: The Gathering decklists. Answers five questions with actual probability rather than intuition:

- **How many lands should I play?**
- **How many colored sources of each color do I need?**
- **How many copies of a card should I run?**
- **What are the odds my dig effects find what they're looking for?**
- **How often would I mulligan, and what do my keepable hands look like?**

No install, no build step, no server. One HTML file.

**Live: https://YOUR-USERNAME.github.io/mtg-mana-calculator/**

---

## What it does

| Panel | What it answers |
|---|---|
| **Verdict** | Conflict report — the checks that only appear when you look at lands, colors, and curve *together* |
| **Land Count** | Karsten's regression recommendation, land-drop probabilities, flood/screw risk |
| **Color Requirements** | Required vs. actual sources per color, with the specific card driving each requirement |
| **Mana Curve** | Curve histogram, archetype fit, how curve changes color requirements |
| **How Many Copies** | P(≥1 by turn N) at 1/2/3/4 copies — what the 3rd and 4th copy actually buy |
| **Payoffs** | Odds that dig effects hit, plus tension analysis when two effects want different cards. Effects can name specific types — pick any mix of the permanent types and creature types your list actually contains ("a Dwarf or Equipment card") and a card counts if it is any one of them |
| **Goldfish** | Deals hundreds of opening hands, scores each on the play and on the draw, and opens any one of them for card-by-card draws with live odds |
| **Consistency** | Your own definition of a good opening hand — how often you get it, what mulliganing for it costs you in cards, and where digging stops being worth it |
| **Compare** | Every sideboard plan beside the maindeck — which one quietly breaks your mana, and what each does to your curve, colors and payoff odds |
| **Method** | Full derivation and known limitations |

Paste a decklist, hit **Look up costs (Scryfall)**, and everything recalculates as you type.

## The math

**Land count** uses Frank Karsten's regression over ~95,000 winning tournament decklists:

```
19.59 + 1.90×avgMV − 0.28×cheap draw/ramp − 0.74×untapped MDFC − 0.38×tapped MDFC + 0.27×companion
```

This is empirical, not probabilistic. It answers "what did decks like mine actually run?" — a better-posed question than "what maximizes P(land drop)", whose answer is 60 lands.

**Colored sources** use conditional hypergeometric probability. The subtle part, and the thing most calculators get wrong: the naive question ("P(≥2 white sources among 9 cards seen by turn 3)") gives 22 sources for a double pip, but Karsten publishes 18. The naive model double-counts failure — it fails you both when you're color-screwed *and* when you simply didn't have three lands.

Karsten conditions on having made your land drops and measures color screw *given* you weren't mana screwed. The whole table was re-derived here by Monte Carlo (1M+ games, London mulligan) under that conditioning; it reproduces his published anchors exactly at turns 1–2 and sits 1–3 low at later turns. The tool shows both and recommends the higher.

Proof the conditioning is necessary: the unconditional model *saturates* — no number of sources reaches 90% for a five-drop, because with 24 lands you can't reliably have five lands on turn five at all.

**Fetchlands** are resolved against your own land base. Scryfall reports no mana at all for a fetch, so counting `produced_mana` makes Misty Rainforest a land that produces nothing — ruinous for any deck on eight or more fetches. Instead the tool works out what your deck can actually retrieve: a Misty Rainforest in a deck with no Islands is not a blue source, and a Polluted Delta picks up red if you run a Volcanic Island. Fetches that put the land in tapped are kept out of the untapped count.

**Restricted-use lands** — Castle Doom, Cavern of Souls, Spire of Industry — add any colour and then restrict what it can pay for, with nothing in Scryfall's data to signal it. Each requirement is checked against the spell that drives it, so the same land can count toward one and not another. When the restriction can't be verified against a type line, it doesn't count: understating a restricted land costs you a land you didn't need, overstating it costs you the game.

**Goldfishing** asks a different shape of question — not "how many sources does the deck need" but "given these seven cards and this library, what are the odds". Each hand is dealt from its own seeded shuffle, and the seed is shown, so any hand can be dealt again exactly.

Percentages come from the **composition of what's left** — the deck minus what you've seen — never from the shuffled order. That distinction is the whole thing: reading the order would make every number 0% or 100%, which isn't a probability, it's the answer key. The order decides exactly one thing, which card the Draw button turns over.

On-curve chance for a card of mana value *m* is `P(you hold it) × P(m lands by turn m) × P(colors | lands)`. The third factor is computed as `P(sources AND lands) ÷ P(lands)` over a disjoint three-way split of the library — lands making the color, other lands, everything else. Multiplying an *unconditional* color probability by the land probability would double-count the land requirement, the same trap described above; the disjoint split is what lets duals and taplands fall in the right bucket without breaking the math.

Feeding the re-derived table's own source counts back through this formula returns 88–94% castability, essentially flat across one to three pips and turns one to seven. Those counts came from a Monte Carlo sharing no code with this calculation, so closed form and simulation agree independently — and the *flatness* is the evidence, since bad conditioning makes the figure drift with turn number rather than hold level.

**Hand scores are a heuristic and are shown as one:** five weighted components, each reported with its reasoning — land count (35), whether the hand keeps acting through turn four (22), mean on-curve chance (25), curve spread (8), no dead cards (10). A 62 should be readable as *why* it's a 62, and the keep threshold is yours to move. Land count is judged against your deck's own ratio rather than a fixed 3–4 band, since a 17-land aggro deck and a 26-land control deck don't want the same opener.

**Deck goals** are your own standard for a good opening hand, written as a conjunction of clauses: "at least one Leyline Axe *and* at least two lands", "at least three distinct card types *and* at least two lands". The probability is exact — a multivariate hypergeometric over a **Venn partition** of the deck, where every card falls into exactly one atom according to which of your clause sets it belongs to.

The partition is the whole point. Partitioning per clause *set* double-counts every card that's in two of them, and worse, it makes a card that satisfies two clauses at once look as though it can only satisfy one — "at least one red card and at least one creature" quietly becomes "two different cards". Multiplying the clauses together instead asserts they're independent events, and they never are: disjoint sets compete for the same seven slots, so the true answer is *below* the product; overlapping sets go the other way.

**The mulligan question** — how hard should I dig for that start? — has a clean answer under the London rule, and the reason is easy to misread. You look at a fresh seven every time and bottom cards only *after* deciding to keep, so evaluating the goal on the seven you look at is correct (it would not have been under the old Vancouver rule), the chance a look meets your goal is the same at every mulligan, and the whole chain is geometric in closed form. The cost of insisting is therefore nothing but cards.

So the tab plots the frontier: P(you end up on the start you wanted) against the expected size of the hand you keep, one point per policy. It names the knee and stops there. There's no defensible exchange rate between "has the Axe" and "has six cards instead of five", so nothing is marked best.

Delirium *by turn N* is deliberately not modelled — that needs a play policy, self-mill and fetch sequencing. Distinct types in the opening hand is exact; distinct types **seen** by a turn is an upper bound and is labelled as one.

**Sideboard variants** run the same math over a different sixty. A variant — "vs Control", "vs Aggro" — is stored as a *diff* against the maindeck ("−2 Cut Down, +2 Duress"), so editing the deck updates every plan automatically instead of leaving fifteen stale copies behind. Pick one from the bar above the tabs and every panel describes that deck instead; the Compare tab lines them all up.

What the comparison leads with isn't a ranking, it's **regressions**: the plans that push a color below the sources its most demanding spell needs, or drag the land count away from where your curve wants it. That's the failure this exists for — sideboarding breaks manabases quietly, one land or one double-pip card at a time, and nobody checks it by hand. There's no aggregate "best variant" score, because there's no defensible exchange rate between a point of color consistency and a point of payoff probability.

Exact figures and sampled ones are kept apart. Curve, sources, land count and payoff odds are computed, so any difference is real. Keep rates are simulated, so every variant is dealt from the **same seeds** — a shared run of bad shuffles cancels out of the difference rather than being blamed on your swaps — and any gap inside its own sampling error is greyed out and labelled noise instead of dressed up as a finding.

**Conditional duals (Verges)** are handled specially. Scryfall's `produced_mana` lists both colors with no signal about which is conditional, so counting them naively inflates your off-color by a full source each. The tool parses oracle text instead and discounts the off-color by the probability you control an enabling basic land type. Enablers are counted per permanent — a land carrying both required types (Blood Crypt, Hallowed Fountain) is still one permanent.

## Decklist format

```
4 Lightning Bolt
4x Sheoldred, the Apocalypse (DMU) 107
2 Brotherhood's End
```

Set codes, `x` notation and comments (`//`) are all handled.

**Names are matched the way people actually type them.** Accents are optional — `Dain's Company` finds `Dáin's Company` — and so are curly apostrophes. Pluralised basics are too: `5 Islands` and `10 Mountains` resolve exactly, because there is nothing else they could mean. Arena decklists work too: `Giantcraft Helm` resolves to `Doc Ock's Tentacles`, because Arena prints many Universes Beyond cards under different names and the tool reads the printed name as well as the oracle one. Anything it can only *guess* at is offered as a suggestion with a button rather than quietly put in your deck, and anything it can't resolve at all gets a dialog telling you what that costs — an unresolved card fills a slot in your library and satisfies nothing, so every figure on the page is understated until you fix it.

Put a `Sideboard` line before your sideboard and it's kept out of the deck — which is what makes the Compare tab work, and stops a pasted 75-card export being analysed as a 75-card deck:

```
20 Mountain

Sideboard
3 Abrade
2 Negate
```

`Sideboard`, `//Sideboard`, `SIDEBOARD:`, `Sideboard (15)` and MTGO's per-line `SB: 2 Abrade` are all recognised, as are `Deck` / `Maindeck` to switch back and `Maybeboard` to ignore a block entirely. A blank line is *not* treated as a sideboard marker — plenty of lists use one to separate spells from lands, and guessing wrong would silently move cards between decks.

For cards Scryfall can't resolve (custom cards, or when offline):

```
4 Homebrew Thing {1}{R}{R}      # specify mana cost inline
4 Mystery Land [land:RG]        # mark as a dual land
2 Weird Utility Land [land:C]   # land producing no colored mana
```

### Adventures and split cards

An Adventure or split card is two spells sharing a slot, and plenty of decks only
ever cast one of them. Say which and the other half leaves every calculation —
its coloured pips stop asking for sources and its mana value stops moving the
curve:

```
2 Callous Sell-Sword [face:adventure]   # only ever cast as Burn Together, a red spell
4 Brazen Borrower [face:main]           # only ever cast as the creature
```

The **Two-faced cards** panel in the left column does the same thing with a
click, and appears only when your deck actually holds one. `[face:main]` and
`[face:adventure]` are the readable spellings; `front`/`back`, `1`/`2` and
`adv`/`alt` work too.

Say nothing and both halves count — each measured *separately*, at its own mana
value, rather than added together. That distinction matters: read as one spell,
Callous Sell-Sword // Burn Together costs `{1}{B} // {R}` and appears to demand
black *and* red at once, which told an Izzet deck it was thirteen black sources
short of a card it plays purely as red removal.

A transform card's back face is never cast, so it is ignored. A modal
double-faced card whose back is a land is handled by the land count instead.

## Saving your work

Builds autosave to browser storage and reopen where you left off, sideboard variants included — a variant belongs to its deck, so it exports and imports with it. **Duplicate** a build, swap some cards, and flip between them to compare whole decks; use variants when you want to compare sideboard plans for one deck.

Browser storage is convenience, not durability — use **Export build** / **Export all** to write real `.json` files. Those are the copy you own. (Opened from `file://` rather than a web server, some browsers block storage entirely; the tool warns you and falls back to export-only.)

## Deploying your own copy

1. Create a **public** repo (private repos need GitHub Pro for Pages)
2. Add `index.html` and this README
3. **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**
4. Live at `https://YOUR-USERNAME.github.io/REPO-NAME/` in a minute or two

Works identically on Netlify, Cloudflare Pages, or Vercel — drag the folder in. There's no build step and no server-side anything.

## Privacy

No analytics, no trackers, no cookies, no backend. The only network request is to the Scryfall API when you click "Look up costs," and results are cached in your browser so it works offline afterward. Your decklists never leave your machine.

## Credits

Card data from [Scryfall](https://scryfall.com). Mana math follows [Frank Karsten's](https://www.tcgplayer.com/content/article/How-Many-Lands-Do-You-Need-in-Your-Deck-An-Updated-Analysis/cd1c1a24-d439-4a8e-b369-b936edb0b38a/) published research.

Requests to Scryfall are batched 75 cards at a time with 120ms spacing, and card data is cached locally, per [Scryfall's API guidelines](https://scryfall.com/docs/api).

## Legal

Unofficial Fan Content permitted under the [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.

Not affiliated with or endorsed by Scryfall.
