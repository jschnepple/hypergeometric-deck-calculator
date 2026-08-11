# Next session — glassmorphism visual overhaul

Status: **pending.** Written 2026-08-11. Paste the block below to start.

---

## GOAL

Redesign the calculator's visual layer to an Apple-style glassmorphism aesthetic and
add motion to the charts and interactive components — without changing any behaviour
or math.

## CONTEXT

The tool is complete and verified. This is a presentation pass ahead of sharing it
with friends. Read `CLAUDE.md` and `MEMORY.md` first; `memory/2026-08-11-build-and-deploy.md`
has the full build history and the reasoning behind the architecture.

The current design is a flat dark theme with CSS custom properties already defined in
`:root` (`--bg`, `--panel`, `--panel2`, `--line`, `--tx`, `--dim`, `--good`, `--warn`,
`--bad`, `--acc`, plus per-colour `--W/--U/--B/--R/--G`). Those variables are the seam
to work through — most of the restyle should flow from redefining them plus the
component classes, rather than rewriting markup.

## KEY FILES

- `index.html` — the entire app. CSS is in one `<style>` block at the top; JS in one
  `<script>` block at the bottom.
- `tests/run-all.js` — 152 tests. Run before starting and after every change.
- `tests/extract.js` — explains how the tests read the source.
- `CLAUDE.md` — architecture, house rules, known limitations.

## TASK

**Phase 1 — survey and plan.** Run `node tests/run-all.js` to confirm a green
baseline. Read the CSS block and inventory every component that needs treatment:
header, deck bar, cards, tabs, tables, stat rows, bars, the curve histogram, payoff
panels, the tension bar, conflict rows, pills, buttons, form controls, footer.
Propose the palette and material system before writing code.

**Phase 2 — the glass material.** Establish the layered background and the glass
surface treatment (translucency, `backdrop-filter` blur, hairline borders, layered
shadows, subtle inner highlight). Get one component right — probably `.card` — and
agree on it before propagating.

**Phase 3 — propagate.** Apply to every component from the Phase 1 inventory. Keep
the six analysis panels visually consistent; they are read side by side.

**Phase 4 — motion.** Add animation where it carries meaning rather than decoration:
- curve histogram bars growing on render and transitioning when the decklist changes
- progress/source bars easing to new widths
- the big payoff percentages counting up
- tab transitions
- delta badges (`+9.4pp`) drawing attention when they appear
- staggered entrance for cards on first paint
Numbers change on every keystroke, so animations must be interruptible and must never
make a value unreadable mid-edit.

**Phase 5 — verify.** Full test suite green. Check contrast, reduced motion, and
performance (see constraints). Confirm the app still opens correctly from `file://`
as well as over `https://`.

## CONSTRAINTS

- **Single file.** No CDN links, no build step, no frameworks, no external fonts.
  This was a deliberate architectural decision — see CLAUDE.md.
- **Do not change behaviour or math.** No edits to the analysis functions. If a
  genuine bug surfaces, raise it rather than silently fixing it inside a design pass.
- **The banner comments in `index.html` must survive.** `tests/extract.js` slices the
  source on `MATH CORE`, `PARSING`, `ANALYSIS`, `DIG PAYOFFS`, `RENDER`,
  `PERSISTENCE`, `SCRYFALL`. Renaming or removing one breaks the suite.
- **Contrast is not negotiable.** Glassmorphism routinely destroys legibility. This is
  a dense numeric tool — every number, table cell and label must stay readable against
  whatever sits behind it. Target WCAG AA (4.5:1) for body text and verify, don't eyeball.
- **Honour `prefers-reduced-motion`.** Wrap non-essential animation in the media query.
- **Watch `backdrop-filter` performance.** It is expensive, and this UI re-renders the
  whole panel on every keystroke. If blur on many simultaneous surfaces causes jank
  while typing in the decklist, reduce the number of blurred layers rather than
  accepting a laggy editor. Test by typing continuously into a 60-card list.
- **Colour identity must stay unambiguous.** The `--W/--U/--B/--R/--G` swatches encode
  Magic's colours; keep them distinguishable, including for colour-blind users.
- Preserve the red/amber/green semantics for good/warn/bad states.

## OUT OF SCOPE

- Mobile layout, autocomplete, sample-deck gallery — deferred from the same "polish"
  bucket; do them only if the visual pass finishes early and Jeff agrees.
- Loading Jeff's real decklist and tuning the brew — that is the other open thread and
  deserves its own session.
- Any new analysis features.

## DEFINITION OF DONE

1. `node tests/run-all.js` reports all 152 passing.
2. Every component from the Phase 1 inventory has the glass treatment; nothing looks
   like a leftover from the old flat theme.
3. Charts and key numbers animate on change, interruptibly, with no unreadable
   intermediate states.
4. Body text and numeric cells meet 4.5:1 contrast, verified with computed values.
5. `prefers-reduced-motion: reduce` disables non-essential animation.
6. Typing continuously into a 60-card decklist stays responsive.
7. Works from `file://` and over `https://`; no new network requests.
8. `CLAUDE.md` current-state section updated; a new memory file written.
