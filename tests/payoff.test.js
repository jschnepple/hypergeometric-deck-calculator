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

/* A card with NO type line falls back to the parser's own land verdict.

   The inline `[land:RG]` escape hatch produces exactly that: the parser records
   `land:true` and nothing else, because the tag discards everything Scryfall
   would have known. Reading only the type line made three parts of the tool
   disagree about the same card — `analyseCards` counted it in the land count,
   `cardTypes` called it a Land, and this said it was neither a land nor a
   permanent, so it passed "must NOT be a land" as well.

   This is the one place in session six where an existing figure moves, and it
   moves only for a deck using the tag, and only from wrong to right. */
const tagged = { qty: 4, land: true, cmc: 0 };
chk('an inline land tag is a land',        matches(tagged, { land: 'yes' }));
chk('and is not a nonland',               !matches(tagged, { land: 'no' }));
chk('and is a permanent',                  matches(tagged, { permanent: 'yes' }));
chk('and is not a creature',              !matches(tagged, { creature: 'yes' }));
chk('so United Battlefront still misses it', !matches(tagged, UB));
chk('and Getaway Barrel still misses it',    !matches(tagged, GB));

/* An unresolved card is land:false and has no type line, so it reads as
   nonland, noncreature, nonpermanent, mana value 0 — it passes every negative
   filter there is. That is why evalPayoff skips `unknown` before ever calling
   this, and why goalSets does the same. */
const unresolved = { qty: 4, unknown: true, land: false, cmc: 0 };
chk('an unresolved card passes a nonland filter — which is why callers skip it',
    matches(unresolved, { land: 'no', mvOp: 'lte', mvVal: 3 }));

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

/* ------------------------------------------------------------------ */
/* Type selection — "a Dwarf or Equipment card".

   The dropdowns can only AND three coarse questions. A payoff's `anyOf` is a
   list of specific types joined by OR, and it is ANDed with the dropdowns. The
   wording is Dáin's Company's, checked against the live Scryfall record:

     "look at the top four cards of your library. You may reveal a Dwarf or
      Equipment card from among them and put it into your hand."                */
globalThis.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

group('type selection: matching');
const DC = { creature: 'any', land: 'any', permanent: 'any', mvOp: 'any', mvVal: 3,
             anyOf: ['creature:Dwarf', 'sub:Equipment'] };
chk('a Dwarf creature hits',            matches(card('Creature — Dwarf Warrior', 2), DC));
chk('a legendary Dwarf hits',           matches(card('Legendary Creature — Dwarf Scout', 2), DC));
chk('an Equipment hits',                matches(card('Artifact — Equipment', 1), DC));
chk('an Equipment creature hits once',  matches(card('Artifact Creature — Equipment Fox', 3), DC));
chk('a Kindred Dwarf spell hits — the card says "Dwarf card", not "Dwarf creature card"',
    matches(card('Kindred Instant — Dwarf', 2), DC));
chk('a non-Dwarf creature MISSES',     !matches(card('Creature — Human Soldier', 2), DC));
chk('a plain artifact MISSES',         !matches(card('Artifact', 2), DC));
chk('a Vehicle MISSES',                !matches(card('Artifact — Vehicle', 2), DC));
chk('an instant MISSES',               !matches(card('Instant', 1), DC));
chk('a land MISSES',                   !matches(card('Basic Land — Mountain', 0), DC));
chk('a subtype is a whole word: Dwarfling is not Dwarf',
    !matches(card('Creature — Dwarfling', 2), DC));
chk('"Dwarf" in a NAME is not a type',
    !matches({ name: 'Dwarven Forge', typeLine: 'Artifact', cmc: 2, qty: 1 }, DC));
chk('matching ignores case',            matches(card('Creature — Dwarf', 2), { anyOf: ['creature:dwarf'] }));

chk('a card type can be selected too',  matches(card('Artifact', 2), { anyOf: ['type:Artifact'] }));
chk('…and reads the card types, not the subtypes',
    !matches(card('Creature — Artifact', 2), { anyOf: ['type:Artifact'] }));
chk('a supertype is not a type',       !matches(card('Legendary Sorcery', 2), { anyOf: ['type:Legendary'] }));
chk('an inline land tag is a Land to the selection as well',
    matches(tagged, { anyOf: ['type:Land'] }));

