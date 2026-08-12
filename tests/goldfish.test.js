/* Goldfish engine — seeded shuffling, instance dealing, library composition.

   The whole feature rests on one invariant: a shuffle is a PERMUTATION. If it
   ever drops or duplicates a card, every downstream probability is computed
   against a library that does not exist, and nothing above it would look wrong
   enough to notice. That is the first group below, and it is the one that
   matters most.

   The second concern is honest odds. `libraryState` is built by subtracting the
   KNOWN cards from the full deck rather than by reading the tail of the shuffled
   order. Both give the same multiset, but only one of them stays correct if
   someone later adds a tutor, a scry, or a bottoming step. There is a test that
   pins the two together so the cheap version can never quietly drift. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
});

/* ---------- fixtures ---------- */
const land  = (name, produces) => ({ name, qty: 4, land: true, produces, tapped: false, cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 } });
const spell = (name, cmc, pips, qty) => ({ name, qty: qty == null ? 4 : qty, land: false, produces: [], cmc, pips: Object.assign({ W:0,U:0,B:0,R:0,G:0 }, pips) });

// 60 cards: 24 lands, 36 spells
const DECK60 = [
  Object.assign(land('Plains', ['W']),   { qty: 12 }),
  Object.assign(land('Island', ['U']),   { qty: 12 }),
  spell('Bolt', 1, { R: 1 }, 12),
  spell('Bear', 2, { W: 1 }, 12),
  spell('Wrath', 4, { W: 2 }, 12),
];

/* ============================================================
   PRNG
   ============================================================ */
group('mulberry32');

{
  const a = mulberry32(12345), b = mulberry32(12345);
  const sa = [], sb = [];
  for (let i = 0; i < 20; i++) { sa.push(a()); sb.push(b()); }
  eq('same seed gives an identical stream', sa, sb);

  const c = mulberry32(12346);
  const sc = []; for (let i = 0; i < 20; i++) sc.push(c());
  chk('adjacent seeds give different streams', JSON.stringify(sa) !== JSON.stringify(sc));

  const r = mulberry32(7);
  let min = 1, max = 0, sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) { const v = r(); if (v < min) min = v; if (v > max) max = v; sum += v; }
  chk('output stays in [0,1)', min >= 0 && max < 1, `min ${min} max ${max}`);
  eq('mean is ~0.5 over 200k draws', sum / N, 0.5, 0.005);

  // A zero seed must not collapse to a constant stream — the guard in mulberry32.
  const z = mulberry32(0);
  const sz = []; for (let i = 0; i < 10; i++) sz.push(z());
  chk('seed 0 still varies', new Set(sz).size === 10, JSON.stringify(sz));
}

/* ============================================================
   Shuffle — the permutation invariant
   ============================================================ */
group('shuffle is a permutation');

{
  const deck = expandDeck(DECK60);
  eq('expandDeck yields 60 entries', deck.length, 60);
  eq('12 Plains expand to 12', deck.filter(c => c.name === 'Plains').length, 12);
  eq('a 12-of shares one object', new Set(deck.filter(c => c.name === 'Bolt')).size, 1);

  /* Multiset preserved across many different seeds.

     Keys are SORTED before stringifying. A plain object literal keeps insertion
     order, and a shuffle legitimately changes which card is seen first, so
     comparing unsorted tallies fails on a perfectly good shuffle. That was the
     first version of this test and it was the test that was wrong. */
  const tally = arr => {
    const m = {}; for (const c of arr) m[c.name] = (m[c.name] || 0) + 1;
    return Object.keys(m).sort().map(k => k + ':' + m[k]).join(',');
  };
  const want = tally(deck);
  let allSame = true, anyMoved = false;
  for (let s = 0; s < 300; s++) {
    const sh = shuffle(deck, mulberry32(s));
    if (sh.length !== deck.length) { allSame = false; break; }
    if (tally(sh) !== want) { allSame = false; break; }
    if (sh.some((c, i) => c !== deck[i])) anyMoved = true;
  }
  chk('300 shuffles all preserve the exact multiset', allSame);
  chk('…and they are not the identity', anyMoved);

  const before = deck.slice();
  shuffle(deck, mulberry32(99));
  chk('shuffle does not mutate its input', deck.every((c, i) => c === before[i]));

  const s1 = shuffle(deck, mulberry32(42));
  const s2 = shuffle(deck, mulberry32(42));
  chk('same seed reproduces the same order', s1.every((c, i) => c === s2[i]));
  const s3 = shuffle(deck, mulberry32(43));
  chk('a different seed gives a different order', s3.some((c, i) => c !== s1[i]));
}

