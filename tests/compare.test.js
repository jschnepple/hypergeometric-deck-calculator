/* Comparing sideboard variants.

   Three distinct things are guarded here, and they fail in different ways.

   1. The METRICS. Straight extraction, but the surplus/shortfall sign is easy to
      invert and nothing downstream would notice — a red cell where a green one
      belongs reads as authoritative either way.

   2. The DIRECTION of "better". Fewer sources short is good, a lower payoff
      probability is bad, a change in average mana value is neither. A single
      sign-to-colour rule would be wrong for a third of the rows, so every
      direction is asserted explicitly.

   3. The NOISE BAND on the sampled figures. This is the one with teeth. Two
      variants dealt 400 hands each differ by a point or two from sampling alone,
      and presenting that as a finding is worse than not comparing at all. The
      band arithmetic is checked against hand-computed standard errors, and the
      common-random-numbers guarantee — same seed, same hands, reproducible — is
      checked by running it twice.

   Plus the sweep that goldfishview.test.js established: every rendered cell is
   regexed for a leaked `undefined` or `NaN`, because a broken template literal
   does not throw, it just prints one of those inside a percentage.

   Note the two seeded globals. compareHTML reaches for `empty` and `colDot`,
   which live in RENDER and are therefore out of extract.js's reach; stand-ins
   are supplied so the builders can be exercised. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard', 'analysis', 'payoffs', 'goldfish', 'compare'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {}, PAYOFFS: [],
  CNAME: { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' },
  empty: (t, d) => `<div class="empty"><b>${t}</b><span>${d}</span></div>`,
  colDot: c => `<span class="sym">${c}</span>`,
});

const spell = (cmc, pips, cost, typeLine) =>
  ({ land: false, produces: [], cmc, pips: Object.assign({ W:0,U:0,B:0,R:0,G:0 }, pips),
     cost, typeLine, subtypes: [] });
const basic = (col, name) =>
  ({ land: true, produces: [col], tapped: false, cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 },
     typeLine: `Basic Land — ${name}`, subtypes: [name] });

DB = {
  'goblin guide':       spell(1, { R:1 }, '{R}', 'Creature — Goblin Scout'),
  'monastery swiftspear': spell(1, { R:1 }, '{R}', 'Creature — Human Monk'),
  'lightning bolt':     spell(1, { R:1 }, '{R}', 'Instant'),
  'shock':              spell(1, { R:1 }, '{R}', 'Instant'),
  'wizard’s lightning': spell(1, { R:1 }, '{R}', 'Instant'),
  'skewer the critics': spell(2, { R:1 }, '{2}{R}', 'Sorcery'),
  'light up the stage': spell(2, { R:1 }, '{2}{R}', 'Sorcery'),
  'risk factor':        spell(3, { R:1 }, '{2}{R}', 'Instant'),
  'glorybringer':       spell(5, { R:2 }, '{3}{R}{R}', 'Creature — Dragon'),
  'abrade':             spell(2, { R:1 }, '{1}{R}', 'Instant'),
  'negate':             spell(2, { U:1 }, '{1}{U}', 'Instant'),
  'cryptic command':    spell(4, { U:3 }, '{1}{U}{U}{U}', 'Instant'),
  'mountain':           basic('R', 'Mountain'),
  'island':             basic('U', 'Island'),
};

/* A legal 60-card list. It has to be exactly sixty, because the goldfish refuses
   to simulate a list that disagrees with the deck-size assumption — rightly, since
   every probability is computed against the real library size — and it has to be
   four-ofs, or the copy-limit warning fires and shows up as a false regression. */
const LIST = `4 Goblin Guide
4 Monastery Swiftspear
4 Lightning Bolt
4 Shock
4 Wizard’s Lightning
4 Skewer the Critics
4 Light Up the Stage
4 Risk Factor
4 Glorybringer
8 Island
16 Mountain

Sideboard
4 Abrade
4 Negate
4 Cryptic Command`;

