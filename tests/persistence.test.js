/* Saving, loading, importing and exporting builds.

   Browser storage is convenience; the .json exports are the durable copy. These
   tests care most about the failure paths — quota exceeded, corrupt stored JSON,
   malformed imports, name collisions — because that is where silent data loss
   would live. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

// ---- minimal DOM / browser stubs ----
const fields = { list: '', deckSize: '60', thr: '0.90', play: '1', ramp: '0', comp: '0', copyTurn: '3' };
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

load(['persistence'], { PAYOFFS: [], PID: 0, DB: {}, SNAPSHOT: null });

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

group('exported bundle re-imports');
STATE = { builds: { 'Deck A': snap }, active: 'Deck A', cardCache: {} };
const bundle = { format: 'mtg-mana-calc', version: 1, exported: new Date().toISOString(), builds: STATE.builds };
STATE = { builds: {}, active: null, cardCache: {} };
importPayload(JSON.stringify(bundle));
chk('bundle survives the trip with settings intact',
    !!STATE.builds['Deck A'] && STATE.builds['Deck A'].ramp === 7);

process.exit(report());