chk('an empty selection restricts nothing',  matches(card('Instant', 1), { anyOf: [] }));
chk('an absent selection restricts nothing', matches(card('Instant', 1), {}));
chk('junk in the list is ignored, not matched',
    matches(card('Instant', 1), { anyOf: [null, 7, ''] }));
chk('a key of an unknown kind matches nothing',
    !matches(card('Creature — Dwarf', 2), { anyOf: ['colour:Dwarf'] }));

/* AND with the dropdowns: "a Dwarf CREATURE card with mana value 2 or less". */
const STRICT = { ...DC, anyOf: ['creature:Dwarf'], creature: 'yes', mvOp: 'lte', mvVal: 2 };
chk('the selection is ANDed with the dropdowns', matches(card('Creature — Dwarf', 2), STRICT));
chk('…so a Kindred Dwarf spell now misses',     !matches(card('Kindred Instant — Dwarf', 2), STRICT));
chk('…and so does a three-mana Dwarf',          !matches(card('Creature — Dwarf', 3), STRICT));

/* A changeling is every creature type and no artifact type. */
const ling = { typeLine: 'Creature — Shapeshifter', cmc: 2, qty: 1, changeling: true };
chk('a changeling is a Dwarf',               matches(ling, { anyOf: ['creature:Dwarf'] }));
chk('a changeling is NOT an Equipment',     !matches(ling, { anyOf: ['sub:Equipment'] }));
chk('the flag alone, on a non-creature, is not a creature type',
    !matches({ typeLine: 'Artifact', cmc: 2, qty: 1, changeling: true }, { anyOf: ['creature:Dwarf'] }));

group('type selection: the Dwarves deck, against arithmetic done by hand');
const DWARVES = { total: 60, cards: [
  { name: "Dain's Company", displayName: "Dáin's Company", qty: 4, typeLine: 'Creature — Dwarf Warrior', cmc: 2 },
  { name: 'Other Dwarf',    qty: 14, typeLine: 'Creature — Dwarf Soldier', cmc: 2 },
  { name: 'War Axe',        qty: 6,  typeLine: 'Artifact — Equipment', cmc: 1 },
  { name: 'Living Axe',     qty: 2,  typeLine: 'Artifact Creature — Equipment Dwarf', cmc: 3 },
  { name: 'Hired Sword',    qty: 4,  typeLine: 'Creature — Human Soldier', cmc: 2 },
  { name: 'Burn',           qty: 6,  typeLine: 'Instant', cmc: 1 },
  { name: 'Dwarven Chant',  qty: 2,  typeLine: 'Kindred Instant — Dwarf', cmc: 2 },
  { name: 'Mystery',        qty: 0,  typeLine: 'Creature — Elf', cmc: 1 },
  { name: 'Mountain',       qty: 22, typeLine: 'Basic Land — Mountain', cmc: 0 },
]};
const dc = evalPayoff({ name: "Dáin's Company", depth: 4, grab: 1, ...DC }, DWARVES);
/* Dwarves 4+14+2+2 = 22, Equipment 6 more (the two Living Axes are already in),
   28 in all — and the Company that is looking is on the battlefield, not in the
   library, so 27 of 59. */
eq('hits: Dwarves and Equipment, the overlap counted once, minus itself', dc.K, 27);
eq('library is 59', dc.N, 59);
eq('the accent-less decklist name still finds itself (typed "Dain\'s")', dc.N, 59);
const whiff = (32 / 59) * (31 / 58) * (30 / 57) * (29 / 56);
eq('P(at least one in the top four) is 1 − C(32,4)/C(59,4)', dc.pAtLeast1, 1 - whiff, 1e-12);
eq('the distribution sums with the tail', dc.dist[0] + dc.pAtLeast1, 1, 1e-12);
chk('about 92%', Math.abs(dc.pAtLeast1 - 0.921) < 0.001, dc.pAtLeast1);
const onlyDwarf = evalPayoff({ name: "Dáin's Company", depth: 4, grab: 1, ...DC, anyOf: ['creature:Dwarf'] }, DWARVES);
eq('Dwarves alone', onlyDwarf.K, 21);
const onlyEq = evalPayoff({ name: "Dáin's Company", depth: 4, grab: 1, ...DC, anyOf: ['sub:Equipment'] }, DWARVES);
eq('Equipment alone — the Company is not one, so nothing is subtracted', onlyEq.K, 8);
chk('the union is not the sum: two cards are both', dc.K < onlyDwarf.K + onlyEq.K);
const unres = evalPayoff({ name: 'Other', depth: 4, grab: 1, ...DC },
  { total: 60, cards: [{ name: '?', qty: 60, unknown: true, land: false, cmc: 0 }] });