const OPTS = { text: LIST, N: 60, thr: 0.90, onPlay: true, rampN: 0, comp: 0 };
const V_SAFE  = { id: 1, name: 'vs Aggro',   swaps: [{ out: 'Glorybringer', in: 'Abrade', qty: 2 }] };
const V_BREAK = { id: 2, name: 'vs Control', swaps: [{ out: 'Goblin Guide', in: 'Cryptic Command', qty: 4 }] };
const V_BAD   = { id: 3, name: 'stale',      swaps: [{ out: 'Sheoldred', in: 'Abrade', qty: 2 }] };

/* ------------------------------------------------------------------ */
group('metrics come out of an analysis intact');

let cols = compareColumns(OPTS, [V_SAFE]);
eq('the maindeck is the first column', cols[0].base, true);
eq('and is named', cols[0].name, 'Maindeck');
eq('one variant, one more column', cols.length, 2);
const m = cols[0].m;
eq('total', m.total, 60);
eq('lands', m.landCount, 24);
chk('average mana value is real', isFinite(m.avgMV) && m.avgMV > 0);
eq('the curve has eight buckets', m.curve.length, 8);
eq('curve sums to the spell count', m.curve.reduce((a, b) => a + b, 0), m.spellCount);
chk('red is a tracked colour', !!m.colors.R);
eq('shortfall never goes negative', m.colors.R.short, Math.max(0, m.colors.R.need - m.colors.R.have));
eq('surplus is signed the other way', m.colors.R.surplus, m.colors.R.have - m.colors.R.need);
chk('the binding spell is named', typeof m.colors.R.from === 'string' && m.colors.R.from.length > 0);
eq('worst shortfall is the max over colours', m.worstShort,
   Math.max(...Object.values(m.colors).map(c => c.short)));

group('a broken variant is a broken column, not a wrong one');
cols = compareColumns(OPTS, [V_SAFE, V_BAD]);
eq('three columns', cols.length, 3);
chk('the stale variant is marked broken', cols[2].m.broken === true);
chk('the good one is not', cols[1].m.broken === false);

/* ------------------------------------------------------------------ */
group('which direction is good, per metric');
eq('more sources is good',            cmpTone('up',   14, 12), 'good');
eq('fewer sources is bad',            cmpTone('up',   12, 14), 'bad');
eq('a smaller shortfall is good',     cmpTone('down',  1,  3), 'good');
eq('a bigger shortfall is bad',       cmpTone('down',  3,  1), 'bad');
eq('closer to the recommendation is good', cmpTone('zero',  0.5, -2.0), 'good');
eq('further from it is bad',          cmpTone('zero', -2.0,  0.5), 'bad');
eq('a negative gap closer to zero still counts as good',
                                      cmpTone('zero', -0.5, -2.0), 'good');
eq('some metrics have no direction',  cmpTone('none',  3,  1), 'none');
eq('no change is flat',               cmpTone('up',    5,  5), 'flat');
chk('and renders as a dash, not "+0"', /—/.test(cmpDelta(5, 5, 'up')));
chk('a real change renders its sign', /\+2/.test(cmpDelta(14, 12, 'up', d => (d > 0 ? '+' : '') + d)));

/* ------------------------------------------------------------------ */
group('the headline: which plan breaks the mana');

cols = compareColumns(OPTS, [V_SAFE]);
eq('a like-for-like swap breaks nothing', cmpRegressions(cols).length, 0);

cols = compareColumns(OPTS, [V_BREAK]);
let regs = cmpRegressions(cols);
chk('bringing in a triple-blue spell on eight Islands is flagged', regs.length > 0);
chk('the variant is named', regs[0].name === 'vs Control');
chk('and the colour is named', /blue/i.test(regs[0].msg));

cols = compareColumns(OPTS, [V_BAD]);
regs = cmpRegressions(cols);
chk('a broken variant is reported as broken', regs.length === 1 && regs[0].level === 'error');

group('only what the swaps caused is called a regression');
/* A half-filled editor row is an editing state, not a finding about your mana. */
cols = compareColumns(OPTS, [{ id: 8, name: 'mid-edit', swaps: [{ out: 'Glorybringer', in: 'Abrade', qty: 0 }] }]);
eq('a zero-quantity row is not a regression', cmpRegressions(cols).length, 0);
/* And a deck that already ran five of something is the maindeck's problem. */
const OVER = Object.assign({}, OPTS, { text: LIST.replace('4 Shock', '5 Shock').replace('8 Island', '7 Island') });
cols = compareColumns(OVER, [V_SAFE]);
eq('an over-limit card the variant never touched is not blamed on it',
   cmpRegressions(cols).filter(r => /Shock/.test(r.msg)).length, 0);

