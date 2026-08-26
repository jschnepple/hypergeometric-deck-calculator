# MTG Deck Consistency Calculator

A single-file browser tool for tuning Magic: The Gathering decklists. Answers four questions with actual probability rather than intuition:

- **How many lands should I play?**
- **How many colored sources of each color do I need?**
- **How many copies of a card should I run?**
- **What are the odds my dig effects find what they're looking for?**

No install, no build step, no server. One HTML file.

**Live: https://jschnepple.github.io/hypergeometric-deck-calculator/

---

## What it does

| Panel | What it answers |
|---|---|
| **Verdict** | Conflict report — the checks that only appear when you look at lands, colors, and curve *together* |
| **Land Count** | Karsten's regression recommendation, land-drop probabilities, flood/screw risk |
| **Color Requirements** | Required vs. actual sources per color, with the specific card driving each requirement |
| **Mana Curve** | Curve histogram, archetype fit, how curve changes color requirements |
| **How Many Copies** | P(≥1 by turn N) at 1/2/3/4 copies — what the 3rd and 4th copy actually buy |
| **Payoffs** | Odds that dig effects hit, plus tension analysis when two effects want different cards |
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

**Conditional duals (Verges)** are handled specially. Scryfall's `produced_mana` lists both colors with no signal about which is conditional, so counting them naively inflates your off-color by a full source each. The tool parses oracle text instead and discounts the off-color by the probability you control an enabling basic land type. Enablers are counted per permanent — a land carrying both required types (Blood Crypt, Hallowed Fountain) is still one permanent.

## Decklist format

```
4 Lightning Bolt
4x Sheoldred, the Apocalypse (DMU) 107
2 Brotherhood's End
```

Set codes, `x` notation, comments (`//`), and section headers are all handled.

For cards Scryfall can't resolve (custom cards, or when offline):

```
4 Homebrew Thing {1}{R}{R}      # specify mana cost inline
4 Mystery Land [land:RG]        # mark as a dual land
2 Weird Utility Land [land:C]   # land producing no colored mana
```

## Saving your work

Builds autosave to browser storage and reopen where you left off. **Duplicate** a build, swap some cards, and flip between them to compare.

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