eq('unresolved cards are never hits', unres.K, 0);

group('type selection: what the deck offers');
const opts = payoffTypeOptions(DWARVES.cards, DC.anyOf);
eq('card types, in a fixed order',
   opts.types.map(o => o.label + ' ' + o.qty), ['Artifact 8', 'Creature 24', 'Land 22']);
eq('non-creature subtypes of permanents, with counts — Equipment on a creature is still Equipment',
   opts.subs.map(o => o.label + ' ' + o.qty), ['Equipment 8', 'Mountain 22']);
eq('creature types, Kindred included, a zero-quantity line ignored',
   opts.creatures.map(o => o.label + ' ' + o.qty), ['Dwarf 22', 'Human 4', 'Soldier 18', 'Warrior 4']);
chk('instants offer nothing', ![].concat(opts.types, opts.subs).some(o => /Instant/.test(o.label)));
chk('every key round-trips through the matcher', [].concat(opts.types, opts.subs, opts.creatures).every(o => {
  const n = DWARVES.cards.reduce((s, c) => s + (matches(c, { anyOf: [o.key] }) ? c.qty : 0), 0);
  return n === o.qty;
}));
const withLing = payoffTypeOptions(DWARVES.cards.concat([
  { name: 'Mimic', qty: 3, typeLine: 'Creature — Shapeshifter', cmc: 2, changeling: true }]), []);
eq('a changeling raises every creature type it does not print',
   withLing.creatures.map(o => o.label + ' ' + o.qty),
   ['Dwarf 25', 'Human 7', 'Shapeshifter 3', 'Soldier 21', 'Warrior 7']);
eq('…and no artifact type', withLing.subs.find(o => o.label === 'Equipment').qty, 8);
const stale = payoffTypeOptions([{ name: 'x', qty: 4, typeLine: 'Creature — Elf', cmc: 1 }], DC.anyOf);
chk('a selection the deck no longer supports is kept and flagged',
    stale.creatures.some(o => o.key === 'creature:Dwarf' && o.stale && o.qty === 0) &&
    stale.subs.some(o => o.key === 'sub:Equipment' && o.stale));
eq('unresolved cards offer nothing',
   payoffTypeOptions([{ name: '?', qty: 4, unknown: true }], []), { types: [], subs: [], creatures: [] });

group('type selection: the chips');
const html = typeChipsHTML({ anyOf: DC.anyOf }, opts);
chk('no undefined', !/undefined/.test(html));
chk('no NaN', !/NaN/.test(html));
eq('one chip per option', (html.match(/data-any=/g) || []).length,
   opts.types.length + opts.subs.length + opts.creatures.length);
eq('two are pressed', (html.match(/aria-pressed="true"/g) || []).length, 2);
chk('it says what is being counted', /Counting cards that are: <b>Equipment<\/b> or <b>Dwarf<\/b>/.test(html), html);
chk('and offers a way back', /data-anyclear/.test(html));
const none2 = typeChipsHTML({}, opts);
chk('nothing selected says so, and offers no clear button',
    /no type restriction/.test(none2) && !/data-anyclear/.test(none2));
chk('an unresolved deck is told to look the cards up',
    /Look up costs/.test(typeChipsHTML({}, { types: [], subs: [], creatures: [] })));
chk('a type name is escaped on the way into markup',
    !/<script/.test(typeChipsHTML({}, payoffTypeOptions(
      [{ name: 'x', qty: 1, typeLine: 'Creature — <script>', cmc: 1 }], []))));

group('type selection: toggling');
const tp = { anyOf: ['creature:Dwarf'] };
togglePayoffType(tp, 'sub:Equipment');
eq('a second chip adds', tp.anyOf, ['creature:Dwarf', 'sub:Equipment']);
togglePayoffType(tp, 'creature:Dwarf');
eq('the same chip again removes', tp.anyOf, ['sub:Equipment']);
const fresh = {}; togglePayoffType(fresh, 'type:Artifact');
eq('a payoff saved before this existed gains the list on first use', fresh.anyOf, ['type:Artifact']);
chk('the preset names both halves', JSON.stringify(PRESETS.dc.anyOf) === JSON.stringify(DC.anyOf) &&
    PRESETS.dc.depth === 4 && PRESETS.dc.grab === 1);

process.exit(report());
