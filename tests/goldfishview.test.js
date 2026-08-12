/* Goldfish view builders.

   gfBulkHTML and gfDrillHTML are pure — they read GF and return a string — which
   is the whole reason they live in GOLDFISH rather than RENDER. That makes the
   markup reachable from node, and worth reaching, because the failure mode of a
   template literal is not an exception. It is the word "undefined" rendered in
   the middle of a percentage, or "NaN%" in a table cell, and neither of those
   throws. Both are asserted against explicitly below.

   These are smoke tests over real simulated data, not layout tests. They cannot
   tell you the panel looks right; they can tell you it is not lying. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
  CNAME: { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' },
});

const mk = (name, o) => Object.assign(
  { name, qty: 4, land: false, produces: [], tapped: false, cmc: 1, subtypes: [], cost: '',
    pips: { W:0,U:0,B:0,R:0,G:0 } }, o);

const DECK = [
  mk('Plains',      { qty: 13, land: true, produces: ['W'], cmc: 0, subtypes: ['Plains'] }),
  mk('Island',      { qty: 11, land: true, produces: ['U'], cmc: 0, subtypes: ['Island'] }),
  mk('Mite',        { qty: 8,  cmc: 1, cost: '{W}',        pips: { W:1 } }),
  mk('Bear',        { qty: 10, cmc: 2, cost: '{1}{W}',     pips: { W:1 } }),
  mk('Sage',        { qty: 8,  cmc: 3, cost: '{1}{W}{U}',  pips: { W:1, U:1 } }),
  mk('Wrath',       { qty: 6,  cmc: 4, cost: '{2}{W}{W}',  pips: { W:2 } }),
  mk('Sphinx',      { qty: 4,  cmc: 5, cost: '{3}{U}{U}',  pips: { U:2 } }),
];
const deck = expandDeck(DECK);

/** Fill GF as gfRun would, without touching the DOM. */
function seedGF(count = 60) {
  GF.deck = deck;
  GF.ctx = { N: 60, landCount: 24, keepPlay: 52, keepDraw: 46 };
  GF.scored = scoreAll(runBulk(deck, 4242, count), deck, GF.ctx);
  GF.stats = bulkStats(GF.scored);
  GF.drill = null; GF.onPlay = true; GF.shown = 100; GF.errors = null; GF.stale = false;
}

/* The assertion that matters most: no template literal leaked a broken value. */
const BAD = /undefined|NaN|\[object Object\]|Infinity|null%/;
function clean(label, html) {
  const m = html.match(BAD);
  chk(label, !m, m ? `found "${m[0]}" near: ...${html.slice(Math.max(0, m.index - 70), m.index + 70)}...` : '');
}

group('fixture');
eq('deck is 60', deck.length, 60);
seedGF();
eq('60 hands scored', GF.scored.length, 60);

/* ============================================================
   Bulk view
   ============================================================ */
group('gfBulkHTML');

