---
name: 2026-08-11-glassmorphism-overhaul
description: Session 3 — the Apple-grade glassmorphism visual pass. Token system, three-elevation glass material, interruptible motion built against a render loop that rebuilds every panel per keystroke, contrast solved numerically. Functionality untouched, 221 tests green throughout.
metadata:
  type: session-memory
  session: 3
---

# Session 3 — glassmorphism visual overhaul

Executed `memory/next-session-prompt-glassmorphism.md`. Functionality frozen; not
one analysis number changed. 221 tests green at the start, after every phase, and
at the end.

## What shipped

The whole restyle lives in `index.html`'s single `<style>` block, which went from
77 lines to roughly 240. No markup was restructured, no render function's HTML
output changed shape, and all eight banner comments survived verbatim.

**Token system.** `:root` now carries surfaces, text, semantics, a 4px spacing
grid (`--s1`…`--s7`), radii (`--r1/2/3/rp`), motion durations and easings, and two
elevation shadows. `--panel`, `--panel2` and `--line` are **kept as aliases** — not
legacy cruft. RENDER writes them into inline styles (`style="background:var(--panel2)"`
on payoff cards, the tension bar's dead segment, the footer rule), so redefining
them here restyles that generated markup for free. Deleting them will silently
break those surfaces.

**The material.** Three elevations, all translucent white over a fixed backdrop
rather than solid hex: `--g0` recessed (inputs, bar tracks), `--g1` panel
(`.card`), `--g2` raised (header, deck bar, active tab). Each glass surface is
translucency + `backdrop-filter: blur(20px) saturate(160%)` + hairline border +
layered shadow + an inset top highlight.

**The backdrop.** `body::before` paints three fixed radial blooms (blue, violet,
green, all low alpha); `body::after` paints SVG-turbulence grain at 16% to kill
gradient banding. Both are inline data — no network. They must stay `position:fixed`
with negative z-index: glass over flat black is just grey, and glass over a
*scrolling* backdrop swims.

## Three findings worth keeping

**1. `--panel2` had to become a dark value.** It was `rgba(255,255,255,.09)`.
Payoff cards are `.card` nested inside `.card`, so that white overlay composites
*over* an already-translucent parent — every nested well came out brighter than
its container, which is backwards, and it was exactly what dragged `--dim2` down
to 2.55:1. It is now `rgba(0,0,0,.16)`. A recessed well is both correct design and
the thing that fixed the contrast. Any future "nested surface" needs a dark
overlay, not a light one, for the same reason.

**2. The render loop makes CSS transitions dead code.** `render()` rebuilds every
panel with wholesale `innerHTML` on every keystroke. A transition never fires on a
freshly-created element — the browser paints it at its final value. The existing
`transition:height .18s` on `.curve .b` had therefore been doing nothing since the
day it was written. Three mechanisms now work around this, all in `RENDER`:

- `renderCurve` builds its eight columns **once** and patches `style.height` and
  the label text thereafter. The curve is the chart people watch while typing, so
  it earns real persistence.
- Bars elsewhere carry a stable `data-bk` key. `captureBars()` runs at the top of
  `render()` and records where each bar actually *is* right now, mid-transition
  included; `runBars()` puts the new element back at that width, forces a reflow,
  then releases it to the target. The transition continues from wherever the eye
  last saw it instead of restarting, which is what makes fast typing look
  continuous rather than stroboscopic.
- Numbers carry `data-nk` and are tweened **by key, not by element** (`tweenNum`),
  so a tween survives its node being replaced underneath it and simply retargets
  from the currently displayed figure. A number is never blanked or reset to zero
  mid-flight. Currently applied to the payoff headline percentages.

**3. Entrance animations need a typing gate.** One-shot keyframes *do* fire on
element creation, which means delta badges would have re-popped on every
character. `markTyping()` adds `body.typing` on input and clears it 380ms after
the last keystroke; `body.typing .delta{animation:none}` suppresses the pop. The
calculation stays instant — only the animation waits. The side effect is the best
part of the pass: every changed value pops once, together, when typing settles,
which reads as the panel confirming it caught up.

## Contrast — solved, not chosen

Every text and semantic token was derived numerically against its *composited*
background (canvas → blooms → surface), not picked by eye. `--dim`, `--dim2`,
`--good` and `--bad` all moved. The first solve collapsed `--dim` and `--dim2`
onto nearly the same value, destroying the two-tier text hierarchy — the fix was
not to lighten text further but to darken the surface underneath it (finding 1),
after which `--dim` could sit well above its floor.

Final: all tokens clear 4.5:1 on card, chrome, nested payoff well, all three
conflict tints, the amber flag, table-row hover, pill chips, primary-button ink
and every mana-symbol glyph. Tightest is `--warn` on `.pill.warn` at 4.56.

The throwaway solver scripts are gone. To re-check after any colour or alpha
change, the method is: composite canvas → the three blooms at full alpha → the
surface's own overlay, then WCAG-ratio each token against that.

## Not verified this session

**Runtime performance under continuous typing was never profiled, and the pass was
never seen rendered by the agent.** The Chrome extension refuses `file://` URLs,
and headless Chromium would not install in the sandbox — puppeteer fetched an
x86-64 binary onto an aarch64 host, and `/sessions` was at 100% disk anyway. Jeff
confirmed the look by opening it himself. If jank ever appears while typing into a
60-card list, the cause is the ~8 simultaneous `backdrop-filter` surfaces and the
fix is to cut the blur radius or drop blur from the left column — not to abandon
the material. Nested cards already opt out via `.card .card{backdrop-filter:none}`,
since a second stacked blur costs double and looks identical.

## Follow-up available, not taken

The Decklist hint reads `mark a land: 4 Mystery Land [land:RG]`, which implies
inline land tags are normal practice. They are not, and the wording should say
"land Scryfall can't find". Worth knowing why: `parseList` checks the inline tag
**before** the Scryfall DB, and the tagged branch produces a bare record —
`tapped:false` hardcoded, and no `subtypes`, `verge`, `fetch`, `restriction` or
`mdfcLand`. Tagging a real land therefore discards exactly the data that all seven
of session two's manabase bugs were about: it stops enabling Verges, breaks fetch
resolution, and ignores use restrictions. The tag is an escape hatch for cards
Scryfall cannot resolve, nothing more. Offered as a copy change; Jeff moved on
without it.