group('shuffle uniformity');

{
  /* Chi-square on where one marked card lands. A biased Fisher-Yates — the
     common bug is picking j from the whole array instead of [0,i] — shows up
     here as a lumpy distribution. 12 slots, 11 df, 5% critical value 19.68.
     Run at 60k trials so the test is stable rather than flaky. */
  const small = expandDeck([
    { name: 'MARK', qty: 1, land: false, produces: [], cmc: 1, pips: {} },
    { name: 'other', qty: 11, land: false, produces: [], cmc: 1, pips: {} },
  ]);
  eq('12-card fixture', small.length, 12);

  const TRIALS = 60000, SLOTS = 12;
  const hits = new Array(SLOTS).fill(0);
  for (let s = 0; s < TRIALS; s++) {
    const sh = shuffle(small, mulberry32(s * 2654435761));
    hits[sh.findIndex(c => c.name === 'MARK')]++;
  }
  const expected = TRIALS / SLOTS;
  const chi2 = hits.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
  chk('marked card lands uniformly (chi-square < 19.68, 11 df)', chi2 < 19.68, `chi2 ${chi2.toFixed(2)} hits ${hits}`);
  chk('every slot was hit', hits.every(h => h > 0));
}

/* ============================================================
   Instances
   ============================================================ */
group('dealInstance');

{
  const deck = expandDeck(DECK60);
  const inst = dealInstance(deck, 2026);

  eq('opening hand is 7', inst.hand.length, 7);
  eq('nothing drawn yet', inst.drawn, 0);
  eq('full order retained', inst.order.length, 60);
  eq('seed recorded', inst.seed, 2026);
  chk('hand is the front of the order', inst.hand.every((c, i) => c === inst.order[i]));

  const again = dealInstance(deck, 2026);
  chk('same seed deals the same hand', again.hand.every((c, i) => c === inst.hand[i]));

  const other = dealInstance(deck, 2027);
  chk('a different seed deals a different order', other.order.some((c, i) => c !== inst.order[i]));

  const six = dealInstance(deck, 2026, 6);
  eq('handSize is honoured', six.hand.length, 6);
  chk('a 6-card hand is the same order, one card shorter',
      six.hand.every((c, i) => c === inst.order[i]));
}

group('libraryState');

{
  const deck = expandDeck(DECK60);
  const inst = dealInstance(deck, 555);
  const lib = libraryState(inst, deck);

  eq('library is 53 after the opener', lib.size, 53);
  let sum = 0; for (const n of lib.counts.values()) sum += n;
  eq('counts sum to the library size', sum, 53);

  // Hand + library must reconstitute the deck exactly.
  const recon = new Map();
  for (const c of inst.hand) recon.set(c, (recon.get(c) || 0) + 1);
  for (const [c, n] of lib.counts) recon.set(c, (recon.get(c) || 0) + n);
  const full = new Map();
  for (const c of deck) full.set(c, (full.get(c) || 0) + 1);
  let matches = recon.size === full.size;
  for (const [c, n] of full) if (recon.get(c) !== n) matches = false;
  chk('hand + library reconstitutes the deck', matches);

  /* The composition route and the read-the-tail route must agree. If they ever
     diverge, libraryState is lying and every probability above it is wrong. */
  const tailCounts = new Map();
  for (const c of inst.order.slice(7)) tailCounts.set(c, (tailCounts.get(c) || 0) + 1);
  let same = tailCounts.size === lib.counts.size;
  for (const [c, n] of tailCounts) if (lib.counts.get(c) !== n) same = false;
  chk('composition subtraction agrees with the shuffled tail', same);

  chk('a card exhausted from the library is absent, not zero',
      [...lib.counts.values()].every(n => n > 0));
}