group('the staleness signature notices a same-cost swap');
/* The most ordinary sideboard move there is — one two-mana instant for another —
   leaves the total, the land count and the average mana value all identical. */
const sigA = cmpSig(compareColumns(OPTS, [V_SAFE]));
const sigB = cmpSig(compareColumns(OPTS, [{ id: 1, name: 'vs Aggro',
  swaps: [{ out: 'Skewer the Critics', in: 'Abrade', qty: 2 }] }]));
chk('two variants with the same shape have different signatures', sigA !== sigB);
eq('the same comparison signs the same way', cmpSig(compareColumns(OPTS, [V_SAFE])), sigA);
chk('editing the maindeck moves it',
    cmpSig(compareColumns(Object.assign({}, OPTS, { text: LIST.replace('16 Mountain', '15 Mountain') }), [V_SAFE])) !== sigA);

group('an empty list produces no findings at all');
eq('nothing to say about nothing',
   cmpRegressions(compareColumns(Object.assign({}, OPTS, { text: '' }), [V_SAFE])).length, 0);

/* ------------------------------------------------------------------ */
group('sampling error, computed rather than eyeballed');

eq('SE of a coin flip over 400 draws', seProp(0.5, 400), 0.025, 1e-12);
eq('SE shrinks with the root of n',    seProp(0.5, 1600), 0.0125, 1e-12);
eq('a certainty has no error',         seProp(1, 400), 0, 1e-12);
eq('no sample, no error',              seProp(0.5, 0), 0, 1e-12);
eq('two independent proportions add in quadrature',
   seDiff(0.5, 0.5, 400), Math.sqrt(2) * 0.025, 1e-12);

eq('SE of a mean is the spread over root n', seMean(20, 400), 1, 1e-12);
eq('a mean with no spread has no error',     seMean(0, 400), 0, 1e-12);
eq('two means add in quadrature too',        seDiffMean(20, 20, 400), Math.sqrt(2), 1e-12);
chk('a tenth of a point on a mean score is noise',  !cmpSigMean(70.0, 70.1, 18, 18, 500));
chk('ten points is not',                            cmpSigMean(70, 80, 18, 18, 500));
chk('the same gap is noise on a wildly variable deck', !cmpSigMean(70, 80, 90, 90, 500));

chk('a one-point gap at 400 hands is noise',      !cmpSignificant(0.50, 0.51, 400));
chk('a twenty-point gap at 400 hands is not',      cmpSignificant(0.50, 0.70, 400));
chk('the same one-point gap at 100,000 hands is real', cmpSignificant(0.50, 0.51, 100000));
chk('the threshold is two standard errors',
    !cmpSignificant(0.5, 0.5 + 1.9 * seDiff(0.5, 0.5, 400), 400) &&
     cmpSignificant(0.5, 0.5 + 2.1 * seDiff(0.5, 0.5, 400), 400));

/* ------------------------------------------------------------------ */
group('common random numbers: same seed, same hands');

cols = compareColumns(OPTS, [V_SAFE]);
const s1 = cmpSim(cols, 99, 200, 52, 46);
const s2 = cmpSim(cols, 99, 200, 52, 46);
chk('every column simulated', s1.every(s => s.ok));
eq('re-running the same seed is identical', JSON.stringify(s1), JSON.stringify(s2));
const s3 = cmpSim(cols, 12345, 200, 52, 46);
chk('a different seed gives different hands', JSON.stringify(s3) !== JSON.stringify(s1));
eq('the hand count is carried', s1[0].n, 200);
chk('keep rate is the complement of the ship rate',
    Math.abs(s1[0].keepPlay - (1 - s1[0].stats.shipPlay)) < 1e-12);
chk('keep rates are probabilities',
    s1.every(s => s.keepPlay >= 0 && s.keepPlay <= 1 && s.keepDraw >= 0 && s.keepDraw <= 1));
