/* Deck goals, the Venn-atom partition, and the London mulligan chain.

   Four things are guarded here, and they fail in different ways.

   1. TYPE READING. `cardTypes` decides delirium. Supertypes are not card types
      and subtypes are not card types, so a Legendary Snow Artifact Creature is
      two types and a "Basic Land — Mountain" is one. Getting that wrong inflates
      delirium quietly and plausibly.

   2. THE PARTITION. This is the one with teeth. Overlapping clause sets have to
      be partitioned on Venn atoms, not per set. The sharpest expression of it is
      below: when one clause's set is a SUBSET of another's, the conjunction
      collapses to the smaller clause exactly — so the exact answer has a closed
      form we can check against `hyperAtLeast` to 1e-12, and both naive models
      miss it in the same direction for the same reason.

   3. THE CHAIN. `mulliganChain` is a probability distribution over where you
      stop. If it does not sum to 1 it is not one, so that is asserted for every
      maxMulls it can be given.

   4. INDEPENDENT AGREEMENT. The closed form is cross-validated against the
      goldfish's own seeded dealer for four goals of different shapes, including
      one with overlapping clause sets and one built on card types. This is the
      pattern that made the session-four on-curve maths trustworthy and it is
      held to the same standard: if it disagrees, assume the closed form is
      wrong before assuming the simulation is.

   Everything is seeded, so a pass here is reproducible rather than lucky. */
const { load, section } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard', 'payoffs', 'goals', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {}, PAYOFFS: [],
});

/* ---------- fixtures ---------- */
const card = (name, qty, typeLine, cmc, land) => ({
  name, qty, typeLine, cmc: cmc || 0, land: !!land,
  produces: land ? ['R'] : [], tapped: false,
  pips: { W:0, U:0, B:0, R:0, G:0 }, subtypes: [],
});

/* Boros Dwarves in miniature: the Axe, the Mauler, filler, and a land base. */
const DWARVES = [
  card('Leyline Axe',    4,  'Artifact — Equipment', 2),
  card('Dwarven Mauler', 4,  'Creature — Dwarf Warrior', 3),
  card('Bolt',           12, 'Instant', 1),
  card('Bear',           16, 'Creature — Bear', 2),
  card('Mountain',       24, 'Basic Land — Mountain', 0, true),
];

/* Creatures are a strict SUBSET of nonland permanents here, which is what makes
   the conjunction collapse and gives the partition test its closed form. */
const SUBSET = [
  card('Bears',    20, 'Creature — Bear', 2),
  card('Signet',   8,  'Artifact', 2),
  card('Bolt',     8,  'Instant', 1),
  card('Mountain', 24, 'Basic Land — Mountain', 0, true),
];

/* Six card types plus lands, for delirium. */
const TYPES = [
  card('Sculptor',  6, 'Creature — Bear', 2),
  card('Shock',     6, 'Instant', 1),
  card('Ritual',    6, 'Sorcery', 1),
  card('Signet',    6, 'Artifact', 2),
  card('Oath',      6, 'Enchantment', 3),
  card('Chandra',   6, 'Planeswalker — Chandra', 4),
  card('Mountain', 24, 'Basic Land — Mountain', 0, true),
];

const named = (n, ...names) => ({ kind: 'cards', n, sel: { mode: 'named', names } });
const filt  = (n, f)        => ({ kind: 'cards', n, sel: { mode: 'filter', f } });
const types = n             => ({ kind: 'types', n });
const goal  = (name, ...clauses) => ({ id: 1, name, clauses });

const total = cards => cards.reduce((s, c) => s + c.qty, 0);

/* ============================================================
   CARD TYPES
   ============================================================ */
group('cardTypes reads card types, not supertypes or subtypes');

eq('a plain creature is one type', cardTypes(card('x', 1, 'Creature — Bear', 2)), ['Creature']);
eq('supertypes do not count',
   cardTypes(card('x', 1, 'Legendary Snow Artifact Creature — Dwarf', 2)), ['Artifact', 'Creature']);
