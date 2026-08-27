/* Saving, loading, importing and exporting builds.

   Browser storage is convenience; the .json exports are the durable copy. These
   tests care most about the failure paths — quota exceeded, corrupt stored JSON,
   malformed imports, name collisions — because that is where silent data loss
   would live. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

// ---- minimal DOM / browser stubs ----
const fields = { list: '', deckSize: '60', thr: '0.90', play: '1', ramp: '0', comp: '0', copyTurn: '3',
                 glMulls: '2' };
const objs = {};
let store = {}, failWrites = false, lastAlert = '';

globalThis.$ = n => {
  if (n in fields) return { get value() { return fields[n]; }, set value(v) { fields[n] = String(v); } };
  return objs[n] || (objs[n] = {
    value: '', textContent: '', innerHTML: '', className: '',
    classList: { add() {}, remove() {}, toggle() {} },
  });
};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
globalThis.alert = m => { lastAlert = m; };
globalThis.confirm = () => true;
globalThis.document = { createElement: () => ({ click() {}, remove() {}, style: {} }), body: { appendChild() {} } };
globalThis.Blob = class { constructor() {} };
globalThis.URL = { createObjectURL: () => 'blob:', revokeObjectURL() {} };
globalThis.render = () => {};

load(['persistence'], { PAYOFFS: [], PID: 0, DB: {}, SNAPSHOT: null,
                        VARIANTS: [], VID: 0, ACTIVE_V: null,
                        GOALS: [], GOID: 0 });

group('a build captures the whole analysis context');
fields.list = '4 Lightning Bolt\n20 Mountain';
fields.thr = '0.95'; fields.play = '0'; fields.ramp = '7'; fields.comp = '1'; fields.copyTurn = '5';
PAYOFFS = [
  { id: 1, name: 'United Battlefront', depth: 7, grab: 2, creature: 'no', land: 'no', permanent: 'yes', mvOp: 'lte', mvVal: 3 },
  { id: 2, name: 'Getaway Barrel', depth: 13, grab: 1, creature: 'yes', land: 'any', permanent: 'any', mvOp: 'any', mvVal: 0 },
];
const snap = snapshotState();
eq('decklist', snap.list, '4 Lightning Bolt\n20 Mountain');
eq('deck size is numeric', snap.deckSize, 60);
eq('threshold', snap.thr, '0.95');
eq('play/draw', snap.play, '0');
eq('ramp count is numeric', snap.ramp, 7);
eq('companion', snap.comp, '1');
eq('copy turn is numeric', snap.copyTurn, 5);
eq('payoff count', snap.payoffs.length, 2);
chk('payoffs are deep-copied, not aliased to live state',
    snap.payoffs !== PAYOFFS && snap.payoffs[0] !== PAYOFFS[0]);
chk('timestamped', typeof snap.saved === 'string' && snap.saved.includes('T'));

group('loading a build restores it exactly');
fields.list = 'WIPED'; fields.ramp = '0'; fields.thr = '0.90'; PAYOFFS = [];
applyState(snap);
eq('decklist restored', fields.list, '4 Lightning Bolt\n20 Mountain');
eq('ramp restored', fields.ramp, '7');
eq('threshold restored', fields.thr, '0.95');
eq('payoffs restored', PAYOFFS.length, 2);
eq('payoff detail restored', PAYOFFS[1].depth, 13);
eq('next payoff id continues past the highest restored id', PID, 2);

group('round trip through storage');
STATE = { builds: { 'Deck A': snap }, active: 'Deck A', cardCache: { 'lightning bolt': { cmc: 1 } } };
chk('persist succeeds', persist() === true);
const before = JSON.stringify(STATE);
STATE = { builds: {}, active: null, cardCache: {} }; DB = {};
loadStore();
chk('builds come back', !!STATE.builds['Deck A']);
eq('active build comes back', STATE.active, 'Deck A');
chk('cached card data rehydrates into DB', DB['lightning bolt'] && DB['lightning bolt'].cmc === 1);
eq('byte-identical round trip', JSON.stringify(STATE), before);

group('storage failures degrade instead of losing work');
store = {}; STORAGE_OK = true; failWrites = true;
chk('persist reports failure rather than throwing', persist() === false);
chk('storage is marked unavailable so the UI can warn', STORAGE_OK === false);
failWrites = false; STORAGE_OK = true;

store = { [STORE_KEY]: '{not valid json' };
STATE = { builds: {}, active: null, cardCache: {} };
let threw = false;
try { loadStore(); } catch (e) { threw = true; }
chk('corrupt stored JSON does not throw', !threw);
eq('corrupt stored JSON leaves a clean slate', Object.keys(STATE.builds).length, 0);

store = { [STORE_KEY]: '{"unexpected":"shape"}' };
STATE = { builds: {}, active: null, cardCache: {} }; loadStore();
eq('unrecognised stored shape is ignored', Object.keys(STATE.builds).length, 0);

group('import validation');
chk('rejects null', validateBuild(null) === false);
chk('rejects an object with no decklist', validateBuild({ deckSize: 60 }) === false);
chk('accepts a minimal build', validateBuild({ list: '4 Mountain' }) === true);

STATE = { builds: {}, active: null, cardCache: {} };
importPayload(JSON.stringify({ format: 'mtg-mana-calc', version: 1, name: 'Imported', build: { list: '4 Mountain' } }));
chk('single-build export imports', !!STATE.builds.Imported, Object.keys(STATE.builds));

STATE = { builds: {}, active: null, cardCache: {} };
importPayload(JSON.stringify({ format: 'mtg-mana-calc', version: 1,
  builds: { A: { list: '1 A' }, B: { list: '1 B' }, Bad: { nope: 1 } } }));
chk('multi-build export takes the valid ones and skips the rest',
    !!STATE.builds.A && !!STATE.builds.B && !STATE.builds.Bad, Object.keys(STATE.builds));

STATE = { builds: { Existing: { list: '1 ORIGINAL' } }, active: null, cardCache: {} };
importPayload(JSON.stringify({ format: 'mtg-mana-calc', builds: { Existing: { list: '1 DIFFERENT' } } }));
chk('a name collision never overwrites existing work',
    STATE.builds.Existing.list === '1 ORIGINAL' && !!STATE.builds['Existing (copy)'],
    Object.keys(STATE.builds));

lastAlert = ''; importPayload('this is not json');
chk('malformed file explains itself instead of throwing', lastAlert.includes('not valid JSON'), lastAlert);
lastAlert = ''; importPayload(JSON.stringify({ some: 'unrelated file' }));
chk('unrelated JSON is rejected', lastAlert.includes('does not look like'), lastAlert);

/* ------------------------------------------------------------------ */
group('sideboard variants travel with the build');
/* A variant is a diff against a maindeck, so it is meaningless anywhere else —
   it lives inside the build and exports with it. */
