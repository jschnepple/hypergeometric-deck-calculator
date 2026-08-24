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

load(['persistence'], { PAYOFFS: [], PID: 0, DB: {}, SNAPSHOT: null,
                        VARIANTS: [], VID: 0, ACTIVE_V: null });

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
eq('schema is stamped', vsnap.schema, 2);
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
fields.list = '4 Lightning Bolt\n20 Mountain'; fields.ramp = '7';

group('exported bundle re-imports');
STATE = { builds: { 'Deck A': snap }, active: 'Deck A', cardCache: {} };
const bundle = { format: 'mtg-mana-calc', version: 1, exported: new Date().toISOString(), builds: STATE.builds };
STATE = { builds: {}, active: null, cardCache: {} };
importPayload(JSON.stringify(bundle));
chk('bundle survives the trip with settings intact',
    !!STATE.builds['Deck A'] && STATE.builds['Deck A'].ramp === 7);

process.exit(report());