eq('a basic land is Land, not Basic',
   cardTypes(card('x', 1, 'Basic Land — Mountain', 0, true)), ['Land']);
eq('subtypes after the dash are ignored',
   cardTypes(card('x', 1, 'Enchantment — Aura Curse', 3)), ['Enchantment']);
eq('artifact creature is two types',
   cardTypes(card('x', 1, 'Artifact Creature — Golem', 4)), ['Artifact', 'Creature']);
eq('Tribal folds into Kindred',
   cardTypes(card('x', 1, 'Tribal Instant — Elf', 2)), ['Instant', 'Kindred']);
eq('Kindred is Kindred',
   cardTypes(card('x', 1, 'Kindred Sorcery — Goblin', 3)), ['Kindred', 'Sorcery']);

/* A subtype that spells a card type — "Land Creature", "Wall" — must not leak
   through the dash. The segment before the dash is the only thing read. */
eq('a subtype spelling a type does not leak',
   cardTypes(card('x', 1, 'Creature — Land Wurm', 5)), ['Creature']);

{
  /* typeLine is the FRONT face by construction — SCRYFALL builds it that way
     precisely because Scryfall's combined `type_line` concatenates both faces.
     Nothing here should ever see a back face, and this pins WHY: the em-dash
     split does not protect against it. "Sorcery // Land" reads as two types,
     one of which the card does not have while it sits in your hand. If someone
     ever feeds a combined line in, delirium starts counting the back face. */
  const dfc = cardTypes(card('x', 1, 'Sorcery // Land', 2));
  eq('a combined DFC line over-reads — front face only is load-bearing',
     dfc, ['Land', 'Sorcery']);
  eq('the front face alone reads correctly', cardTypes(card('x', 1, 'Sorcery', 2)), ['Sorcery']);
}

eq('no type line and the parser says land', cardTypes(card('x', 1, '', 0, true)), ['Land']);
eq('no type line and not a land contributes nothing', cardTypes(card('x', 1, '', 0, false)), []);
eq('a null card contributes nothing', cardTypes(null), []);

/* ============================================================
   RESOLVING CLAUSES TO SETS
   ============================================================ */
group('goalSets');

