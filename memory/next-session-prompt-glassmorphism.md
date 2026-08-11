---
name: next-session-prompt-glassmorphism
description: Kickoff prompt for the Apple-grade glassmorphism visual overhaul of the MTG deck calculator — glass material system, animated charts, premium component states. Supersedes the 2026-08-11 version (test count and file inventory were stale).
metadata:
  type: project
---

# Next session — glassmorphism visual overhaul

Status: **pending.** Rewritten 2026-08-11 after the second session. Supersedes
`memory/next-session-prompt.md`, whose test count (152) and file inventory were
stale. Paste the block below to start.

---

````
Visual overhaul — Apple-grade glassmorphism and premium motion

GOAL

Redesign the calculator's visual layer to the standard of a senior Apple product
designer: a coherent glass material system, a considered type and spacing scale,
and motion that makes the numbers feel alive without ever making them unreadable.
Success is that the tool stops looking like a developer's utility and starts
looking like something you would pay for — while every one of the 221 tests stays
green and not a single analysis number changes.

This is the last thing standing between the tool and being shared with friends.
The math is done and now genuinely trustworthy: the previous session loaded the
first real decklist and that alone surfaced seven bugs, all fixed. Functionality
is frozen for this pass. What ships next is entirely about how it feels.

The audience matters for the design. This is a dense numeric instrument that
recalculates on every keystroke, read by someone iterating on a decklist — not a
marketing page. Glass should clarify hierarchy, not decorate. If a treatment
makes a percentage harder to read, it loses.

CONTEXT TO LOAD FIRST
Read in order:
  - CLAUDE.md — architecture, the single-file decision and why it stands, house
    rules, current state
  - memory/2026-08-11-first-real-decklist.md — the seven bugs and the current
    helper layout in PARSING; explains why the banner comments are load-bearing
  - memory/2026-08-11-build-and-deploy.md — original build, and the conditional
    hypergeometric finding that must not be "corrected" by anyone touching this
  - decks/barrel-boys-v1-analysis.md — a real analysis, useful as the content you
    are designing around; use this deck as the test fixture, not lorem

KEY FILES TO READ FIRST
  - `index.html` — the entire application. CSS in one <style> block at the top,
    JS in one <script> block at the bottom. ~1400 lines.
  - `tests/run-all.js` — the suite entry point. Run before touching anything.
  - `tests/extract.js` — explains how tests slice the source on banner comments.
    Read this before restructuring anything.
  - `decks/barrel-boys-v1.txt` — 60-card list to paste in while working, so every
    panel has real content and real edge cases (a 5-source colour in the red, a
    conditional dual, a fetchland, a restricted land).

══════════════════════════════════════════════════════════════════
TASK — 6 phases
══════════════════════════════════════════════════════════════════

PHASE 1 — baseline and inventory
  Run `node tests/run-all.js` and confirm 221 passing across 6 files. That is the
  number to protect.

  Read the <style> block end to end and inventory every component needing
  treatment: header, deck bar, build slots, cards, tab strip, tables, stat rows,
  progress bars, the curve histogram, colour panels, driver rows, payoff cards,
  the tension bar and its legend, conflict rows, flag callouts, pills, buttons,
  selects, number inputs, the decklist textarea, the storage warning, footer.

  Note which CSS custom properties already exist in `:root` — `--bg`, `--panel`,
  `--panel2`, `--line`, `--tx`, `--dim`, `--good`, `--warn`, `--bad`, `--acc`, and
  the per-colour `--W/--U/--B/--R/--G`. Those variables are the seam: most of the
  restyle should flow from redefining them plus component classes, not from
  rewriting markup. Rewriting markup risks the render functions and the tests.

  Deliverable before any code: propose the palette, the material system, the type
  scale and the spacing scale. Get agreement on that before Phase 2.

PHASE 2 — the glass material
  Establish the layered background (a real backdrop for glass to sit against —
  flat black gives you nothing to blur) and the surface treatment: translucency,
  backdrop-filter blur, hairline border, layered shadow, subtle inner highlight
  along the top edge.

  Build it once on `.card`, at three elevations (base panel, raised card, overlay).
  Show it and agree on it before propagating. Getting this wrong and propagating
  costs the whole session.