fields.list = '4 Cut Down\n20 Swamp\nSideboard\n4 Duress';
VARIANTS = [{ id: 1, name: 'vs Control', note: '', swaps: [{ out: 'Cut Down', in: 'Duress', qty: 2 }] }];
ACTIVE_V = 1;
const vsnap = snapshotState();
eq('schema is stamped', vsnap.schema, 3);
eq('variants are saved', vsnap.variants.length, 1);
eq('swaps are saved', vsnap.variants[0].swaps[0].qty, 2);
eq('the selected variant is saved', vsnap.activeVariant, 1);
chk('variants are deep-copied, not aliased to live state',
    vsnap.variants !== VARIANTS && vsnap.variants[0] !== VARIANTS[0]);

VARIANTS = []; ACTIVE_V = null; VID = 0;
applyState(vsnap);
eq('variants restored', VARIANTS.length, 1);
eq('name restored', VARIANTS[0].name, 'vs Control');
eq('swap restored', VARIANTS[0].swaps[0].out, 'Cut Down');
eq('the selected variant is restored', ACTIVE_V, 1);
eq('next variant id continues past the highest restored id', VID, 1);

group('a build saved before variants existed still loads');
applyState({ list: '4 Cut Down\n20 Swamp' });     // no schema, no variants key
eq('no variants, and no crash', VARIANTS.length, 0);
eq('nothing is selected', ACTIVE_V, null);
eq('id counter resets', VID, 0);

