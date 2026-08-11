/* Dig payoffs — "look at the top D cards, take up to G that match X".

   The probability is plain hypergeometric on the WHOLE deck, and that is exact,
   not an approximation: by exchangeability, positions D+1..D+k of a uniformly
   shuffled deck are a uniformly random k-subset no matter how many cards have
   already been drawn, so the library being smaller when the effect resolves does
   not change the marginal. The Monte Carlo group below is what actually
   establishes that, by simulating draws before the dig. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'payoffs'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {}, PAYOFFS: [], PID: 0,
});

group('filter matching');
const card = (typeLine, cmc) => ({ typeLine, cmc, qty: 1 });
const UB = { creature: 'no', land: 'no', permanent: 'yes', mvOp: 'lte', mvVal: 3 };
const GB = { creature: 'yes', land: 'any', permanent: 'any', mvOp: 'any', mvVal: 0 };

chk('UB hits a 2-mana artifact',        matches(card('Artifact', 2), UB));
chk('UB hits a 3-mana enchantment',     matches(card('Enchantment', 3), UB));
chk('UB hits a 3-mana planeswalker',    matches(card('Legendary Planeswalker — Chandra', 3), UB));
chk('UB MISSES an instant (not a permanent)',  !matches(card('Instant', 2), UB));
chk('UB MISSES a sorcery (not a permanent)',   !matches(card('Sorcery', 1), UB));
chk('UB MISSES a creature',             !matches(card('Creature — Human', 2), UB));
chk('UB MISSES a land',                 !matches(card('Land', 0), UB));
chk('UB MISSES a 4-mana artifact',      !matches(card('Artifact', 4), UB));
chk('UB hits an artifact creature? no — creature excluded',
    !matches(card('Artifact Creature — Golem', 2), UB));
chk('GB hits any creature',             matches(card('Creature — Goblin', 5), GB));
chk('GB hits an artifact creature',     matches(card('Artifact Creature — Golem', 2), GB));
chk('GB MISSES an artifact',            !matches(card('Artifact', 4), GB));

group('distributions are well formed');
for (const [K, D, N] of [[8, 7, 59], [12, 7, 59], [16, 13, 59], [4, 7, 60], [1, 13, 60]]) {
  let sum = 0;
  for (let j = 0; j <= Math.min(K, D); j++) sum += hyperExact(j, K, D, N);
  chk(`K=${K} D=${D} N=${N} sums to 1`, Math.abs(sum - 1) < 1e-9, sum);
}
chk('P(exactly j) is never negative',
  [0, 1, 2, 3, 7].every(j => hyperExact(j, 10, 7, 60) >= 0));
eq('impossible count is zero', hyperExact(8, 4, 7, 60), 0);

group('exact vs Monte Carlo, WITH cards drawn before the dig');
/* This is the claim worth testing: drawing cards first must not shift the odds. */
function simulate(K, D, N, drawnFirst, trials = 200000) {
  let hit = 0;
  for (let t = 0; t < trials; t++) {
    let k = K, n = N;
    for (let i = 0; i < drawnFirst; i++) { if (Math.random() < k / n) k--; n--; }
    let found = 0;
    for (let i = 0; i < D; i++) { if (Math.random() < k / n) { k--; found++; } n--; }
    if (found >= 1) hit++;
  }
  return hit / trials;
}
for (const [K, D, N, drawn] of [[12, 7, 59, 0], [12, 7, 59, 10], [16, 13, 59, 0], [16, 13, 59, 12]]) {
  const cf = hyperAtLeast(1, K, D, N), mc = simulate(K, D, N, drawn);
  chk(`K=${K} D=${D} after drawing ${drawn}: closed-form ${cf.toFixed(4)} vs sim ${mc.toFixed(4)}`,
      Math.abs(cf - mc) < 0.005, `gap ${Math.abs(cf - mc).toFixed(5)}`);
}

group('evalPayoff on a real decklist');
const A = {
  total: 60,
  cards: [
    { name: 'United Battlefront', qty: 4, typeLine: 'Sorcery',      cmc: 4 },
    { name: 'Getaway Barrel',     qty: 4, typeLine: 'Artifact',     cmc: 4 },
    { name: 'Cheap Artifact',     qty: 8, typeLine: 'Artifact',     cmc: 2 },
    { name: 'Some Creature',      qty: 12, typeLine: 'Creature — X', cmc: 3 },
    { name: 'Removal',            qty: 8, typeLine: 'Instant',      cmc: 2 },
    { name: 'Mountain',           qty: 24, typeLine: 'Basic Land — Mountain', cmc: 0 },
  ],
};
const ub = evalPayoff({ name: 'United Battlefront', depth: 7, grab: 2, ...UB }, A);
eq('UB hit count excludes instants, creatures, lands and MV4+', ub.K, 8);
eq('UB library is 59 (its own copy is on the stack)', ub.N, 59);
chk('UB P(>=1) is between P(exactly 1) and 1', ub.pAtLeast1 > 0 && ub.pAtLeast1 < 1);
chk('UB full value is rarer than partial', ub.pFull < ub.pAtLeast1);

const gb = evalPayoff({ name: 'Getaway Barrel', depth: 13, grab: 1, ...GB }, A);
eq('Barrel hit count is the creatures', gb.K, 12);
eq('Barrel library is 59', gb.N, 59);
chk('Barrel finds a creature more often than not', gb.pAtLeast1 > 0.9, gb.pAtLeast1);

group('self-exclusion');
const selfDeck = { total: 60, cards: [
  { name: 'Self Finder', qty: 4, typeLine: 'Artifact', cmc: 2 },
  { name: 'Filler',      qty: 56, typeLine: 'Land',    cmc: 0 },
]};
const self = evalPayoff({ name: 'Self Finder', depth: 7, grab: 1,
  creature: 'no', land: 'no', permanent: 'yes', mvOp: 'lte', mvVal: 3 }, selfDeck);
eq('a card that matches its own filter excludes the resolving copy', self.K, 3);
eq('and the library shrinks by one', self.N, 59);

group('degenerate inputs');
const none = evalPayoff({ name: 'Nothing', depth: 7, grab: 1,
  creature: 'yes', land: 'any', permanent: 'any', mvOp: 'any', mvVal: 0 },
  { total: 60, cards: [{ name: 'x', qty: 60, typeLine: 'Land', cmc: 0 }] });
eq('no matching cards means zero chance', none.pAtLeast1, 0);
eq('and zero expected hits', none.ev, 0);

process.exit(report());
