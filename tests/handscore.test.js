/* Hand scoring — the keepability heuristic.

   A heuristic cannot be tested for correctness the way the hypergeometric can:
   there is no right answer to compare against. What CAN be pinned down is that
   it behaves sanely, and those are the properties tested here — a hand with no
   lands must never be keepable, a strictly better hand must never score lower,
   the components must actually sum to the reported total, and the same hand must
   not score worse on the draw than on the play.

   Hands are built by seed search rather than by hand-assembly, so every case
   below is a real shuffle of a real deck rather than a fixture that could never
   be dealt. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
});

const mk = (name, o) => Object.assign(
  { name, qty: 4, land: false, produces: [], tapped: false, cmc: 1, subtypes: [],
    pips: { W:0,U:0,B:0,R:0,G:0 } }, o);

// A plausible mono-white deck: 24 lands, a real curve.
const DECK = [
  mk('Plains', { qty: 24, land: true, produces: ['W'], cmc: 0, subtypes: ['Plains'] }),
  mk('Mite',   { qty: 8,  cmc: 1, pips: { W:1 } }),
  mk('Bear',   { qty: 10, cmc: 2, pips: { W:1 } }),
  mk('Knight', { qty: 8,  cmc: 3, pips: { W:2 } }),
  mk('Wrath',  { qty: 6,  cmc: 4, pips: { W:2 } }),
  mk('Angel',  { qty: 4,  cmc: 5, pips: { W:2 } }),
];
const deck = expandDeck(DECK);
const CTX = { N: 60, landCount: 24, onPlay: true };
const ctx = o => Object.assign({}, CTX, o);

/** First seed whose opening hand satisfies `pred`. */
function findHand(pred, limit = 20000) {
  for (let s = 0; s < limit; s++) {
    const inst = dealInstance(deck, s);
    if (pred(inst.hand, inst)) return inst;
  }
  return null;
}
const nLands = h => h.filter(c => c.land).length;

group('fixture');
eq('deck is 60', deck.length, 60);
eq('24 lands', deck.filter(c => c.land).length, 24);

/* ============================================================
   scoreLands in isolation
   ============================================================ */
group('scoreLands');

{
  eq('a 0-land hand is worthless', scoreLands(0, 7, 24, 60, true), 0);
  eq('an all-land hand is worthless', scoreLands(7, 7, 24, 60, true), 0);

  // 24/60 of 7 is 2.8, so the ideal is 3.
  const at = n => scoreLands(n, 7, 24, 60, true);
  chk('3 lands is the peak for a 24-land deck', at(3) >= at(2) && at(3) >= at(4));
  chk('2 lands beats 1', at(2) > at(1));
  chk('1 land is nearly unkeepable', at(1) < 0.2, String(at(1)));
  chk('5 lands is worse than 4', at(5) < at(4));
  chk('being a land short is worse than being a land long', at(2) < at(4));

  /* The band must move with the deck. A 17-land deck wants 2 in an opener; a
     28-land deck wants 3-4. Judging both against a fixed 3-4 would be wrong for
     at least one of them. */
  chk('a 17-land deck is happy with 2', scoreLands(2, 7, 17, 60, true) > scoreLands(2, 7, 28, 60, true));
  chk('a 28-land deck is happier with 4 than a 17-land deck is',
      scoreLands(4, 7, 28, 60, true) > scoreLands(4, 7, 17, 60, true));

  // On the draw helps the short side only.
  chk('on the draw rescues a land-light hand', scoreLands(2, 7, 24, 60, false) > scoreLands(2, 7, 24, 60, true));
  eq('…but does nothing for a flooded one',
     scoreLands(5, 7, 24, 60, false), scoreLands(5, 7, 24, 60, true));
  eq('…and cannot rescue a 0-land hand', scoreLands(0, 7, 24, 60, false), 0);

  chk('always a fraction', [0,1,2,3,4,5,6,7].every(n =>
    [true,false].every(p => { const v = scoreLands(n,7,24,60,p); return v>=0 && v<=1; })));
}

/* ============================================================
   scoreHand structure
   ============================================================ */
group('scoreHand — structure');