PHASE 3 — propagate
  Apply the system across the Phase 1 inventory. The six analysis panels are read
  side by side and must stay visually consistent with each other. Tables are the
  hard part: dense numeric rows with glass behind them are where legibility
  usually dies.

PHASE 4 — motion
  Animate only where motion carries meaning:
    - curve histogram bars growing on first render, transitioning on decklist edit
    - source/progress bars easing to new widths
    - the big payoff percentages counting up
    - tab transitions
    - delta badges (e.g. "+9.4pp") drawing the eye as they appear
    - staggered card entrance on first paint
    - premium component states: focus rings, hover elevation, active press,
      disabled, and the "Costs loaded ✓" button success state

  Hard requirement: values change on every keystroke, so every animation must be
  interruptible and must never leave a number unreadable mid-edit. A counting
  animation that restarts on each character is worse than no animation. Consider
  debouncing the *animation* while leaving the *calculation* instant.

PHASE 5 — accessibility and performance
  Verify contrast with computed values rather than by eye. Wrap non-essential
  motion in `prefers-reduced-motion: reduce`. Then profile: type continuously into
  the 60-card Barrel Boys list and confirm no jank. backdrop-filter is expensive
  and this UI re-renders whole panels per keystroke — if many simultaneous blurred
  surfaces cause lag, cut the number of blurred layers rather than shipping a
  laggy editor.

PHASE 6 — verify and wrap
  Full suite green. Open from `file://` and over `http://` and confirm both work
  and no new network requests appear. Update CLAUDE.md's current-state section,
  write a session memory, commit and push.

CONSTRAINTS
  - Single file. No CDN links, no build step, no frameworks, no external fonts,
    no icon libraries. This is a deliberate architectural decision documented in
    CLAUDE.md — a tool one person opens by double-clicking, that works offline and
    deploys by drag-and-drop. Use system font stacks and inline SVG.
  - Do not change behaviour or math. No edits to analysis functions. If a genuine
    bug surfaces, raise it rather than silently fixing it inside a design pass.
  - The banner comments in index.html must survive verbatim: MATH CORE, PARSING,
    ANALYSIS, DIG PAYOFFS, RENDER, PERSISTENCE, SCRYFALL, WIRING.
    `tests/extract.js` slices the source on them and will fail loudly by name.
  - Contrast is not negotiable. Target WCAG AA (4.5:1) for body text and numeric
    cells, verified against the actual composited background — glass over a
    gradient is not the same as glass over flat colour.
  - Preserve red/amber/green semantics for good/warn/bad, and keep the five Magic
    colour swatches distinguishable including for colour-blind users. White and
    blue sitting next to each other on a glass surface is the specific risk.
  - No localStorage schema changes. Persistence is versioned and exports are the
    durable copy; a design pass must not invalidate saved builds.
  - Test with real content. Empty states and lorem hide the actual problems —
    a 25-row driver table and a 5-source red bar are where designs break.

OUT OF SCOPE
  - Mobile layout, card-name autocomplete, sample-deck gallery. Same "polish"
    bucket, but each is its own arc — only if the visual pass finishes early and
    Jeff agrees.
  - Tuning Barrel Boys further. The analysis is written; acting on it is a
    deckbuilding session, not this one.
  - The known modelling gaps (mana rocks and dorks uncounted, X spells reading as
    MV 0, split-card pips summed). All documented in
    memory/2026-08-11-first-real-decklist.md under Follow-ups. Not design work.
  - Any new analysis features.

DEFINITION OF DONE
  - `node tests/run-all.js` reports all 221 passing across 6 files
  - Every component in the Phase 1 inventory has the glass treatment; nothing is
    a visible leftover of the old flat theme
  - Charts and headline numbers animate on change, interruptibly, with no
    unreadable intermediate state while typing
  - Body text and numeric cells measure >= 4.5:1 against their composited
    background, checked with computed values and reported in the wrap-up
  - `prefers-reduced-motion: reduce` disables non-essential motion
  - Continuous typing into the 60-card Barrel Boys list stays responsive
  - Opens correctly from `file://` and over `http://`; no new network requests
  - Interactive states exist and are distinct for: hover, focus-visible, active,
    disabled, and loading/success on the Scryfall button
  - CLAUDE.md current-state section updated, session memory written, committed
    and pushed to origin
````