group('variants arriving from a file are rebuilt, not trusted');
applyState({ list: '1 A', variants: 'not an array' });
eq('a non-array is dropped', VARIANTS.length, 0);
applyState({ list: '1 A', variants: [null, 5, { name: 'ok', swaps: [] }] });
eq('junk entries are dropped', VARIANTS.length, 1);
eq('the good one survives', VARIANTS[0].name, 'ok');
applyState({ list: '1 A', variants: [{ name: 'v', swaps: 'nope' }] });
eq('a non-array swap list becomes an empty one', VARIANTS[0].swaps.length, 0);
applyState({ list: '1 A', variants: [{ name: 'v', swaps: [{ out: 'A', in: 'B', qty: '3' }] }] });
eq('a string quantity is coerced to a number', VARIANTS[0].swaps[0].qty, 3);
applyState({ list: '1 A', variants: [{ name: 'v', swaps: [{ out: 'A', in: 'B', qty: -9 }] }] });
eq('a negative quantity is floored at zero', VARIANTS[0].swaps[0].qty, 0);
applyState({ list: '1 A', variants: [{ name: 'v', swaps: [{ qty: 2 }] }] });
eq('a swap naming neither card is dropped', VARIANTS[0].swaps.length, 0);
applyState({ list: '1 A', variants: [{ swaps: [] }] });
chk('an unnamed variant still gets a name', /Variant/.test(VARIANTS[0].name));

group('variant ids stay unique and stable');
applyState({ list: '1 A', variants: [{ id: 1, name: 'a', swaps: [] }, { id: 1, name: 'b', swaps: [] }],
             activeVariant: 1 });
chk('a duplicate id is reassigned', VARIANTS[0].id !== VARIANTS[1].id);
applyState({ list: '1 A', variants: [{ id: 1, name: 'a', swaps: [] }, { id: 7, name: 'b', swaps: [] }],
             activeVariant: 7 });
eq('a gap in the ids is preserved', VARIANTS[1].id, 7);
eq('…so the selection survives a deleted middle variant', ACTIVE_V, 7);
eq('the counter starts above the highest', VID, 7);
applyState({ list: '1 A', variants: [{ id: 1, name: 'a', swaps: [] }], activeVariant: 99 });
eq('a selection pointing at nothing falls back to the maindeck', ACTIVE_V, null);

/* Minting has to reserve every valid id before handing any out. Assigning in
   array order lets an entry with a missing id take the lowest free number even
   when a LATER entry legitimately owns it — which silently repoints the saved
   selection at a different variant, the exact failure the ids exist to prevent. */
applyState({ list: '1 A', variants: [{ name: 'no id' }, { id: 1, name: 'owns 1', swaps: [] }],
             activeVariant: 1 });
eq('a minted id does not steal a later variant’s', VARIANTS[1].id, 1);
eq('the unnumbered one gets a free number instead', VARIANTS[0].id, 2);
eq('so the selection still points where it was saved',
   VARIANTS.find(v => v.id === ACTIVE_V).name, 'owns 1');

VARIANTS = []; ACTIVE_V = null; VID = 0;

/* ------------------------------------------------------------------ */
group('deck goals travel with the build');
/* Same argument as variants: a goal is a statement about THIS deck's plan and
   is meaningless without the list it describes. */
fields.list = '4 Leyline Axe\n20 Mountain';
fields.glMulls = '3';
GOALS = [{ id: 1, name: 'Leyline start', clauses: [
  { kind: 'cards', n: 1, sel: { mode: 'named', names: ['Leyline Axe'] } },
  { kind: 'cards', n: 2, sel: { mode: 'filter', f: { creature: 'any', land: 'yes', permanent: 'any', mvOp: 'any', mvVal: 0 } } },
  { kind: 'types', n: 3 },
]}];
const gsnap = snapshotState();
eq('goals are saved', gsnap.goals.length, 1);
eq('every clause is saved', gsnap.goals[0].clauses.length, 3);
eq('the mulligan policy is saved as a number', gsnap.goalMulls, 3);
chk('goals are deep-copied, not aliased to live state',
    gsnap.goals !== GOALS && gsnap.goals[0] !== GOALS[0]);

GOALS = []; GOID = 0; fields.glMulls = '0';
applyState(gsnap);
eq('goals restored', GOALS.length, 1);
eq('name restored', GOALS[0].name, 'Leyline start');
eq('a named clause restored', GOALS[0].clauses[0].sel.names[0], 'Leyline Axe');
eq('a filter clause restored', GOALS[0].clauses[1].sel.f.land, 'yes');
eq('a types clause restored', GOALS[0].clauses[2].kind, 'types');
eq('the policy restored', fields.glMulls, '3');
eq('next goal id continues past the highest restored id', GOID, 1);

group('a build saved before goals existed still loads');
applyState({ list: '4 Cut Down\n20 Swamp' });     // schema 2 or earlier: no goals key
eq('no goals, and no crash', GOALS.length, 0);
eq('id counter resets', GOID, 0);
eq('the policy falls back to its default', fields.glMulls, '2');
applyState({ schema: 2, list: '1 A', variants: [], activeVariant: null });
eq('an explicit schema-2 build is equally fine', GOALS.length, 0);