{
  const inst = dealInstance(deck, 12345);
  const r = scoreHand(inst, deck, ctx());

  eq('five components', r.comps.length, 5);
  eq('components are the expected keys', r.comps.map(c => c.key), ['lands','early','curve','spread','dead']);
  eq('weights total 100', r.comps.reduce((s, c) => s + c.weight, 0), 100);

  const summed = r.comps.reduce((s, c) => s + c.points, 0);
  eq('points sum to the reported score', r.score, summed, 1e-9);
  chk('every component value is a fraction', r.comps.every(c => c.value >= 0 && c.value <= 1));
  chk('score is 0-100', r.score >= 0 && r.score <= 100);
  chk('every component carries a human note', r.comps.every(c => typeof c.note === 'string' && c.note.length > 0));
  chk('a label was assigned', ['Snap keep','Keep','Marginal','Ship'].includes(r.label));
  eq('lands reported matches the hand', r.lands, nLands(inst.hand));
  eq('lands + spells is the hand', r.lands + r.spells, 7);
}

/* ============================================================
   The properties that must always hold
   ============================================================ */
group('scoreHand — invariants over 600 real shuffles');

{
  let allBounded = true, allSummed = true, zeroLandKept = false, allLandKept = false;
  let drawBelowPlay = 0, sawDrawAbove = false;

  for (let s = 0; s < 600; s++) {
    const inst = dealInstance(deck, s);
    const p = scoreHand(inst, deck, ctx({ onPlay: true }));
    const d = scoreHand(inst, deck, ctx({ onPlay: false, keepThreshold: p.threshold }));

    if (p.score < 0 || p.score > 100 || d.score < 0 || d.score > 100) allBounded = false;
    if (Math.abs(p.score - p.comps.reduce((a, c) => a + c.points, 0)) > 1e-9) allSummed = false;
    if (p.lands === 0 && p.keep) zeroLandKept = true;
    if (p.lands === 7 && p.keep) allLandKept = true;
    if (d.score < p.score - 1e-9) drawBelowPlay++;
    if (d.score > p.score + 1e-9) sawDrawAbove = true;
  }

  chk('every score stays in range', allBounded);
  chk('components always sum to the total', allSummed);
  chk('a 0-land hand is NEVER a keep', !zeroLandKept);
  chk('an all-land hand is NEVER a keep', !allLandKept);
  chk('the same hand never scores worse on the draw', drawBelowPlay === 0, `${drawBelowPlay} regressions`);
  chk('…and often scores better', sawDrawAbove);
}

/* ============================================================
   Ordering — better hands score higher
   ============================================================ */
group('scoreHand — ordering');

{
  const zero  = findHand(h => nLands(h) === 0);
  const one   = findHand(h => nLands(h) === 1);
  const three = findHand(h => nLands(h) === 3 && new Set(h.filter(c=>!c.land).map(c=>c.cmc)).size >= 3);
  const six   = findHand(h => nLands(h) === 6);

  chk('found a 0-land hand', !!zero);
  chk('found a 1-land hand', !!one);
  chk('found a 3-land hand with a spread curve', !!three);
  chk('found a 6-land hand', !!six);

  const S = i => scoreHand(i, deck, ctx()).score;
  chk('3 lands + spread beats 1 land', S(three) > S(one), `${S(three).toFixed(1)} vs ${S(one).toFixed(1)}`);
  chk('3 lands beats 6 lands', S(three) > S(six), `${S(three).toFixed(1)} vs ${S(six).toFixed(1)}`);
  chk('1 land beats 0 lands', S(one) > S(zero), `${S(one).toFixed(1)} vs ${S(zero).toFixed(1)}`);
  chk('a 0-land hand ships', scoreHand(zero, deck, ctx()).label === 'Ship');
  chk('a 3-land spread hand keeps', scoreHand(three, deck, ctx()).keep,
      `scored ${S(three).toFixed(1)}`);

  /* Curve spread: two hands with the SAME land count, one clumped, one spread.
     The spread hand must not score lower. */
  const spread  = findHand(h => nLands(h) === 3 && new Set(h.filter(c=>!c.land).map(c=>c.cmc)).size === 4);
  const clumped = findHand(h => nLands(h) === 3 && new Set(h.filter(c=>!c.land).map(c=>c.cmc)).size === 1);
  if (spread && clumped) {
    chk('at equal lands, a spread curve beats a clumped one', S(spread) > S(clumped),
        `${S(spread).toFixed(1)} vs ${S(clumped).toFixed(1)}`);
  } else {
    chk('at equal lands, a spread curve beats a clumped one (pair found)', false, 'no matching pair in 20k seeds');
  }
}