{
  const html = gfBulkHTML();
  clean('renders no broken values', html);

  chk('reports the hand count', html.includes('Across 60 hands'));
  chk('shows both ship rates', /shipped on the play/.test(html) && /shipped on the draw/.test(html));
  chk('shows both mean scores', (html.match(/mean score/g) || []).length === 2);
  chk('names both keep thresholds', html.includes('52') && html.includes('46'));
  chk('draws a land histogram', html.includes('gfhist'));
  chk('every hand row is clickable', (html.match(/data-gi="/g) || []).length === 60);
  chk('rows carry two score pills', (html.match(/class="pill /g) || []).length === 120);

  // Percentages must be percentages.
  const pcts = html.match(/>\d+\.\d%</g) || [];
  chk('percentages are well formed', pcts.length > 0 && pcts.every(p => {
    const v = parseFloat(p.slice(1)); return v >= 0 && v <= 100;
  }), JSON.stringify(pcts.slice(0, 6)));

  // Card names actually appear, so a row is identifiable.
  chk('hand rows list card names', html.includes('Plains') || html.includes('Bear'));
}

group('gfBulkHTML — paging');

{
  seedGF(250);
  const capped = gfBulkHTML();
  eq('only the first 100 rows are drawn', (capped.match(/data-gi="/g) || []).length, 100);
  chk('offers to show more', capped.includes('id="gfMore"'));
  chk('…and says the figures use every hand', /all 250 are in the figures/.test(capped));

  GF.shown = 250;
  const all = gfBulkHTML();
  eq('raising the cap draws the rest', (all.match(/data-gi="/g) || []).length, 250);
  chk('and the button goes away', !all.includes('id="gfMore"'));
  seedGF();
}

/* ============================================================
   Drill view
   ============================================================ */
group('gfBandsHTML — the legend must equal the thresholds');

{
  /* Hardcoding "52-75 = Keep" was the first version of this legend, and it
     became a lie the moment either threshold moved. The bands ARE the
     thresholds, so every assertion here is about them agreeing. */
  const d = gfBandsHTML(52, 46);
  clean('renders no broken values', d);
  chk('names the play threshold', d.includes('52'));
  chk('names the draw threshold', d.includes('46'));
  chk('the gap between them is its own band', /Kept on the draw only/.test(d));
  chk('the gap is 46-51', d.includes('46–51'), d);
  chk('ship band stops below the lower threshold', d.includes('0–45'), d);
  chk('snap keep is shown when both thresholds are below it', /76–100/.test(d));

  // Move the thresholds; the bands must move with them.
  const moved = gfBandsHTML(60, 55);
  chk('bands follow a raised threshold', moved.includes('55–59') && moved.includes('0–54'), moved);
  chk('…and no longer claim the old numbers', !moved.includes('46–51'));

  // Equal thresholds: there is no draw-only band to show.
  const same = gfBandsHTML(50, 50);
  chk('equal thresholds collapse the middle band', !/Kept on the draw only/.test(same), same);
  chk('…and still name a keep and a ship band', /Keep/.test(same) && /Ship it back/.test(same));

  /* Every band must read low-to-high, at every threshold. The first version
     printed "90–90" above the snap-keep line, because the Keep band stopped at
     GF_SNAP-1 even when the threshold was already past it. */
  const ranges = h => (h.match(/(\d+)–(\d+)/g) || []).map(r => r.split('–').map(Number));
  let allOrdered = true, checked = 0;
  for (let p = 0; p <= 100; p += 5) {
    for (const off of [0, 6, -6]) {
      const h = gfBandsHTML(p, Math.max(0, Math.min(100, p - off)));
      checked++;
      if (ranges(h).some(([a, b]) => b < a)) allOrdered = false;
      if (BAD.test(h)) allOrdered = false;
    }
  }
  chk(`no inverted or broken range across ${checked} threshold pairs`, allOrdered);

  const high = gfBandsHTML(90, 88);
  chk('above the snap-keep line, Keep runs to 100', high.includes('90–100'), high);
  chk('…and the snap-keep band is not also shown', !high.includes('76–100'), high);

  /* Reversed inputs — a stricter draw threshold than play. Odd, but typable, and
     the label has to follow the numbers rather than the expectation. */
  const rev = gfBandsHTML(40, 55);
  clean('renders cleanly with the thresholds reversed', rev);
  chk('reversed thresholds still order low to high', rev.includes('40–54'), rev);
  chk('…and the middle band names the PLAY column', /Kept on the play only/.test(rev), rev);
  chk('the normal way round still names the draw column',
      /Kept on the draw only/.test(gfBandsHTML(52, 46)));

  eq('the snap-keep line is shared with the scorer', GF_SNAP, 76);
}

group('gfDrillHTML');

{
  GF.drill = 0;
  const html = gfDrillHTML();
  clean('renders no broken values', html);

  chk('has a way back', html.includes('id="gfBack"'));
  chk('has a draw button', html.includes('id="gfDraw"'));
  chk('has a play/draw toggle', html.includes('id="gfToggle"'));
  chk('reset is disabled before any draw', /id="gfReset" disabled/.test(html));
  chk('shows the seed in hex', /seed <code>[0-9a-f]{8}<\/code>/.test(html));
  eq('seven cards in the opening hand', (html.match(/class="gfcard/g) || []).length, 7);
  chk('shows the score breakdown', html.includes('gfbreak'));
  eq('all five components are itemised', (html.match(/class="lb"/g) || []).length, 5);
  chk('library table is present', html.includes('Still in the library'));
  chk('library size is stated', /Still in the library — 53 cards/.test(html));
  chk('explains where the numbers come from', /never from the shuffled order/.test(html));
}

group('gfDrillHTML — drawing');

{
  GF.drill = 0;
  const inst = GF.scored[0].inst;
  const before = gfDrillHTML();
  chk('starts at 7 cards seen', /<div class="big">7<\/div>\s*<div class="mini">cards seen/.test(before));

  drawOne(inst, deck);
  const after = gfDrillHTML();
  clean('still renders cleanly after a draw', after);
  eq('an eighth card appears', (after.match(/class="gfcard/g) || []).length, 8);
  chk('the new card is marked', after.includes('gfcard') && / new"/.test(after));
  chk('cards seen advanced to 8', /<div class="big">8<\/div>\s*<div class="mini">cards seen/.test(after));
  chk('library fell to 52', /Still in the library — 52 cards/.test(after));
  chk('reset is now enabled', !/id="gfReset" disabled/.test(after));

  /* The opening-hand SCORE must not move as you draw — it rates the seven you
     were dealt. The probabilities are what move. */
  const scoreOf = h => (h.match(/class="big" style="color:var\(--\w+\)">(\d+)</) || [])[1];
  eq('the hand score does not change when you draw', scoreOf(after), scoreOf(before));

  // Draw the library dry; the Draw button must switch off rather than error.
  let guard = 0;
  while (libraryState(inst, deck).size > 0 && guard++ < 100) drawOne(inst, deck);
  const empty = gfDrillHTML();
  clean('renders cleanly with an empty library', empty);
  chk('draw is disabled at an empty library', /id="gfDraw" disabled/.test(empty));
  chk('library reports zero', /Still in the library — 0 cards/.test(empty));

  inst.drawn = 0; inst.hand = inst.order.slice(0, inst.handSize);
}

group('gfDrillHTML — play vs draw');

{
  GF.drill = 0;
  GF.onPlay = true;
  const play = gfDrillHTML();
  GF.onPlay = false;
  const draw = gfDrillHTML();
  GF.onPlay = true;

  clean('on-the-draw view renders cleanly', draw);
  chk('the toggle reflects the mode', play.includes('>On the play<') && draw.includes('>On the draw<'));
  chk('turn readout differs between them', play !== draw);
  chk('on the draw, turn 0 reads as the opening hand', /opening hand/.test(draw));
}

group('gfDrillHTML — dead cards are flagged');

{
  /* A hand holding a card the deck cannot support must show it as dead, both on
     the card face and in the score breakdown.

     The dead card is built into the DECK rather than spliced into an already
     scored hand. The drill view reports the score computed when the hand was
     dealt — correctly, since the score rates the opening seven and must not
     drift as you draw — so a card injected after scoring shows on the card face
     (computed live) but not in the breakdown (computed once). That is the app
     behaving properly, and the first version of this test was building a state
     the app cannot produce. */
  const savedDeck = GF.deck, savedScored = GF.scored, savedStats = GF.stats;

  /* Sphinx is SWAPPED OUT for Overrun rather than Overrun being appended: the
     base list already totals 60, so appending and trimming to 60 silently cut
     every Overrun copy back off the end. */
  const OVERRUN = mk('Overrun', { qty: 4, cmc: 5, cost: '{3}{G}{G}', pips: { G:2 } });
  const mixedList = DECK.filter(c => c.name !== 'Sphinx').concat([OVERRUN]);
  const mixed = expandDeck(mixedList);
  eq('the mixed fixture is still 60 cards', mixed.length, 60);
  eq('…and actually contains the dead card', mixed.filter(c => c.name === 'Overrun').length, 4);
  const ctx = { N: 60, landCount: mixed.filter(c => c.land).length, keepPlay: 52, keepDraw: 46 };
  const runs = runBulk(mixed, 31, 400);
  const scored = scoreAll(runs, mixed, ctx);

  const idx = scored.findIndex(r => r.inst.hand.some(c => c.name === 'Overrun'));
  chk('found a hand holding the uncastable card', idx >= 0);

  GF.deck = mixed; GF.ctx = ctx; GF.scored = scored; GF.drill = idx;
  const html = gfDrillHTML();
  clean('renders cleanly with a dead card', html);
  chk('the dead card is marked on its face', /gfcard[^"]*\bdead\b/.test(html));
  chk('the breakdown counts it', /cannot cast/.test(html));
  chk('its on-curve chance is zero', /<div class="pv">0%<\/div>/.test(html));

  GF.deck = savedDeck; GF.scored = savedScored; GF.stats = savedStats;
  GF.ctx = { N: 60, landCount: 24, keepPlay: 52, keepDraw: 46 };
  GF.drill = null;
}

group('gfDrillHTML — every hand renders');

{
  /* The one that catches the edge cases a fixture would never think of: land
     count zero, all lands, no castable spell, a hand of seven of the same card. */
  seedGF(400);
  let broken = null, checked = 0;
  for (let i = 0; i < GF.scored.length && !broken; i++) {
    GF.drill = i;
    const html = gfDrillHTML();
    checked++;
    const m = html.match(BAD);
    if (m) broken = `hand #${i + 1} (seed ${GF.scored[i].inst.seed}): "${m[0]}"`;
  }
  chk(`all ${checked} hands render without a broken value`, !broken, broken || '');

  const lands = GF.scored.map(r => r.play.lands);
  chk('the sample included a land-light hand', Math.min(...lands) <= 1, `min ${Math.min(...lands)}`);
  chk('the sample included a flooded hand', Math.max(...lands) >= 5, `max ${Math.max(...lands)}`);
  GF.drill = null;
}

process.exit(report());