{
  const s = goalSets(goal('g', named(1, 'Leyline Axe')), DWARVES);
  eq('one clause, one set', s.length, 1);
  eq('the named set holds its four copies', s[0].sets[0].size, 4);
  eq('kind is carried', s[0].kind, 'cards');
}
{
  const s = goalSets(goal('g', named(1, 'leyline AXE ')), DWARVES);
  eq('named lists match through cardKey', s[0].sets[0].size, 4);
}
{
  const s = goalSets(goal('g', filt(2, { land: 'yes' })), DWARVES);
  eq('a filter clause reuses matches()', s[0].sets[0].size, 24);
}
{
  const s = goalSets(goal('g', types(3)), TYPES);
  eq('a types clause owns one set per type in the deck', s[0].sets.length, 7);
  eq('the land set is the land count', s[0].sets.find(x => x.type === 'Land').size, 24);
  eq('sets are ordered canonically', s[0].sets.map(x => x.type),
     ['Artifact', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery']);
}
{
  const s = goalSets(goal('g', named(1, 'Nonexistent Card')), DWARVES);
  eq('a set nothing matches is empty, not absent', s[0].sets[0].size, 0);
}
eq('a goal with no clauses resolves to nothing', goalSets(goal('g'), DWARVES).length, 0);
eq('a null goal resolves to nothing', goalSets(null, DWARVES).length, 0);
{
  const zero = DWARVES.concat([card('Ghost', 0, 'Instant', 1)]);
  const s = goalSets(goal('g', filt(1, { land: 'no' })), zero);
  chk('a zero-quantity entry contributes nothing',
      !s[0].sets[0].cards.some(c => c.name === 'Ghost'));
}

/* ============================================================
   THE PARTITION
   ============================================================ */
group('vennAtoms partitions the deck exactly once');

{
  const spec = goalSets(goal('g',
    filt(1, { creature: 'yes' }),
    filt(1, { land: 'no', permanent: 'yes' })), SUBSET);
  const flat = flatSets(spec);
  const part = vennAtoms(flat.flat, SUBSET);
  eq('atom sizes sum back to the deck', part.atoms.reduce((s, a) => s + a.size, 0), total(SUBSET));
  eq('total is the deck', part.total, total(SUBSET));

  /* Every card appears in exactly one atom. This is the disjointness claim, and
     it is the difference between the exact answer and the naive one. */
  const seen = new Map();
  part.atoms.forEach(a => a.cards.forEach(c => seen.set(c, (seen.get(c) || 0) + 1)));
  chk('every card lands in exactly one atom', [...seen.values()].every(n => n === 1));
  eq('every card is accounted for', seen.size, SUBSET.length);

  /* Creatures ⊂ nonland permanents, so no atom can be "creature but not
     permanent" — mask 1 without bit 2 must not exist. */
  chk('no atom claims a creature that is not a nonland permanent',
      !part.atoms.some(a => (a.mask & 1) && !(a.mask & 2)),
      part.atoms.map(a => a.mask + ':' + a.size).join(' '));
}
{
  const many = [];
  for (let i = 0; i < 31; i++) many.push({ key: 'k' + i, cards: [], size: 0 });
  eq('more than 30 sets is refused rather than wrapped', vennAtoms(many, SUBSET), null);
  eq('exactly 30 sets is allowed', vennAtoms(many.slice(0, 30), SUBSET).sets, 30);
}

/* ============================================================
   EXACT PROBABILITY
   ============================================================ */
group('pGoal is exact on a single clause');

const TOL = 1e-12;
[
  ['at least one of four', named(1, 'Leyline Axe'), 1, 4],
  ['at least two of four', named(2, 'Leyline Axe'), 2, 4],
  ['at least two lands',   filt(2, { land: 'yes' }), 2, 24],
  ['at least three lands', filt(3, { land: 'yes' }), 3, 24],
  ['at least one land',    filt(1, { land: 'yes' }), 1, 24],
].forEach(([label, clause, k, K]) => {
  const r = pGoal(goal('g', clause), DWARVES, 7);
  const want = hyperAtLeast(k, K, 7, 60);
  eq(`${label} agrees with hyperAtLeast to 1e-12`, r.p, want, TOL);
  eq(`${label} is labelled exact`, r.method, 'exact');
});

{
  const r = pGoal(goal('g', named(9, 'Leyline Axe')), DWARVES, 7);
  eq('asking for more copies than exist is impossible', r.p, 0, TOL);
}
{
  const r = pGoal(goal('g', named(1, 'Nothing At All')), DWARVES, 7);
  eq('a goal nothing can satisfy is zero, not NaN', r.p, 0, TOL);
}
{
  const r = pGoal(goal('g'), DWARVES, 7);
  eq('a goal with no clauses is met by any hand', r.p, 1);
  chk('and says so', r.trivial === true);
}
{
  const r = pGoal(goal('g', filt(0, { land: 'yes' })), DWARVES, 7);
  eq('a clause asking for zero is satisfied by every hand', r.p, 1, TOL);
}
{
  const r = pGoal(goal('g', named(1, 'Leyline Axe')), [], 7);
  eq('an empty deck is zero, not a crash', r.p, 0);
}
{
  const r = pGoal(goal('g', filt(1, { land: 'yes' })), DWARVES, 60);
  eq('drawing the whole deck finds everything', r.p, 1, TOL);
}

/* ============================================================
   THE DOUBLE-COUNTING TRAP
   ============================================================ */
group('overlapping clause sets are partitioned on atoms, not per set');

/* The naive per-set model: treat each clause's set as its own block and require
   n distinct cards from each. It is what you get by copying pSourcesAndLands
   without noticing that its three-way split is disjoint and these sets are not. */
function naivePerSet(sizes, ns, N, h) {
  const rest = N - sizes.reduce((a, b) => a + b, 0);
  let p = 0;
  const rec = (i, rem, acc) => {
    if (i === sizes.length) {
      if (rem < 0 || rem > rest) return;
      p += Math.exp(acc + lnC(rest, rem) - lnC(N, h));
      return;
    }
    for (let x = ns[i]; x <= Math.min(sizes[i], rem); x++) rec(i + 1, rem - x, acc + lnC(sizes[i], x));
  };
  rec(0, h, 0);
  return p;
}

{
  /* Creatures ⊆ nonland permanents, so "at least one creature AND at least one
     nonland permanent" IS "at least one creature". That gives the conjunction a
     closed form, and it is the sharpest possible statement of the trap: a card
     that satisfies two clauses at once must be allowed to do so. */
  const both = pGoal(goal('g',
    filt(1, { creature: 'yes' }),
    filt(1, { land: 'no', permanent: 'yes' })), SUBSET, 7);
  const onlyA = pGoal(goal('g', filt(1, { creature: 'yes' })), SUBSET, 7).p;
  const onlyB = pGoal(goal('g', filt(1, { land: 'no', permanent: 'yes' })), SUBSET, 7).p;
  const exact = hyperAtLeast(1, 20, 7, 60);

  eq('a subset clause collapses to the closed form exactly', both.p, exact, TOL);
  eq('and needs four atoms, not two sets', both.atoms, 3);

  const product = onlyA * onlyB;
  const perSet  = naivePerSet([20, 28], [1, 1], 60, 7);
  chk('the naive per-set PRODUCT is different and lower',
      Math.abs(both.p - product) > 1e-4 && product < both.p, `exact ${both.p} product ${product}`);
  chk('the naive per-set PARTITION is different and lower',
      Math.abs(both.p - perSet) > 1e-4 && perSet < both.p, `exact ${both.p} perSet ${perSet}`);
}

{
  /* And the other direction, which is the one the Leyline goal actually lives
     in. Disjoint sets COMPETE for the seven slots, so the exact answer is lower
     than the product of the two clauses taken independently. Two different
     failures of the naive model, opposite signs, same cause: the clauses are
     not independent events and multiplying them asserts that they are. */
  const axe   = pGoal(goal('g', named(1, 'Leyline Axe')), DWARVES, 7).p;
  const lands = pGoal(goal('g', filt(2, { land: 'yes' })), DWARVES, 7).p;
  const both  = pGoal(goal('g', named(1, 'Leyline Axe'), filt(2, { land: 'yes' })), DWARVES, 7).p;
  chk('disjoint clauses compete, so the joint is below the product',
      both < axe * lands - 1e-4, `joint ${both} product ${axe * lands}`);
}

/* ============================================================
   CARDS THE PARSER COULD NOT FULLY RESOLVE
   ============================================================
   Two failure modes with opposite signs, both found by reading the diff rather
   than by a red test, and both in the seam between `matches()` — which knows
   only the type line — and the rest of the tool, which knows more. */
group('an inline [land:XY] tag is still a land');

{
  /* The documented escape hatch produces a card with NO type line: the parser
     records `land:true` and nothing else. `analyseCards` counts it in the land
     count and `cardTypes` calls it a Land, so a "must be a land" filter that
     reads only the type line makes three parts of the tool disagree about the
     same card — and the same card would pass "must NOT be a land" as well. */
  const inline = { name: 'Fakeland', qty: 24, land: true, produces: ['R'], tapped: false,
                   cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 } };
  const deck = [inline, card('Bear', 36, 'Creature — Bear', 2)];

  chk('matches() calls it a land', matches(inline, { land: 'yes' }));
  chk('and does not call it a nonland', !matches(inline, { land: 'no' }));
  chk('a land is a permanent', matches(inline, { permanent: 'yes' }));
  chk('and is not a creature', !matches(inline, { creature: 'yes' }));
  eq('cardTypes agrees', cardTypes(inline), ['Land']);

  const r = pGoal(goal('g', filt(2, { land: 'yes' })), deck, 7);
  eq('so a land clause finds all 24', r.p, hyperAtLeast(2, 24, 7, 60), TOL);
  chk('rather than answering a confident zero', r.p > 0.8);

  /* A resolved card is untouched: it always has a type line, so the fallback
     never fires for one and no existing figure moves. */
  const real = card('Mountain', 24, 'Basic Land — Mountain', 0, true);
  chk('a resolved land is unaffected', matches(real, { land: 'yes' }));
  const spell = card('Bolt', 4, 'Instant', 1);
  chk('a resolved spell is unaffected', !matches(spell, { land: 'yes' }));
}

group('an unresolved card fills a slot and satisfies nothing');

{
  /* The dangerous direction. An unresolved card has no type line and no mana
     value, so `matches` reads it as not-a-creature, not-a-land, not-a-permanent
     and MV 0 — it passes every NEGATIVE filter and every "MV <= n" test. Left in
     the sets it inflates the answer, under an on-screen flag that says the
     figures are understated. It is excluded from sets and kept in the total,
     which is what evalPayoff already does. */
  const unknown = { name: 'Mystery', qty: 24, unknown: true, land: false, produces: [],
                    cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 } };
  const deck = [card('Mountain', 24, 'Basic Land — Mountain', 0, true),
                card('Bear', 12, 'Creature — Bear', 2), unknown];

  const cheap = goal('g', filt(1, { land: 'no', mvOp: 'lte', mvVal: 2 }));
  const r = pGoal(cheap, deck, 7);
  eq('the unresolved 24 do not count as two-drops', r.p, hyperAtLeast(1, 12, 7, 60), TOL);
  eq('but they are still in the library', r.total, 60);

  const spec = goalSets(cheap, deck);
  chk('and appear in no set', !spec[0].sets[0].cards.some(c => c.unknown));

  const types3 = pGoal(goal('g', types(3)), deck, 7);
  eq('they contribute no card type either', types3.p, 0, TOL);

  /* The sampled path has to agree, or the cross-validation would be comparing
     two different decks. */
  const mc = pGoalSampled(goalSets(cheap, deck), deck, 7, 31337, 40000);
  chk('the sampled path excludes them too',
      Math.abs(r.p - mc.p) <= 3 * mc.se, `exact ${r.p} sampled ${mc.p}`);
}