group('scoreHand — dead cards');

{
  /* Splice a blue spell into a mono-white deck. It can never be cast, so the
     dead-card component must register it and the score must drop. */
  const blue = mk('Counter', { qty: 0, cmc: 2, pips: { U: 2 } });
  const inst = findHand(h => nLands(h) === 3);
  const clean = scoreHand(inst, deck, ctx());

  const poisoned = Object.assign({}, inst, { order: inst.order.slice() });
  const swapIdx = poisoned.order.findIndex((c, i) => i < 7 && !c.land);
  poisoned.order[swapIdx] = blue;
  poisoned.hand = poisoned.order.slice(0, 7);
  const dirty = scoreHand(poisoned, deck.concat([blue]), ctx());

  const deadComp = dirty.comps.find(c => c.key === 'dead');
  chk('an uncastable card is detected', deadComp.value < 1, `dead value ${deadComp.value}`);
  chk('…and mentioned in the note', /cannot cast/.test(deadComp.note), deadComp.note);
  chk('…and drags the score down', dirty.score < clean.score,
      `${dirty.score.toFixed(1)} vs ${clean.score.toFixed(1)}`);
}

group('firstPlayTurn');

{
  const inst = findHand(h => nLands(h) === 3 && h.some(c => c.cmc === 1));
  chk('a hand with a 1-drop and 3 lands plays on turn 1', firstPlayTurn(inst.hand, deck, inst, ctx()) === 1);

  const noLand = findHand(h => nLands(h) === 0);
  chk('a landless hand still names a turn, just a late one',
      firstPlayTurn(noLand.hand, deck, noLand, ctx()) > 1);

  // eq() cannot compare Infinity — Math.abs(Inf - Inf) is NaN — so assert directly.
  const allLand = findHand(h => nLands(h) === 7);
  chk('an all-land hand has no play at all',
      !!allLand && firstPlayTurn(allLand.hand, deck, allLand, ctx()) === Infinity);
}

group('deployment — the one-land regression');

