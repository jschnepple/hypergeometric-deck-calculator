/* Hypergeometric core + mana-cost parsing, checked against exact rational
   arithmetic. The distribution functions are the foundation everything else
   sits on, so these are checked to 1e-9 rather than eyeballed. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing'], { COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {} });

// --- exact hypergeometric via BigInt rationals, as an independent oracle ---
function binom(n, k) {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 0n; i < BigInt(k); i++) r = r * BigInt(n - Number(i)) / (i + 1n);
  return r;
}
function exactAtLeast(k, K, n, N) {
  if (k <= 0) return 1;
  let num = 0n;
  for (let i = 0; i < k; i++) num += binom(K, i) * binom(N - K, n - i);
  return 1 - Number(num) / Number(binom(N, n));
}

group('hypergeometric vs exact rational arithmetic');
let worst = 0, cases = 0;
for (const N of [40, 60, 99]) {
  for (const K of [1, 2, 3, 4, 10, 17, 24, 36]) {
    for (const n of [7, 9, 11, 13]) {
      for (const k of [1, 2, 3]) {
        if (K > N || n > N) continue;
        const got = hyperAtLeast(k, K, n, N);
        const want = exactAtLeast(k, K, n, N);
        worst = Math.max(worst, Math.abs(got - want));
        cases++;
      }
    }
  }
}
chk(`${cases} cases within 1e-9 of exact (max error ${worst.toExponential(2)})`, worst < 1e-9);

group('known closed forms');
eq('P(>=1 of a 4-of in opening 7)', hyperAtLeast(1, 4, 7, 60), 0.3994996257446656, 1e-12);
eq('P(>=1 of a 1-of in opening 7)', hyperAtLeast(1, 1, 7, 60), 7 / 60, 1e-12);
eq('P(>=1) with zero copies', hyperAtLeast(1, 0, 7, 60), 0);
eq('P(>=0) is certain', hyperAtLeast(0, 0, 7, 60), 1);
eq('drawing the whole deck finds all 4', hyperAtLeast(4, 4, 60, 60), 1, 1e-12);
eq('cannot draw more than exist', hyperAtLeast(8, 4, 10, 60), 0);

group('cards seen by turn');
eq('T1 on the play', cardsSeen(1, true), 7);
eq('T3 on the play', cardsSeen(3, true), 9);
eq('T3 on the draw', cardsSeen(3, false), 10);

group('mana cost parsing');
const c1 = parseCost('{1}{W}{W}');
eq('1WW mana value', c1.cmc, 3);
eq('1WW white pips', c1.pips.W, 2);
const c2 = parseCost('{2}{B}{R}');
eq('2BR mana value', c2.cmc, 4);
eq('2BR one pip each', [c2.pips.B, c2.pips.R], [1, 1]);
const c3 = parseCost('{X}{R}{R}');
eq('XRR treats X as 0', c3.cmc, 2);
eq('XRR red pips', c3.pips.R, 2);
const c4 = parseCost('{2}{W/U}');
eq('hybrid mana value', c4.cmc, 3);
eq('hybrid splits the pip', [c4.pips.W, c4.pips.U], [0.5, 0.5]);
const c5 = parseCost('{1}{B/P}');
eq('phyrexian mana value', c5.cmc, 2);
eq('phyrexian counts a full pip', c5.pips.B, 1);
eq('empty cost', parseCost('').cmc, 0);

group('Karsten table shape');
chk('published >= simulated everywhere (recommendation takes the higher)',
  [1, 2, 3].every(p => Object.keys(KARSTEN[p]).every(t =>
    KARSTEN[p][t] >= (DERIVED[p][t] ?? 0))));
chk('requirements fall as the turn gets later',
  [1, 2, 3].every(p => {
    const ts = Object.keys(KARSTEN[p]).map(Number).sort((a, b) => a - b);
    return ts.every((t, i) => i === 0 || KARSTEN[p][t] <= KARSTEN[p][ts[i - 1]]);
  }));
chk('more pips always needs more sources at the same turn',
  [3, 4, 5, 6, 7].every(t => KARSTEN[1][t] < KARSTEN[2][t] && KARSTEN[2][t] < KARSTEN[3][t]));
eq('single pip on T1 matches published 14', required(1, 1).use, 14);
eq('double pip on T2 matches published 20', required(2, 2).use, 20);
eq('double pip on T3 matches published 18', required(2, 3).use, 18);

process.exit(report());
