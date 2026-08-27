/* The Consistency tab's rendered output.

   Same argument as goldfishview.test.js and compare.test.js: a broken template
   literal does not throw. It writes the word `undefined` inside a percentage, or
   `NaN%`, and every downstream check still passes because the string is a
   string. So every cell this tab can produce is generated and swept.

   The second concern is REFUSAL. A goal that is not finished being written —
   a clause with no card chosen — must produce an explanation, not a confident
   0%. That is the same rule as a half-applied variant swap, and it is asserted
   here rather than left to the eye.

   Three globals are seeded. The builders reach for `esc` (COMPARE), `empty`
   (RENDER) and `NUMSTATE` (RENDER), none of which extract.js can see. If any of
   them is renamed, this file needs the same rename. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard', 'analysis', 'payoffs', 'goals', 'goldfish'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {}, PAYOFFS: [],
  CNAME: { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' },
  NUMSTATE: {},
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  empty: (t, d) => `<div class="empty"><b>${t}</b><span>${d}</span></div>`,
});

const card = (name, qty, typeLine, cmc, land) => ({
  name, qty, typeLine, cmc: cmc || 0, land: !!land,
  produces: land ? ['R'] : [], tapped: false,
  pips: { W:0, U:0, B:0, R:0, G:0 }, subtypes: [],
});

const CARDS = [
  card('Leyline Axe',    4,  'Artifact — Equipment', 2),
  card('Dwarven Mauler', 4,  'Creature — Dwarf Warrior', 3),
  card('Bolt',           12, 'Instant', 1),
  card('Bear',           16, 'Creature — Bear', 2),
  card('Mountain',       24, 'Basic Land — Mountain', 0, true),
];
const A = analyseCards(CARDS, [], { N: 60, thr: 0.9, onPlay: true });

const landF = { mode: 'filter', f: { creature: 'any', land: 'yes', permanent: 'any', mvOp: 'any', mvVal: 0 } };
const READY = { id: 1, name: 'Leyline start', clauses: [
  { kind: 'cards', n: 1, sel: { mode: 'named', names: ['Leyline Axe'] } },
  { kind: 'cards', n: 2, sel: landF },
]};
const DELIRIUM = { id: 2, name: 'Delirium types', clauses: [
  { kind: 'types', n: 3 }, { kind: 'cards', n: 2, sel: landF },
]};
const BLOCKED = { id: 3, name: 'Unfinished', clauses: [
  { kind: 'cards', n: 1, sel: { mode: 'named', names: [] } },
]};
const IMPOSSIBLE = { id: 4, name: 'Impossible', clauses: [
  { kind: 'cards', n: 1, sel: { mode: 'named', names: ['A Card That Is Not Here'] } },
]};

/* The sweep every view in this codebase gets. */
const LEAK = /\bundefined\b|\bNaN\b|\bnull\b/;
const sweep = (label, html) => chk(label, !LEAK.test(html),
  (html.match(/.{0,60}(undefined|NaN|null).{0,60}/) || [''])[0]);

const build = (goals, a, mulls) => {
  const cards = (a || A).cards;
  const evals = goalEvals(goals, cards, 7, mulls == null ? 2 : mulls);
  const ready = evals.filter(e => e.ready).map(e => e.goal);
  const series = ready.length ? goalSeries(ready, cards, 7, mulls == null ? 2 : mulls) : [];
  return consistencyHTML(a || A, evals, series, mulls == null ? 2 : mulls);
};

/* ============================================================
   LABELS
   ============================================================ */
group('clause labels say what the clause means');

eq('a named clause', clauseLabel(READY.clauses[0]), 'at least 1 × Leyline Axe');
eq('a filter clause', clauseLabel(READY.clauses[1]), 'at least 2 × land');
eq('a types clause', clauseLabel({ kind: 'types', n: 3 }), 'at least 3 distinct card types');
eq('one type reads singular', clauseLabel({ kind: 'types', n: 1 }), 'at least 1 distinct card type');
eq('an unchosen card says so', clauseLabel(BLOCKED.clauses[0]), 'at least 1 × (no card chosen)');
eq('a compound filter reads left to right',
   selLabel({ mode: 'filter', f: { creature: 'yes', land: 'no', mvOp: 'lte', mvVal: 2 } }),
   'creature nonland MV ≤ 2');
eq('an empty filter matches anything', selLabel({ mode: 'filter', f: {} }), 'any card');
eq('a missing selector is nothing', selLabel(null), 'nothing');

/* ============================================================
   ISSUES
   ============================================================ */
group('an unfinished goal is refused, not answered');