{
  /* The bug this component exists to prevent.

     Scoring "earliest turn with a play" gave a hand of one Plains and two
     one-drops full marks, and 79% of one-land hands came back as KEEPS. A
     one-land hand in a 24-land deck is a mulligan close to always. If this
     group ever goes red, the deployment model has regressed to measuring the
     first play instead of sustained action. */
  const runs = runBulk(deck, 900, 4000);
  const byLands = {};
  for (const inst of runs) {
    const r = scoreHand(inst, deck, ctx({ keepThreshold: 52 }));
    const b = byLands[r.lands] || (byLands[r.lands] = { n: 0, keep: 0 });
    b.n++; if (r.keep) b.keep++;
  }
  const rate = n => byLands[n] ? byLands[n].keep / byLands[n].n : 0;

  chk('0-land hands are never kept', rate(0) === 0);
  chk('1-land hands are almost never kept', rate(1) < 0.10, `${(rate(1)*100).toFixed(1)}% kept`);
  chk('2-land hands are usually kept', rate(2) > 0.80, `${(rate(2)*100).toFixed(1)}% kept`);
  chk('3-land hands are nearly always kept', rate(3) > 0.95, `${(rate(3)*100).toFixed(1)}% kept`);
  chk('6-land hands are treated with suspicion', rate(6) < rate(3));

  /* The deployment score itself must separate land-light from land-healthy.

     Compared as MEANS over many hands, not as two seed-picked examples. A single
     3-land hand can legitimately score low if its curve has gaps, so a one-to-one
     comparison is noise — that was the first version of this assertion and it
     failed on a hand that was doing nothing wrong. */
  const meanDeploy = n => {
    const hits = runs.filter(i => nLands(i.hand) === n).slice(0, 300);
    return hits.reduce((s, i) => s + deployment(i.hand, i, deck, ctx()).score, 0) / hits.length;
  };
  const dOne = meanDeploy(1), dTwo = meanDeploy(2), dThree = meanDeploy(3);
  chk('deployment rises with land count', dThree > dTwo && dTwo > dOne,
      `1:${dOne.toFixed(3)} 2:${dTwo.toFixed(3)} 3:${dThree.toFixed(3)}`);
  chk('…and separates 1-land from 3-land clearly', dThree > dOne + 0.25,
      `${dOne.toFixed(3)} vs ${dThree.toFixed(3)}`);

  const one = findHand(h => nLands(h) === 1);

  const dep = deployment(one.hand, one, deck, ctx());
  eq('deployment reports all four turns', dep.turns.length, 4);
  chk('turn probabilities are probabilities', dep.turns.every(t => t.p >= 0 && t.p <= 1));
  chk('a land-light hand decays across the turns',
      dep.turns[3].p <= dep.turns[0].p, JSON.stringify(dep.turns.map(t => +t.p.toFixed(3))));

  /* Spells are consumed. Two one-drops must not cover four turns, even with all
     the lands in the world — otherwise the "keeps acting" claim is a lie. */
  const twoDrops = findHand(h => nLands(h) === 5 && h.filter(c => !c.land).length === 2);
  if (twoDrops) {
    const d = deployment(twoDrops.hand, twoDrops, deck, ctx());
    chk('a hand with only 2 spells cannot cover 4 turns',
        d.turns.filter(t => t.mv !== null).length <= 2,
        JSON.stringify(d.turns.map(t => t.mv)));
  } else {
    chk('a hand with only 2 spells cannot cover 4 turns (fixture found)', false, 'none in 20k seeds');
  }
}

/* ============================================================
   Bulk
   ============================================================ */
group('scoreAll / bulkStats');

{
  const runs = runBulk(deck, 900, 400);
  const scored = scoreAll(runs, deck, ctx({ keepPlay: 52, keepDraw: 46 }));
  eq('every instance scored', scored.length, 400);
  chk('each carries both columns', scored.every(r => r.play && r.draw));
  chk('the two columns come from the same shuffle',
      scored.every(r => r.play.lands === r.draw.lands));

  const st = bulkStats(scored);
  eq('count matches', st.count, 400);
  chk('ship rates are fractions', st.shipPlay >= 0 && st.shipPlay <= 1 && st.shipDraw >= 0 && st.shipDraw <= 1);
  chk('mean scores are in range', st.meanPlay > 0 && st.meanPlay < 100 && st.meanDraw > 0 && st.meanDraw < 100);
  chk('you ship fewer hands on the draw', st.shipDraw <= st.shipPlay,
      `play ${(st.shipPlay*100).toFixed(1)}% draw ${(st.shipDraw*100).toFixed(1)}%`);
  chk('mean is higher on the draw', st.meanDraw >= st.meanPlay);

  const histTotal = Object.values(st.landHist).reduce((a, b) => a + b, 0);
  eq('land histogram covers every hand', histTotal, 400);

  /* A well-built 24-land deck should not be shipping a third of its openers.
     If this fires, either the deck fixture or the weighting has drifted. */
  chk('ship rate on the play is plausible (5-35%)', st.shipPlay > 0.05 && st.shipPlay < 0.35,
      `${(st.shipPlay*100).toFixed(1)}%`);
}

group('performance');

{
  /* The drill-in view recomputes on every draw, and the bulk view scores every
     instance twice. Neither is allowed to feel slow. */
  const runs = runBulk(deck, 5000, 1000);
  const t0 = Date.now();
  scoreAll(runs, deck, ctx({ keepPlay: 52, keepDraw: 46 }));
  const ms = Date.now() - t0;
  chk('1000 instances score twice each in under 4s', ms < 4000, `${ms}ms`);
  console.log(`      (1000 hands, both columns: ${ms}ms)`);
}

process.exit(report());