chk('hands are keepable more often on the draw than on the play',
    s1[0].keepDraw >= s1[0].keepPlay);

group('the band shown is the band applied');
/* The first version printed one band, computed at the baseline rate and quoted
   for the whole table, while testing each cell against its own. At 80% baseline
   and 500 hands that printed ±5.06pp — and then coloured a 5.0pp gap as a
   finding and greyed a 5.5pp one as noise. Both directions were wrong. */
const simHTML = cmpSimHTML(cmpSim(compareColumns(OPTS, [V_SAFE]), 5, 300, 52, 46));
chk('no single figure is quoted as the band for everything',
    !/smaller than ±[\d.]+pp are inside/.test(simHTML));
chk('each difference carries the band it was judged by', /is sampling noise\./.test(simHTML));
chk('the mean-score row is tested too, not just coloured',
    (simHTML.match(/is sampling noise\./g) || []).length >= 3, simHTML.slice(0, 200));
chk('standard deviations are carried for that test',
    cmpSim(compareColumns(OPTS, []), 5, 100, 52, 46)[0].sdPlay > 0);

group('decks that cannot be simulated say why');
const broken = cmpSim(compareColumns(OPTS, [V_BAD]), 99, 100, 52, 46);
chk("the broken variant is not simulated", broken[1].ok === false);
chk('and gives a reason', typeof broken[1].why === 'string' && broken[1].why.length > 0);
const emptySim = cmpSim(compareColumns(Object.assign({}, OPTS, { text: '' }), []), 99, 100, 52, 46);
chk('an empty list is not simulated', emptySim[0].ok === false);

/* ------------------------------------------------------------------ */
group('nothing leaks undefined or NaN into the markup');

const clean = (label, html) => {
  chk(`${label}: no undefined`, !/undefined/.test(html), html.slice(0, 160));
  chk(`${label}: no NaN`,       !/NaN/.test(html),       html.slice(0, 160));
  chk(`${label}: no empty numbers`, !/<b>\s*<\/b>/.test(html));
};

clean('empty list',   compareHTML(compareColumns(Object.assign({}, OPTS, { text: '' }), []), null));
clean('no variants',  compareHTML(compareColumns(OPTS, []), null));
clean('one variant',  compareHTML(compareColumns(OPTS, [V_SAFE]), null));
clean('three variants and one broken',
      compareHTML(compareColumns(OPTS, [V_SAFE, V_BREAK, V_BAD]), null));

cols = compareColumns(OPTS, [V_SAFE, V_BREAK, V_BAD]);
clean('with a simulation', compareHTML(cols, cmpSim(cols, 7, 100, 52, 46)));
clean('the matrix alone',  cmpTableHTML(cols));
clean('the curve panels',  cmpCurveHTML(cols));
clean('the sampled table', cmpSimHTML(cmpSim(cols, 7, 100, 52, 46)));

group('with payoffs configured');
PAYOFFS = [{ id: 1, name: 'Dig Effect', depth: 7, grab: 1, creature: 'any', land: 'no',
             permanent: 'any', mvOp: 'lte', mvVal: 3 }];
cols = compareColumns(OPTS, [V_SAFE]);
clean('payoff rows', cmpTableHTML(cols));
chk('the payoff is a row', /Dig Effect/.test(cmpTableHTML(cols)));
chk('and carries a probability', cols[0].m.payoffs[0].p > 0 && cols[0].m.payoffs[0].p <= 1);
PAYOFFS = [];

group('user text is escaped, not injected');
const nasty = { id: 9, name: '<img src=x onerror=alert(1)>', swaps: [] };
const html = compareHTML(compareColumns(OPTS, [nasty]), null);
chk('no raw tag survives', !/<img/.test(html));
chk('it is shown escaped instead', /&lt;img/.test(html));
eq('escaping covers the five characters', esc(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');

group('the empty states explain themselves');
chk('no list at all points at the decklist',
    /Sideboard/.test(compareHTML(compareColumns(Object.assign({}, OPTS, { text: '' }), []), null)));
chk('a list with no variants says how to make one',
    /variant/i.test(compareHTML(compareColumns(OPTS, []), null)));

process.exit(report());