/* ============================================================
   THE COST GUARD
   ============================================================ */
group('the cost guard falls back to sampling and says so');

{
  const g = goal('g', types(3), filt(2, { land: 'yes' }));
  const exact = pGoal(g, TYPES, 7);
  eq('within budget it is exact', exact.method, 'exact');

  /* Budget of one node cannot finish any enumeration, so this forces the
     fallback deterministically rather than hoping a deck is pathological. */
  const sampled = pGoal(g, TYPES, 7, { budget: 1, trials: 20000, seed: 7 });
  eq('over budget it is sampled', sampled.method, 'sampled');
  chk('and it carries its standard error', sampled.se > 0 && sampled.se < 0.01, String(sampled.se));
  chk('the sampled figure lands on the exact one',
      Math.abs(sampled.p - exact.p) < 3 * sampled.se,
      `exact ${exact.p} sampled ${sampled.p} se ${sampled.se}`);
  chk('the two are never confused — method is the label',
      exact.method !== sampled.method);
}

{
  /* vennAtoms refusing is not the same statement as "the deck is empty", and
     collapsing the two reported a confident exact 0% over "0 atoms of a 0-card
     list" for a sixty-card deck. A types clause contributes one set per card
     type, so five of them on an ordinary list blows the 30-set mask — a handful
     of clicks, not a contrived fixture. */
  const g = goal('g', types(2), types(3), types(4), types(5), types(6));
  const spec = goalSets(g, TYPES);
  const flat = flatSets(spec);
  chk('five types clauses is over the mask', flat.flat.length > 30, String(flat.flat.length));
  eq('so vennAtoms refuses', vennAtoms(flat.flat, TYPES), null);

  const r = pGoal(g, TYPES, 7, { trials: 20000, seed: 5 });
  eq('and pGoal samples rather than answering zero', r.method, 'sampled');
  eq('the deck is still sixty', r.total, total(TYPES));
  /* The conjunction is just its strictest clause, which is checkable exactly. */
  const strictest = pGoal(goal('g', types(6)), TYPES, 7).p;
  chk('and the sampled figure lands on the strictest clause',
      Math.abs(r.p - strictest) <= 3 * r.se + 1e-9,
      `sampled ${r.p} exact ${strictest} se ${r.se}`);

  const empty0 = pGoal(goal('g', types(2)), [], 7);
  eq('an actually empty deck is still an exact zero', empty0.method, 'exact');
  eq('and says zero', empty0.p, 0);
}

