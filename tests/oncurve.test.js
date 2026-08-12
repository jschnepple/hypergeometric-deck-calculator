/* On-curve probability — the conditional colour math.

   This is the part of the feature most likely to be wrong in a way nobody
   notices, because a plausible-looking percentage is indistinguishable from a
   correct one. Three independent checks are applied:

     1. The closed form is compared against MONTE CARLO, using the goldfish's own
        shuffle to deal real games. If pSourcesAndLands disagrees with simulation,
        one of them is broken and the test says which case.

     2. It is CALIBRATED against the project's own DERIVED table. Those numbers
        came out of research/mana-engine by simulation, entirely independently of
        this code. Feeding a deck that holds exactly the required sources back in
        should return the ~90% castability the table was built to express. It
        does, flat across the grid — which is the strongest evidence available
        that the conditional model is right.

     3. The published KARSTEN table should calibrate at or ABOVE DERIVED, because
        it is the more conservative of the two. That relationship is asserted
        rather than assumed; it is what MATH CORE's comment already claims. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
});

const N = 60;

/* ============================================================
   The multivariate sum itself
   ============================================================ */
group('pSourcesAndLands — structure');

{
  eq('needing nothing is certain', pSourcesAndLands(0, 0, 14, 10, N, 7), 1, 1e-12);
  eq('more sources than exist is impossible', pSourcesAndLands(25, 1, 24, 0, N, 7), 0, 1e-12);
  eq('more lands than exist is impossible', pSourcesAndLands(1, 30, 14, 10, N, 12), 0, 1e-12);
  eq('drawing zero cards cannot find a source', pSourcesAndLands(1, 1, 14, 10, N, 0), 0, 1e-12);
  eq('every card is a source, one draw', pSourcesAndLands(1, 1, N, 0, N, 1), 1, 1e-12);

  chk('result is always a probability', [0, 1, 2, 3, 5, 9, 13].every(d =>
    [0, 1, 2, 3].every(s => {
      const v = pSourcesAndLands(s, s, 14, 10, N, d);
      return v >= 0 && v <= 1;
    })));

  // Requiring more can never be likelier than requiring less.
  let mono = true;
  for (let s = 1; s <= 4; s++) {
    if (pSourcesAndLands(s, 3, 14, 10, N, 9) > pSourcesAndLands(s - 1, 3, 14, 10, N, 9) + 1e-12) mono = false;
  }
  chk('monotone decreasing in sources required', mono);

  // With no "other lands", the joint collapses to a plain hypergeometric.
  eq('collapses to hyperAtLeast when b=0 and lands=sources',
     pSourcesAndLands(3, 3, 14, 0, N, 9), hyperAtLeast(3, 14, 9, N), 1e-9);
}

group('pSourcesAndLands — vs Monte Carlo');

{
  /* Deal real games with the goldfish shuffle and count how often the condition
     holds. 40k trials puts the standard error near 0.0025, so a 0.012 tolerance
     is ~5 sigma — tight enough to catch a real error, loose enough not to flake. */
  const TRIALS = 40000;
  const cases = [
    { a: 14, b: 10, needSrc: 1, needLands: 1, draws: 7 },
    { a: 12, b: 12, needSrc: 2, needLands: 3, draws: 9 },
    { a: 18, b: 6, needSrc: 2, needLands: 2, draws: 8 },
    { a: 9, b: 15, needSrc: 1, needLands: 4, draws: 10 },
    { a: 20, b: 7, needSrc: 3, needLands: 5, draws: 11 },
  ];

  for (const c of cases) {
    const deck = [];
    for (let i = 0; i < c.a; i++) deck.push({ k: 'src' });
    for (let i = 0; i < c.b; i++) deck.push({ k: 'land' });
    for (let i = deck.length; i < N; i++) deck.push({ k: 'spell' });

    let hits = 0;
    for (let s = 0; s < TRIALS; s++) {
      const sh = shuffle(deck, mulberry32(s * 2654435761 + 17));
      let src = 0, lands = 0;
      for (let i = 0; i < c.draws; i++) {
        if (sh[i].k === 'src') { src++; lands++; }
        else if (sh[i].k === 'land') lands++;
      }
      if (src >= c.needSrc && lands >= c.needLands) hits++;
    }
    const sim = hits / TRIALS;
    const exact = pSourcesAndLands(c.needSrc, c.needLands, c.a, c.b, N, c.draws);
    eq(`MC a=${c.a} b=${c.b} need ${c.needSrc}src/${c.needLands}land in ${c.draws}`, exact, sim, 0.012);
  }
}

/* ============================================================
   Calibration against the project's own tables
   ============================================================ */
group('calibration — DERIVED reproduces ~90%');

