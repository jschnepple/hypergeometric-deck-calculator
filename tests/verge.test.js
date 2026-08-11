/* Conditional duals (the Verge cycle).

   Scryfall's produced_mana lists BOTH colours with no signal about which one is
   conditional, so the oracle text is the only reliable source. Two traps live
   here, both real and both caught by these tests:
     - the article varies ("an Island" vs "a Swamp"), which breaks a naive regex
       on 4 of the 10 cards;
     - basic-type order flips between Duskmourn and Aetherdrift, so clause
       position does NOT tell you which colour is conditional.

   Oracle text below is verbatim from the Scryfall API. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing'], { COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {} });

const VERGES = [
  ['Blazemire Verge',  '{T}: Add {B}.\n{T}: Add {R}. Activate only if you control a Swamp or a Mountain.',   'B', 'R', ['Swamp', 'Mountain']],
  ['Floodfarm Verge',  '{T}: Add {W}.\n{T}: Add {U}. Activate only if you control a Plains or an Island.',   'W', 'U', ['Plains', 'Island']],
  ['Gloomlake Verge',  '{T}: Add {U}.\n{T}: Add {B}. Activate only if you control an Island or a Swamp.',    'U', 'B', ['Island', 'Swamp']],
  ['Hushwood Verge',   '{T}: Add {G}.\n{T}: Add {W}. Activate only if you control a Forest or a Plains.',    'G', 'W', ['Forest', 'Plains']],
  ['Thornspire Verge', '{T}: Add {R}.\n{T}: Add {G}. Activate only if you control a Mountain or a Forest.',  'R', 'G', ['Mountain', 'Forest']],
  ['Bleachbone Verge', '{T}: Add {B}.\n{T}: Add {W}. Activate only if you control a Plains or a Swamp.',     'B', 'W', ['Plains', 'Swamp']],
  ['Riverpyre Verge',  '{T}: Add {R}.\n{T}: Add {U}. Activate only if you control an Island or a Mountain.', 'R', 'U', ['Island', 'Mountain']],
  ['Sunbillow Verge',  '{T}: Add {W}.\n{T}: Add {R}. Activate only if you control a Mountain or a Plains.',  'W', 'R', ['Mountain', 'Plains']],
  ['Wastewood Verge',  '{T}: Add {G}.\n{T}: Add {B}. Activate only if you control a Swamp or a Forest.',     'G', 'B', ['Swamp', 'Forest']],
  ['Willowrush Verge', '{T}: Add {U}.\n{T}: Add {G}. Activate only if you control a Forest or an Island.',   'U', 'G', ['Forest', 'Island']],
];

group('all 10 Verges parse correctly');
for (const [name, oracle, base, cond, types] of VERGES) {
  const v = parseVerge(oracle);
  const ok = v && v.base === base && v.cond === cond &&
             JSON.stringify([...v.enablers].sort()) === JSON.stringify([...types].sort());
  chk(`${name}: ${base} free, ${cond} needs ${types.join('/')}`, ok, JSON.stringify(v));
}

group('non-Verges are not misdetected');
const negatives = [
  ['Razorverge Thicket (name contains "verge")', 'This land enters tapped unless you control two or fewer other lands.\n{T}: Add {G} or {W}.'],
  ['Blood Crypt (plain dual)',                   '({T}: Add {B} or {R}.)\nAs this land enters, you may pay 2 life. If you don\'t, it enters tapped.'],
  ['Krosan Verge (colourless)',                  'This land enters tapped.\n{T}: Add {C}.'],
  ['basic Mountain',                             '({T}: Add {R}.)'],
  ['MDFC with null oracle text',                 null],
  ['empty string',                               ''],
];
for (const [label, oracle] of negatives) chk(label, parseVerge(oracle) === null, JSON.stringify(parseVerge(oracle)));

// ---- enabler counting ----
const subs = tl => ((tl || '').split('—')[1] || '').trim().split(/\s+/).filter(Boolean);

group('basic land types read off the type line');
const typeLines = [
  ['Basic Land — Swamp',           ['Swamp']],
  ['Basic Snow Land — Mountain',   ['Mountain']],
  ['Land — Plains Island',         ['Plains', 'Island']],            // Hallowed Fountain
  ['Land — Swamp Mountain',        ['Swamp', 'Mountain']],           // Blood Crypt
  ['Land — Plains Island Swamp',   ['Plains', 'Island', 'Swamp']],   // triome
  ['Land',                         []],                              // Verge, Mutavault
  ['Land // Land',                 []],                              // Pathway
  ['Land Creature — Forest Dryad', ['Forest', 'Dryad']],             // Dryad Arbor
];
for (const [tl, want] of typeLines) eq(`"${tl}"`, subs(tl), want);

group('enablers are counted per permanent, not per type');
/* The bug this guards against: a land carrying BOTH required types was counted
   twice, because enablers were tallied per type and then summed. 4 Blood Crypt
   read as 8 enablers for Blazemire Verge, overstating its off-colour by ~4pp. */
const deck = [
  { name: 'Blood Crypt',        qty: 4, subtypes: subs('Land — Swamp Mountain') },
  { name: 'Blazemire Verge',    qty: 4, subtypes: subs('Land') },
  { name: 'Haunted Ridge',      qty: 4, subtypes: subs('Land') },
  { name: 'Blightstep Pathway', qty: 4, subtypes: subs('Land // Land') },
  { name: 'Swamp',              qty: 5, subtypes: subs('Basic Land — Swamp') },
  { name: 'Mountain',           qty: 5, subtypes: subs('Basic Land — Mountain') },
];
eq('Blood Crypt counted once (14, not 18)', countEnablers(deck, ['Swamp', 'Mountain']), 14);
eq('Verges do not enable themselves',   countEnablers([deck[1]], ['Swamp', 'Mountain']), 0);
eq('fastlands do not enable',           countEnablers([deck[2]], ['Swamp', 'Mountain']), 0);
eq('Pathways do not enable',            countEnablers([deck[3]], ['Swamp', 'Mountain']), 0);

group('typed nonbasics enable, exactly like basics');
const wu = [
  { name: 'Hallowed Fountain', qty: 4, subtypes: subs('Land — Plains Island') },
  { name: 'Floodfarm Verge',   qty: 4, subtypes: subs('Land') },
  { name: 'Plains',            qty: 4, subtypes: subs('Basic Land — Plains') },
  { name: 'Island',            qty: 4, subtypes: subs('Basic Land — Island') },
];
eq('Hallowed Fountain + basics = 12 enablers (not 16)', countEnablers(wu, ['Plains', 'Island']), 12);
chk('a triome enables', countEnablers(
  [{ qty: 4, subtypes: subs('Land — Plains Island Swamp') }], ['Island']) === 4);

group('discount responds to enabler count');
const w = n => hyperAtLeast(1, n, 9, 60);
chk('more enablers means a higher weight', w(6) < w(10) && w(10) < w(14));
chk('zero enablers means the off-colour is dead', w(0) === 0);
chk('weight is a probability', [0, 4, 12, 24].every(n => w(n) >= 0 && w(n) <= 1));

process.exit(report());