{
  const iss = goalIssues(BLOCKED, CARDS);
  chk('a clause with no card chosen blocks', iss.some(i => i.level === 'blocked'));
  chk('goalReady agrees', goalReady(BLOCKED, CARDS) === false);
  const ev = goalEval(BLOCKED, CARDS, 7, 2);
  eq('and nothing is computed', ev.r, null);
  eq('and no chain is built', ev.chain, null);
}
{
  const iss = goalIssues(IMPOSSIBLE, CARDS);
  chk('a clause matching nothing warns rather than blocks',
      iss.length === 1 && iss[0].level === 'warn', JSON.stringify(iss));
  chk('so it still gets a real number', goalReady(IMPOSSIBLE, CARDS) === true);
  eq('and that number is zero', goalEval(IMPOSSIBLE, CARDS, 7, 2).r.p, 0, 1e-12);
}
{
  const iss = goalIssues({ id: 9, name: 'g', clauses: [] }, CARDS);
  chk('a goal with no clauses blocks', iss.length === 1 && iss[0].level === 'blocked');
}
{
  const iss = goalIssues({ id: 9, name: 'g', clauses: [{ kind: 'types', n: 6 }] }, CARDS);
  chk('asking for more types than the list holds warns',
      iss.some(i => i.level === 'warn' && /4/.test(i.msg)), JSON.stringify(iss));
}

/* ============================================================
   THE PANEL
   ============================================================ */
group('the panel renders every state cleanly');