/* ============================================================
   MEMOISATION
   ============================================================ */
group('pGoalCached sees every input pGoal reads');

{
  const g = goal('g', types(3));
  const a = pGoalCached(g, TYPES, 7);
  const b = pGoalCached(g, TYPES, 7);
  chk('a repeat call returns the same object', a === b);

  /* A Scryfall lookup changes no name and no quantity, and changes every type
     line. A signature that cannot see that leaves a stale figure on screen
     labelled current — session five's compare-signature bug, in a new place. */
  const before = TYPES.map(c => Object.assign({}, c));
  const after  = before.map(c => Object.assign({}, c, { typeLine: c.land ? c.typeLine : 'Instant' }));
  const ra = pGoalCached(g, before, 7);
  const rb = pGoalCached(g, after, 7);
  chk('changing only the type lines busts the cache', ra !== rb);
  chk('and moves the answer', Math.abs(ra.p - rb.p) > 1e-6, `${ra.p} vs ${rb.p}`);

  const sizes = before.map(c => Object.assign({}, c));
  sizes[0].qty = 5;
  chk('changing a quantity busts the cache', pGoalCached(g, sizes, 7) !== ra);
  chk('changing the hand size busts the cache', pGoalCached(g, before, 6) !== ra);
}

/* ============================================================
   THE LONDON MULLIGAN CHAIN
   ============================================================ */