group('drawOne');

{
  const deck = expandDeck(DECK60);
  const inst = dealInstance(deck, 31337);

  const next = inst.order[7];
  const got = drawOne(inst, deck);
  chk('draws the next card in this instance own order', got === next);
  eq('hand grew to 8', inst.hand.length, 8);
  eq('drawn counter advanced', inst.drawn, 1);
  eq('library shrank to 52', libraryState(inst, deck).size, 52);

  chk('the drawn card is now known', knownCards(inst).includes(got));

  // Draw the deck out; the last call must return null rather than undefined.
  let guard = 0;
  while (drawOne(inst, deck) !== null && guard++ < 200);
  eq('draws stop exactly at deck size', inst.hand.length, 60);
  eq('empty library', libraryState(inst, deck).size, 0);
  eq('drawing an empty library returns null', drawOne(inst, deck), null);
}

group('runBulk');

{
  const deck = expandDeck(DECK60);
  const runs = runBulk(deck, 1000, 50);
  eq('50 instances', runs.length, 50);
  eq('seeds are consecutive from the base', runs.map(r => r.seed).slice(0, 3), [1000, 1001, 1002]);

  const sigs = new Set(runs.map(r => r.hand.map(c => c.name).join('|')));
  chk('instances are not clones of each other', sigs.size > 40, `${sigs.size} distinct openers of 50`);

  const rerun = runBulk(deck, 1000, 50);
  chk('a run is reproducible from its base seed',
      rerun.every((r, i) => r.hand.every((c, j) => c === runs[i].hand[j])));

  /* Land counts across many openers should centre on 7 * 24/60 = 2.8. This is
     the sanity check that the shuffle feeds realistic hands rather than just
     legal ones — a biased shuffle can preserve the multiset and still deal
     land-light openers forever. */
  const many = runBulk(deck, 77000, 4000);
  const mean = many.reduce((s, r) => s + r.hand.filter(c => c.land).length, 0) / many.length;
  eq('mean lands in an opening 7 is ~2.8', mean, 2.8, 0.08);
}

/* ============================================================
   Validity gate
   ============================================================ */
group('validateDeck');

{
  const ok = validateDeck(DECK60, [], 60);
  chk('a legal 60 passes', ok.ok, JSON.stringify(ok.errors));
  eq('…with no errors', ok.errors.length, 0);

  const short = validateDeck(DECK60, [], 75);
  chk('count mismatch fails', !short.ok);
  chk('…and names both numbers', /60/.test(short.errors[0]) && /75/.test(short.errors[0]), short.errors[0]);

  const unres = validateDeck(DECK60, ['Fire // Ice', 'Bala Ged Recovery'], 60);
  chk('unresolved cards fail', !unres.ok);
  chk('…and are named in the message', /Fire \/\/ Ice/.test(unres.errors[0]), unres.errors[0]);

  const noLand = validateDeck([spell('Bolt', 1, { R: 1 }, 60)], [], 60);
  chk('a landless deck fails', !noLand.ok);
  chk('…for the land reason', noLand.errors.some(e => /No lands/i.test(e)));

  const noSpell = validateDeck([Object.assign(land('Plains', ['W']), { qty: 60 })], [], 60);
  chk('a spell-less deck fails', !noSpell.ok);
  chk('…for the spell reason', noSpell.errors.some(e => /No spells/i.test(e)));

  const empty = validateDeck([], [], 60);
  chk('an empty list fails', !empty.ok);
  chk('…and says so plainly', empty.errors.some(e => /empty/i.test(e)));

  const tiny = validateDeck([Object.assign(land('Plains', ['W']), { qty: 3 }), spell('Bolt', 1, { R: 1 }, 2)], [], 5);
  chk('fewer than 8 cards fails', !tiny.ok);
  chk('…for the too-small reason', tiny.errors.some(e => /Fewer than 8/i.test(e)));

  // All independent failures reported together, not one at a time.
  const multi = validateDeck([spell('Bolt', 1, { R: 1 }, 40)], ['Whatsit'], 60);
  chk('multiple failures are reported in one pass', multi.errors.length >= 3, JSON.stringify(multi.errors));
}

process.exit(report());