{
  /* DERIVED came out of research/mana-engine by Monte Carlo. If a deck holds
     exactly the sources it prescribes, this closed form should hand back the
     castability the table encodes. Pips 1-3 at the table's stated ~24 lands.

     4-pip rows are excluded here and tested separately: they demand up to 25
     sources, which a 24-land deck cannot hold at all, so the row is vacuous
     rather than wrong. That was a bug in the first draft of this test. */
  const lands = 24;
  const vals = [];
  for (const pips of [1, 2, 3]) {
    for (let turn = pips; turn <= 7; turn++) {
      const a = (DERIVED[pips] || {})[turn];
      if (a == null || a > lands) continue;
      const draws = Math.min(N, cardsSeen(turn, true));
      const p = pColorGivenLands(pips, turn, a, lands - a, N, draws);
      vals.push({ pips, turn, a, p });
    }
  }
  // 7 rows at 1 pip (turns 1-7), 6 at 2 pips (2-7), 5 at 3 pips (3-7).
  eq('the whole grid was covered', vals.length, 18);

  const lo = Math.min(...vals.map(v => v.p)), hi = Math.max(...vals.map(v => v.p));
  const mean = vals.reduce((s, v) => s + v.p, 0) / vals.length;

  chk('every cell sits in a 0.88-0.94 band around 90%', lo >= 0.88 && hi <= 0.94,
      `range ${lo.toFixed(4)}..${hi.toFixed(4)}`);
  eq('mean castability across the grid is ~0.91', mean, 0.91, 0.02);

  /* Flatness is the real signal. A model that got the CONDITIONING wrong — for
     instance by multiplying an unconditional colour probability by the land
     probability — would drift steadily with turn number instead of holding
     level. Spread across the grid must stay small. */
  chk('calibration is flat across turns, not drifting', hi - lo < 0.05,
      `spread ${(hi - lo).toFixed(4)}`);

  // 4-pip rows, at a land count that can actually hold them.
  const four = [];
  for (let turn = 4; turn <= 7; turn++) {
    const a = DERIVED[4][turn];
    if (a == null || a > 26) continue;
    four.push(pColorGivenLands(4, turn, a, 26 - a, N, Math.min(N, cardsSeen(turn, true))));
  }
  chk('4-pip rows calibrate too, at 26 lands', four.length > 0 && four.every(p => p >= 0.86 && p <= 0.95),
      JSON.stringify(four.map(p => +p.toFixed(3))));
}

group('calibration — KARSTEN is the conservative table');

{
  const lands = 24;
  let everyCellAtLeast = true, someCellAbove = false;
  for (const pips of [1, 2, 3]) {
    for (let turn = pips; turn <= 7; turn++) {
      const k = (KARSTEN[pips] || {})[turn], d = (DERIVED[pips] || {})[turn];
      if (k == null || d == null || k > lands || d > lands) continue;
      const draws = Math.min(N, cardsSeen(turn, true));
      const pk = pColorGivenLands(pips, turn, k, lands - k, N, draws);
      const pd = pColorGivenLands(pips, turn, d, lands - d, N, draws);
      if (pk < pd - 1e-9) everyCellAtLeast = false;
      if (pk > pd + 0.01) someCellAbove = true;
    }
  }
  chk('Karsten never calibrates BELOW the derived table', everyCellAtLeast);
  chk('…and is strictly more conservative in places', someCellAbove);
}

/* ============================================================
   onCurveFrom — the pure form
   ============================================================ */
group('onCurveFrom');

{
  const spell = (cmc, pips) => ({ name: 'X', cmc, pips: Object.assign({ W:0,U:0,B:0,R:0,G:0 }, pips) });
  const base = {
    libSize: 53, draws: 2, copiesLeft: 3, held: 0,
    landsLeft: 21, landsKnown: 3,
    sourcesLeft: { W: 11, U: 0, B: 0, R: 0, G: 0 },
    sourcesKnown: { W: 3, U: 0, B: 0, R: 0, G: 0 },
  };

  const held = onCurveFrom(spell(2, { W: 1 }), Object.assign({}, base, { held: 1 }));
  eq('a card in hand is certainly held', held.pHave, 1, 1e-12);
  eq('lands already in hand satisfy a 2-drop', held.pLands, 1, 1e-12);
  eq('colours already in hand satisfy one pip', held.pColors, 1, 1e-12);
  eq('…so it is a lock', held.p, 1, 1e-12);

  const gone = onCurveFrom(spell(2, { W: 1 }), Object.assign({}, base, { copiesLeft: 0 }));
  eq('no copies left and none held is impossible', gone.p, 0, 1e-12);

  const colourless = onCurveFrom(spell(3, {}), Object.assign({}, base, { held: 1 }));
  eq('a colourless spell has no colour factor', colourless.pColors, 1, 1e-12);

  chk('all three factors are probabilities', [1, 2, 3, 4, 5].every(c => {
    const r = onCurveFrom(spell(c, { W: 2 }), base);
    return [r.pHave, r.pLands, r.pColors, r.p].every(v => v >= 0 && v <= 1);
  }));

  eq('p is the product of its factors',
     onCurveFrom(spell(4, { W: 2 }), base).p,
     (r => r.pHave * r.pLands * r.pColors)(onCurveFrom(spell(4, { W: 2 }), base)), 1e-12);

  // A heavier colour requirement can never help.
  const one = onCurveFrom(spell(4, { W: 1 }), Object.assign({}, base, { held: 1 }));
  const two = onCurveFrom(spell(4, { W: 2 }), Object.assign({}, base, { held: 1 }));
  chk('two pips is no likelier than one', two.p <= one.p + 1e-12);

  // Turn is clamped to the table's range.
  eq('mana value 9 clamps to turn 7', onCurveFrom(spell(9, {}), base).turn, 7);
  eq('mana value 0 clamps to turn 1', onCurveFrom(spell(0, {}), base).turn, 1);
}