group('mulliganChain is a distribution');

for (let M = 0; M <= 4; M++) {
  const ch = mulliganChain(0.32, M, 7);
  const sum = ch.stops.reduce((s, x) => s + x.p, 0);
  eq(`maxMulls ${M}: the stop probabilities sum to 1`, sum, 1, 1e-12);
  eq(`maxMulls ${M}: P(goal) is 1 - (1-p)^(M+1)`, ch.pGoal, 1 - Math.pow(0.68, M + 1), 1e-12);
  eq(`maxMulls ${M}: the forced tail is (1-p)^(M+1)`, ch.pForced, Math.pow(0.68, M + 1), 1e-12);
  eq(`maxMulls ${M}: there are M+2 places to stop`, ch.stops.length, M + 2);
}

{
  const ch = mulliganChain(0.32, 2, 7);
  eq('hand size falls by one per look', ch.stops.map(s => s.handSize), [7, 6, 5, 4]);
  eq('only the last stop is forced', ch.stops.filter(s => s.forced).length, 1);
  chk('the forced stop is the last one', ch.stops[ch.stops.length - 1].forced === true);
  const eC = ch.stops.reduce((s, x) => s + x.p * x.handSize, 0);
  eq('expected cards is the distribution mean', ch.eCards, eC, 1e-12);
  const eM = ch.stops.reduce((s, x) => s + x.p * x.mulligans, 0);
  eq('expected mulligans likewise', ch.eMulls, eM, 1e-12);
}

{
  const sure = mulliganChain(1, 3, 7);
  eq('p=1 keeps the first seven every time', sure.stops[0].p, 1, 1e-12);
  eq('p=1 never reaches the forced keep', sure.pForced, 0, 1e-12);
  eq('p=1 expects seven cards', sure.eCards, 7, 1e-12);

  const never = mulliganChain(0, 3, 7);
  eq('p=0 never finds it', never.pGoal, 0, 1e-12);
  eq('p=0 is all forced', never.pForced, 1, 1e-12);
  eq('p=0 keeps the forced hand size', never.eCards, 3, 1e-12);
}