group('goals arriving from a file are rebuilt, not trusted');
applyState({ list: '1 A', goals: 'not an array' });
eq('a non-array is dropped', GOALS.length, 0);
applyState({ list: '1 A', goals: [null, 5, { name: 'ok', clauses: [] }] });
eq('junk entries are dropped', GOALS.length, 1);
eq('the good one survives', GOALS[0].name, 'ok');
applyState({ list: '1 A', goals: [{ name: 'g', clauses: 'nope' }] });
eq('a non-array clause list becomes an empty one', GOALS[0].clauses.length, 0);
applyState({ list: '1 A', goals: [{ name: 'g', clauses: [{ kind: 'cards', n: '99' }] }] });
eq('a clause cannot ask for more than a hand holds', GOALS[0].clauses[0].n, 7);
applyState({ list: '1 A', goals: [{ name: 'g', clauses: [{ kind: 'cards', n: -4 }] }] });
eq('a negative count is floored at zero', GOALS[0].clauses[0].n, 0);
applyState({ list: '1 A', goals: [{ name: 'g', clauses: [{ kind: 'cards', n: 1 }] }] });
eq('a clause with no selector gets a filter', GOALS[0].clauses[0].sel.mode, 'filter');
eq('and that filter is fully specified', GOALS[0].clauses[0].sel.f.creature, 'any');
applyState({ list: '1 A', goals: [{ name: 'g', clauses: [
  { kind: 'cards', n: 1, sel: { mode: 'filter', f: { creature: 'maybe', mvOp: 'about', mvVal: 900 } } }] }] });
eq('a nonsense yes/no becomes any', GOALS[0].clauses[0].sel.f.creature, 'any');
eq('a nonsense operator becomes any', GOALS[0].clauses[0].sel.f.mvOp, 'any');
eq('an absurd mana value is clamped', GOALS[0].clauses[0].sel.f.mvVal, 16);

/* A types clause must not arrive carrying a card selector. One that does has a
   printed description and a calculation that disagree — the clause says "three
   distinct card types" and the stale sel says something else entirely. */
applyState({ list: '1 A', goals: [{ name: 'g', clauses: [
  { kind: 'types', n: 3, sel: { mode: 'named', names: ['Leftover'] } }] }] });
chk('a types clause drops any selector it arrived with', !('sel' in GOALS[0].clauses[0]));
eq('and keeps its count', GOALS[0].clauses[0].n, 3);

applyState({ list: '1 A', goals: [{ clauses: [] }] });
chk('an unnamed goal still gets a name', /Goal/.test(GOALS[0].name));
applyState({ list: '1 A', goals: [{ name: 'g', clauses: new Array(40).fill({ kind: 'types', n: 1 }) }] });
eq('a runaway clause list is capped', GOALS[0].clauses.length, 8);

group('goal ids stay unique and stable');
applyState({ list: '1 A', goals: [{ id: 1, name: 'a', clauses: [] }, { id: 1, name: 'b', clauses: [] }] });
chk('a duplicate id is reassigned', GOALS[0].id !== GOALS[1].id);
applyState({ list: '1 A', goals: [{ id: 1, name: 'a', clauses: [] }, { id: 9, name: 'b', clauses: [] }] });
eq('a gap in the ids is preserved', GOALS[1].id, 9);
eq('the counter starts above the highest', GOID, 9);
/* The same reservation rule as variants, and it matters for the same reason:
   the panel keys its headline number and its animated bars on the goal id, so a
   stolen id retargets a tween onto a different goal's figure. */
applyState({ list: '1 A', goals: [{ name: 'no id' }, { id: 1, name: 'owns 1', clauses: [] }] });
eq('a minted id does not steal a later goal’s', GOALS[1].id, 1);
eq('the unnumbered one gets a free number instead', GOALS[0].id, 2);

GOALS = []; GOID = 0; fields.glMulls = '2';
fields.list = '4 Lightning Bolt\n20 Mountain'; fields.ramp = '7';

group('exported bundle re-imports');
STATE = { builds: { 'Deck A': snap }, active: 'Deck A', cardCache: {} };
const bundle = { format: 'mtg-mana-calc', version: 1, exported: new Date().toISOString(), builds: STATE.builds };
STATE = { builds: {}, active: null, cardCache: {} };
importPayload(JSON.stringify(bundle));
chk('bundle survives the trip with settings intact',
    !!STATE.builds['Deck A'] && STATE.builds['Deck A'].ramp === 7);

process.exit(report());