/* ============================================================
   onCurve — the instance wrapper
   ============================================================ */
group('onCurve on a real instance');

{
  const mk = (name, o) => Object.assign({ name, qty: 4, land: false, produces: [], tapped: false, cmc: 1, pips: { W:0,U:0,B:0,R:0,G:0 } }, o);
  const DECK = [
    mk('Plains', { qty: 24, land: true, produces: ['W'], cmc: 0 }),
    mk('Bear',   { qty: 20, cmc: 2, pips: { W:1,U:0,B:0,R:0,G:0 } }),
    mk('Wrath',  { qty: 16, cmc: 4, pips: { W:2,U:0,B:0,R:0,G:0 } }),
  ];
  const deck = expandDeck(DECK);
  eq('fixture is 60 cards', deck.length, 60);

  const ctxPlay = { N: 60, onPlay: true };
  const ctxDraw = { N: 60, onPlay: false };
  const wrath = DECK[2];

  let sawDiff = false, alwaysOrdered = true, alwaysProb = true;
  for (let s = 0; s < 400; s++) {
    const a = dealInstance(deck, s), b = dealInstance(deck, s);
    const pPlay = onCurve(wrath, a, deck, ctxPlay).p;
    const pDraw = onCurve(wrath, b, deck, ctxDraw).p;
    if (pDraw < pPlay - 1e-12) alwaysOrdered = false;
    if (pDraw > pPlay + 1e-9) sawDiff = true;
    if ([pPlay, pDraw].some(v => v < 0 || v > 1)) alwaysProb = false;
  }
  chk('on the draw is never worse than on the play', alwaysOrdered);
  chk('…and is usually strictly better', sawDiff);
  chk('every figure is a probability', alwaysProb);

  // Drawing a land must not lower the odds of a spell that wants lands.
  {
    const inst = dealInstance(deck, 4242);
    const before = onCurve(wrath, inst, deck, ctxPlay).p;
    let drewLand = false, after = before;
    for (let i = 0; i < 20 && !drewLand; i++) {
      const c = drawOne(inst, deck);
      if (c && c.land) { drewLand = true; after = onCurve(wrath, inst, deck, ctxPlay).p; }
    }
    chk('a land was drawn during the walk', drewLand);
    chk('drawing a land does not hurt a 4-drop', after >= before - 1e-9, `${before} -> ${after}`);
  }

  // Exhausting every copy from the library drops the card to zero.
  {
    const inst = dealInstance(deck, 909);
    const held = inst.hand.filter(c => c === wrath).length;
    if (held === 0) {
      let guard = 0;
      while (libraryState(inst, deck).counts.get(wrath) && guard++ < 60) drawOne(inst, deck);
    }
    chk('once every copy is seen, pHave is 1 not 0',
        onCurve(wrath, inst, deck, ctxPlay).pHave === 1);
  }

  // A card that is unsupportable by the deck's colours is dead.
  {
    const blue = mk('Counter', { cmc: 2, pips: { W:0,U:2,B:0,R:0,G:0 } });
    const inst = dealInstance(deck, 7);
    eq('a blue spell in a mono-white deck is dead', onCurve(blue, inst, deck, ctxPlay).pColors, 0, 1e-12);
  }
}

group('pDrawWithin');

{
  const mk = (name, o) => Object.assign({ name, qty: 4, land: false, produces: [], cmc: 1, pips: {} }, o);
  const DECK = [mk('Plains', { qty: 24, land: true, produces: ['W'], cmc: 0 }), mk('Bear', { qty: 36, cmc: 2 })];
  const deck = expandDeck(DECK);
  const inst = dealInstance(deck, 11);

  eq('zero draws finds nothing', pDrawWithin(DECK[0], inst, deck, 0), 0, 1e-12);
  chk('drawing the whole library is certain',
      pDrawWithin(DECK[0], inst, deck, 53) > 0.999999);

  let mono = true, prev = -1;
  for (const n of [0, 1, 2, 3, 5, 10, 20]) {
    const p = pDrawWithin(DECK[0], inst, deck, n);
    if (p < prev - 1e-12) mono = false;
    prev = p;
  }
  chk('more draws is never worse', mono);

  // A card fully in hand has none left to draw.
  const absent = { name: 'Nope', land: false, produces: [], cmc: 1, pips: {} };
  eq('a card not in the deck is never drawn', pDrawWithin(absent, inst, deck, 20), 0, 1e-12);
}

process.exit(report());