{
  /* You cannot mulligan below zero cards, so maxMulls is clamped rather than
     allowed to produce a negative hand. */
  const deep = mulliganChain(0.3, 99, 7);
  eq('maxMulls is clamped to handSize - 1', deep.maxMulls, 6);
  chk('no stop has a negative hand size', deep.stops.every(s => s.handSize >= 0));
  eq('and it is still a distribution', deep.stops.reduce((s, x) => s + x.p, 0), 1, 1e-12);
}

{
  chk('more mulligans never lowers P(goal)',
      [0, 1, 2, 3, 4, 5].every(m => mulliganChain(0.3, m, 7).pGoal >=
                                    mulliganChain(0.3, Math.max(0, m - 1), 7).pGoal - 1e-15));
  chk('more mulligans never raises expected cards',
      [1, 2, 3, 4, 5].every(m => mulliganChain(0.3, m, 7).eCards <=
                                 mulliganChain(0.3, m - 1, 7).eCards + 1e-15));
}

/* ============================================================
   THE FRONTIER
   ============================================================ */
group('goalFrontier');

{
  const g1 = goal('Leyline start', named(1, 'Leyline Axe'), filt(2, { land: 'yes' }));
  const g2 = Object.assign({}, goal('Two Axes', named(2, 'Leyline Axe'), filt(2, { land: 'yes' })), { id: 2 });
  const pts = goalFrontier([g1, g2], DWARVES, 7, 3);

  eq('one point per goal per policy', pts.length, 8);
  eq('every point carries the four reported fields',
     pts.every(p => typeof p.label === 'string' && typeof p.p === 'number' &&
                    typeof p.eCards === 'number' && typeof p.pGoal === 'number'), true);
  chk('p is a property of the goal, not the policy',
      pts.filter(p => p.goalId === 1).every(p => Math.abs(p.p - pts[0].p) < 1e-15));

  const series = pts.filter(p => p.goalId === 1);
  chk('strictness raises P(goal)', series.every((p, i) => i === 0 || p.pGoal > series[i - 1].pGoal));
  chk('and costs cards', series.every((p, i) => i === 0 || p.eCards < series[i - 1].eCards));
  chk('the stricter goal is harder to hit',
      pts.filter(p => p.goalId === 2)[0].p < series[0].p);
  chk('no point claims to be the best', pts.every(p => !('best' in p) && !('score' in p)));
}

{
  const g1 = goal('g', named(1, 'Leyline Axe'));
  eq('maxMulls is clamped here too', goalFrontier([g1], DWARVES, 7, 99).length, 7);
  eq('no goals is no points', goalFrontier([], DWARVES, 7, 3).length, 0);
}

group('frontierKnee names a knee or nothing');

eq('fewer than three points has no knee', frontierKnee([{ eCards: 7, pGoal: 0.3 }, { eCards: 6, pGoal: 0.5 }]), null);
eq('a null series has no knee', frontierKnee(null), null);
{
  const flat = [{ eCards: 7, pGoal: 0.5 }, { eCards: 6, pGoal: 0.5 }, { eCards: 5, pGoal: 0.5 }];
  eq('a series flat in one axis has no knee', frontierKnee(flat), null);
}
{
  /* A sharply bent series: almost all of the gain arrives at the second point. */
  const bent = [
    { eCards: 7.0, pGoal: 0.10 },
    { eCards: 6.4, pGoal: 0.80 },
    { eCards: 5.9, pGoal: 0.85 },
    { eCards: 5.5, pGoal: 0.88 },
    { eCards: 5.2, pGoal: 0.90 },
  ];
  const k = frontierKnee(bent);
  eq('the knee is the point where the curve bends', k.index, 1);
  chk('and it comes back with its point', k.point === bent[1]);
  chk('and a distance', k.distance > 0);
}
{
  const line = [];
  for (let i = 0; i < 5; i++) line.push({ eCards: 7 - i, pGoal: 0.1 + i * 0.1 });
  const k = frontierKnee(line);
  chk('a straight line has a knee at distance ~0 rather than a false finding',
      k === null || k.distance < 1e-9, k && String(k.distance));
}