{
  const html = build([READY, DELIRIUM]);
  sweep('two ready goals leak nothing', html);
  chk('the goal names are there', html.includes('Leyline start') && html.includes('Delirium types'));
  chk('the exact label is used', html.includes('>exact<'));
  chk('the frontier is drawn', html.includes('<svg') && html.includes('<polyline'));
  chk('percentages are formatted', /\d+\.\d%/.test(html));
  chk('nothing is called best', !/\bbest\b/i.test(html.replace(/marked\s+best/i, '')));
}
{
  const html = build([BLOCKED]);
  sweep('a blocked goal leaks nothing', html);
  chk('it explains rather than answering', html.includes('no card chosen'));
  chk('and prints no headline percentage', !/class="big /.test(html));
  chk('and draws no frontier', !html.includes('<svg'));
}
{
  const html = build([READY, BLOCKED]);
  sweep('a mixed panel leaks nothing', html);
  chk('the ready goal is still drawn', html.includes('<svg'));
  eq('and only it appears in the key', (html.match(/glkey/g) || []).length, 1);
}
{
  const html = build([IMPOSSIBLE]);
  sweep('an impossible goal leaks nothing', html);
  chk('it says so', html.includes('cannot be met'));
  chk('and shows the zero it really is', html.includes('0.0%'));
}
{
  const empty0 = analyseCards([], [], { N: 60, thr: 0.9, onPlay: true });
  const html = build([READY], empty0);
  sweep('an empty deck leaks nothing', html);
  chk('and teaches instead', html.includes('Deck goals'));
}
{
  const html = build([], A);
  sweep('no goals leaks nothing', html);
  chk('and points at the builder', html.includes('No goals yet'));
}
{
  const broken = Object.assign(analyseCards([], [], { N: 60, thr: 0.9, onPlay: true }), { broken: true });
  const html = build([READY], broken);
  sweep('a broken variant leaks nothing', html);
  chk('and says what is wrong', html.includes('cannot be applied'));
}
{
  const withUnknown = analyseCards(CARDS.concat([card('Mystery', 1, '', 0, false)]),
                                   ['Mystery'], { N: 61, thr: 0.9, onPlay: true });
  const html = build([READY], withUnknown);
  sweep('an unresolved card leaks nothing', html);
  chk('and is flagged as understating the answer', html.includes('understated'));
}

group('every mulligan policy renders');
for (let m = 0; m <= 6; m++) {
  const html = build([READY, DELIRIUM], A, m);
  sweep(`insisting up to ${m} leaks nothing`, html);
}

group('user text is escaped');
{
  const nasty = { id: 5, name: '<img src=x onerror=alert(1)>', clauses: [{ kind: 'types', n: 2 }] };
  const html = build([nasty]);
  chk('a goal name cannot inject markup', !html.includes('<img src=x'), html.slice(0, 200));
  chk('it is escaped instead', html.includes('&lt;img'));
  sweep('and still leaks nothing', html);
}
{
  const nastyCard = card('<b>Bad</b>', 4, 'Instant', 1);
  const cards = CARDS.concat([nastyCard]);
  const g = { id: 6, name: 'g', clauses: [{ kind: 'cards', n: 1, sel: { mode: 'named', names: ['<b>Bad</b>'] } }] };
  const evals = goalEvals([g], cards, 7, 2);
  const html = consistencyHTML(analyseCards(cards, [], { N: 64, thr: 0.9, onPlay: true }),
                               evals, goalSeries([g], cards, 7, 2), 2);
  chk('a card name in a clause label is escaped too', !html.includes('<b>Bad</b>'));
  chk('and shows as text', html.includes('&lt;b&gt;Bad'));
}

/* ============================================================
   THE CHART
   ============================================================ */
group('the frontier chart is well-formed');

{
  const series = goalSeries([READY, DELIRIUM], CARDS, 7, 3);
  const svg = goalChartHTML(series);
  sweep('the chart leaks nothing', svg);
  eq('one polyline per goal', (svg.match(/<polyline/g) || []).length, 2);
  eq('one point per policy per goal', (svg.match(/<circle/g) || []).length, 8);
  chk('every coordinate is a real number',
      !/(cx|cy|x1|y1|x2|y2)="(NaN|Infinity|-Infinity|undefined)"/.test(svg));
  chk('the axis is pinned to 0-100%, not fitted', svg.includes('>0%<') && svg.includes('>100%<'));
  chk('every hue is a solved token', (svg.match(/var\(--([a-zA-Z0-9]+)\)/g) || [])
      .every(v => /var\(--(acc|good|warn|bad|dim|dim2|line|tx|W|U|B|R|G)\)/.test(v)));
  chk('points carry a readable title', svg.includes('<title>'));
}
{
  eq('no series draws nothing', goalChartHTML([]), '');
}
{
  /* A single policy is one point: a polyline of one, no knee, and no crash. */
  const series = goalSeries([READY], CARDS, 7, 0);
  const svg = goalChartHTML(series);
  sweep('a one-point series leaks nothing', svg);
  eq('and draws its single point', (svg.match(/<circle/g) || []).length, 1);
  eq('with no knee to name', series[0].knee, null);
}
{
  const series = goalSeries([READY], CARDS, 7, 4);
  const txt = goalKneeHTML(series);
  sweep('the knee text leaks nothing', txt);
  chk('it names a policy rather than recommending one',
      /bends at/.test(txt) && !/you should/i.test(txt));
}

/* ============================================================
   THE BUILDER
   ============================================================ */
group('the goal builder renders');

{
  const html = goalEditorHTML(A, [READY, DELIRIUM, BLOCKED]);
  sweep('the editor leaks nothing', html);
  eq('one block per goal', (html.match(/class="gblock"/g) || []).length, 3);
  chk('every deck card is offered', CARDS.every(c => html.includes(`>${c.qty} ${c.name}<`)));
  chk('the chosen card is selected', /value="Leyline Axe" selected/.test(html));
  /* Five clauses across the three goals, one of which is a types clause. Only
     the four `cards` clauses get a selector row; a types clause that offered a
     card dropdown would let you set a field the maths never reads. */
  eq('every clause gets a row', (html.match(/class="grow"/g) || []).length, 5);
  eq('only the cards clauses get a selector', (html.match(/class="gsel"/g) || []).length, 4);
  eq('and one selector per selector row', (html.match(/data-attr="mode"/g) || []).length, 4);
  chk('presets are offered', html.includes('goalLeyline') && html.includes('goalDelirium'));
}
{
  const html = goalEditorHTML(A, []);
  sweep('an empty editor leaks nothing', html);
  chk('and explains what a goal is', html.includes('definition of a good opening hand'));
  eq('with no blocks', (html.match(/class="gblock"/g) || []).length, 0);
}
{
  const html = goalEditorHTML(analyseCards([], [], { N: 60, thr: 0.9, onPlay: true }), [READY]);
  sweep('an editor with no deck leaks nothing', html);
  chk('the card dropdown still offers its placeholder', html.includes('— pick a card —'));
}
{
  const nasty = { id: 7, name: '"><b>x', clauses: [] };
  const html = goalEditorHTML(A, [nasty]);
  chk('a goal name is escaped in the editor too', !html.includes('"><b>x'));
}

/* ============================================================
   PRESETS
   ============================================================ */
group('the shipped presets are what they claim');

{
  const g = newGoal(GOAL_PRESETS.leyline.name, GOAL_PRESETS.leyline.clauses);
  eq('the Leyline preset has two clauses', g.clauses.length, 2);
  chk('and deliberately names no card — the tool does not know yours',
      g.clauses[0].sel.names.length === 0);
  chk('so it arrives blocked rather than answering 0%', goalReady(g, CARDS) === false);

  const chosen = JSON.parse(JSON.stringify(g));
  chosen.clauses[0].sel.names = ['Leyline Axe'];
  chk('and becomes ready once you pick one', goalReady(chosen, CARDS) === true);
}
{
  const g = newGoal(GOAL_PRESETS.delirium.name, GOAL_PRESETS.delirium.clauses);
  eq('the delirium preset asks for three types', g.clauses[0].n, 3);
  chk('and is ready out of the box', goalReady(g, CARDS) === true);
}
{
  const g = newGoal(GOAL_PRESETS.curve.name, GOAL_PRESETS.curve.clauses);
  chk('the curve preset is ready out of the box', goalReady(g, CARDS) === true);
  const p = pGoal(g, CARDS, 7).p;
  chk('and is a plausible opener probability', p > 0.5 && p < 0.95, String(p));
}
{
  const a = newGoal('x', []), b = newGoal('y', []);
  chk('ids are unique and increasing', b.id > a.id);
  const g = newGoal('z', GOAL_PRESETS.curve.clauses);
  chk('a preset is deep-copied, not shared', g.clauses !== GOAL_PRESETS.curve.clauses &&
      g.clauses[0] !== GOAL_PRESETS.curve.clauses[0]);
  g.clauses[0].n = 5;
  eq('so editing one goal cannot rewrite the preset', GOAL_PRESETS.curve.clauses[0].n, 2);
}

process.exit(report() ? 1 : 0);