/* ============================================================
   CROSS-VALIDATION AGAINST THE GOLDFISH
   ============================================================
   The phase that makes the maths trustworthy. Four goals of different shapes,
   each dealt real hands by the goldfish's own seeded dealer and counted
   empirically. The closed form has to sit inside the sampling band.

   If one of these fails, the closed form is the suspect. The dealer is shared
   with a feature that has been under test since session four, and the counting
   here is a loop anyone can read. */
group('the closed form agrees with the seeded dealer');

const TRIALS = 60000;
[
  ['one Leyline Axe', DWARVES, goal('g', named(1, 'Leyline Axe')), 101],
  ['Leyline start — disjoint clauses', DWARVES,
   goal('g', named(1, 'Leyline Axe'), filt(2, { land: 'yes' })), 202],
  ['overlapping clause sets', SUBSET,
   goal('g', filt(1, { creature: 'yes' }), filt(1, { land: 'no', permanent: 'yes' })), 303],
  ['three distinct card types', TYPES, goal('g', types(3)), 404],
  ['delirium types and two lands', TYPES,
   goal('g', types(3), filt(2, { land: 'yes' })), 505],
  ['four types, which is a real stretch', TYPES, goal('g', types(4)), 606],
].forEach(([label, deck, g, seed]) => {
  const exact = pGoal(g, deck, 7);
  const mc = pGoalSampled(goalSets(g, deck), deck, 7, seed, TRIALS);
  const band = 2.5 * mc.se;
  eq(`${label}: computed exactly`, exact.method, 'exact');
  chk(`${label}: closed form inside the sampling band`,
      Math.abs(exact.p - mc.p) <= band,
      `exact ${exact.p.toFixed(6)} sampled ${mc.p.toFixed(6)} band ±${band.toFixed(6)}`);
});

{
  /* The counting the sampler does, checked by hand on one concrete hand rather
     than trusted because the aggregate looks right. */
  const g = goal('g', types(3), filt(2, { land: 'yes' }));
  const compiled = compileGoal(goalSets(g, TYPES));
  const land = TYPES[6], cre = TYPES[0], ins = TYPES[1];
  chk('a hand with three types and two lands hits',
      goalHitsHand(compiled, [land, land, cre, ins, cre, ins, cre]));
  chk('the same hand with one land misses',
      !goalHitsHand(compiled, [land, cre, ins, cre, ins, cre, cre]));
  chk('two lands and two types misses',
      !goalHitsHand(compiled, [land, land, cre, cre, cre, cre, cre]));
  chk('lands count as a type toward delirium',
      goalHitsHand(compiled, [land, land, land, cre, ins, cre, ins]));
}

/* ============================================================
   TYPES SEEN BY TURN N
   ============================================================ */
group('pTypesSeenBy is an upper bound and says so');

{
  const t1 = pTypesSeenBy(TYPES, 1, true, 3);
  const t4 = pTypesSeenBy(TYPES, 4, true, 3);
  eq('turn one on the play sees seven', t1.seen, 7);
  eq('turn four on the play sees ten', t4.seen, 10);
  chk('seeing more cards can only help', t4.p >= t1.p);
  chk('it is flagged as a bound, not delirium', t1.upperBound === true);
  eq('and it agrees with the goal that defines it',
     t1.p, pGoal(goal('g', types(3)), TYPES, 7).p, 1e-12);
  const onDraw = pTypesSeenBy(TYPES, 1, false, 3);
  eq('on the draw you see one more', onDraw.seen, 8);
  chk('which cannot lower the bound', onDraw.p >= t1.p);
}

/* ============================================================
   THE SECTION IS REACHABLE
   ============================================================ */
group('extract.js can still slice this section');

{
  const src = section('goals');
  chk('the GOALS slice is not empty', src.length > 1000);
  chk('and it stops before GOLDFISH', !/function\s+expandDeck/.test(src));
  chk('the DIG PAYOFFS slice still ends at GOALS', /function\s+matches/.test(section('payoffs')));
  chk('and does not swallow GOALS', !/function\s+vennAtoms/.test(section('payoffs')));
}

process.exit(report() ? 1 : 0);
