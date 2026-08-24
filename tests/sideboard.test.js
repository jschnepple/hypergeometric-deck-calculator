/* Sideboards and sideboard variants.

   Two things are being guarded here.

   First a REGRESSION. parseList skips a line matching /^sideboard\b/ and then
   carries on parsing, so before splitList existed every sideboard card in a
   pasted export was silently counted as part of the maindeck — 75 cards
   analysed as a 60-card deck, land ratios and colour requirements included.
   Nothing threw and nothing looked wrong. The first group below is that bug.

   Second, the failure modes of a DIFF. A variant is stored as swaps against the
   maindeck, so it can go stale: the card it takes out gets cut, the card it
   brings in leaves the sideboard, the counts stop balancing. Every one of those
   has to be caught and named rather than half-applied. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
  CNAME: { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' },
});

const qtyOf = (cards, name) => {
  const c = cards.find(x => x.name.toLowerCase() === name.toLowerCase());
  return c ? c.qty : 0;
};
const count = cards => cards.reduce((s, c) => s + c.qty, 0);

/* ------------------------------------------------------------------ */
group('the sideboard is kept out of the deck');

const LIST = `4 Lightning Bolt
4 Monastery Swiftspeaker
20 Mountain

Sideboard
3 Abrade
2 Roiling Vortex`;

let d = parseDeck(LIST);
eq('maindeck total', count(d.cards), 28);
eq('sideboard total', count(d.side), 5);
eq('sideboard cards are not in the maindeck', qtyOf(d.cards, 'Abrade'), 0);
chk('sideboard was detected', d.sawSide);

// The regression, stated as the thing that used to happen.
chk('a sideboard no longer inflates the deck',
    count(d.cards) !== count(d.cards) + count(d.side));

group('every header form real exports use');
const forms = [
  ['bare word',      'Sideboard'],
  ['comment style',  '//Sideboard'],
  ['with a colon',   'SIDEBOARD:'],
  ['with a count',   'Sideboard (2)'],
  ['count, no paren','Sideboard 2'],
  ['short',          'SB'],
];
for (const [label, header] of forms) {
  const r = parseDeck(`20 Mountain\n${header}\n2 Abrade`);
  eq(`${label} — "${header}"`, count(r.side), 2);
}

group('other section headers');
eq('Deck sends cards back to the maindeck',
   count(parseDeck('Sideboard\n2 Abrade\nDeck\n20 Mountain').cards), 20);
eq('Maybeboard cards go nowhere',
   count(parseDeck('20 Mountain\nMaybeboard\n4 Shock').cards), 20);
eq('…and not into the sideboard either',
   count(parseDeck('20 Mountain\nMaybeboard\n4 Shock').side), 0);
/* Companion is ignored, not added to the sideboard. Arena and Moxfield both
   print the companion in its own block AND again in the sideboard, so counting
   it here reports a 16-card sideboard for a legal deck. */
eq('a Companion block does not land in the sideboard',
   count(parseDeck('20 Mountain\nCompanion\n1 Jegantha, the Wellspring').side), 0);
eq('…and does not land in the deck either',
   count(parseDeck('20 Mountain\nCompanion\n1 Jegantha, the Wellspring').cards), 20);
eq('so an Arena export listing it twice still reads as fifteen',
   count(parseDeck('20 Mountain\nCompanion\n1 Jegantha, the Wellspring\nSideboard\n'+
                   '1 Jegantha, the Wellspring\n14 Duress').side), 15);
eq('MTGO per-line SB: prefix', count(parseDeck('20 Mountain\nSB: 2 Abrade').side), 2);
eq('…and only that line', count(parseDeck('20 Mountain\nSB: 2 Abrade\n4 Shock').cards), 24);

group('a blank line is NOT a sideboard marker');
/* Deliberate. Blank lines are used cosmetically inside mainboard lists all the
   time — the example deck in this very file separates spells from lands with
   one — and guessing wrong silently moves cards between decks. */
eq('spells and lands split by a blank line stay one deck',
   count(parseDeck('4 Lightning Bolt\n\n20 Mountain').cards), 24);
eq('…and the sideboard stays empty', count(parseDeck('4 Lightning Bolt\n\n20 Mountain').side), 0);

/* ------------------------------------------------------------------ */
group('applying a variant');

d = parseDeck(LIST);
let r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 2 }]);
chk('not broken', !r.broken);
eq('cards taken out', qtyOf(r.cards, 'Lightning Bolt'), 2);
eq('cards brought in', qtyOf(r.cards, 'Abrade'), 2);
eq('deck size is unchanged', count(r.cards), 28);
eq('in and out balance', r.net, 0);
eq('no problems at all', r.problems.length, 0);

r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 4 }]);
eq('taking out every copy removes the card', qtyOf(r.cards, 'Lightning Bolt'), 0);
chk('…and drops it from the list entirely',
    !r.cards.some(c => c.name === 'Lightning Bolt'));

group('the maindeck is never mutated by a variant');
const before = count(d.cards);
applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 4 }]);
eq('maindeck count unchanged after the swap', count(d.cards), before);
eq('the card itself still has its copies', qtyOf(d.cards, 'Lightning Bolt'), 4);

group('shared references are cloned, not handed on');
/* `produces` and `subtypes` come straight off the DB record, and analyse()
   REASSIGNS produces for fetchlands. If a variant shared those arrays it could
   change what the baseline column says about the maindeck. */
const src = [{ name: 'Dual', qty: 4, land: true, produces: ['U', 'B'], subtypes: ['Island'],
               pips: { W:0,U:0,B:0,R:0,G:0 }, cmc: 0 }];
const cl = applyVariant(src, [], []);
chk('produces is a copy', cl.cards[0].produces !== src[0].produces);
chk('subtypes is a copy', cl.cards[0].subtypes !== src[0].subtypes);
chk('pips is a copy', cl.cards[0].pips !== src[0].pips);
cl.cards[0].produces.push('R');
eq('mutating the clone leaves the original alone', src[0].produces.length, 2);

/* ------------------------------------------------------------------ */
group('a broken variant is named, never half-applied');

r = applyVariant(d.cards, d.side, [{ out: 'Sheoldred, the Apocalypse', in: 'Abrade', qty: 2 }]);
chk('taking out a card that is not in the deck is an error', r.broken);
chk('the message names the card', /Sheoldred/.test(r.errors[0].msg));

r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Sheoldred, the Apocalypse', qty: 2 }]);
chk('bringing in a card that is not in the sideboard is an error', r.broken);

r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 9 }]);
chk('taking out more copies than the deck runs is an error', r.broken);
chk('the message gives both numbers', /9/.test(r.errors[0].msg) && /4/.test(r.errors[0].msg));

r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 4 }]);
chk('four Abrade from a sideboard holding three is an error', r.broken);

group('a sideboard card cannot be spent twice across swaps');
r = applyVariant(d.cards, d.side, [
  { out: 'Lightning Bolt', in: 'Abrade', qty: 2 },
  { out: 'Monastery Swiftspeaker', in: 'Abrade', qty: 2 },
]);
chk('four Abrade in total, from three, is an error', r.broken);
r = applyVariant(d.cards, d.side, [
  { out: 'Lightning Bolt', in: 'Abrade', qty: 2 },
  { out: 'Monastery Swiftspeaker', in: 'Abrade', qty: 1 },
]);
chk('three is fine', !r.broken);
eq('and they stack into one entry', qtyOf(r.cards, 'Abrade'), 3);

/* ------------------------------------------------------------------ */
group('unbalanced swaps warn but still analyse');

r = applyVariant(d.cards, d.side, [{ out: '', in: 'Abrade', qty: 2 }]);
chk('bringing in without taking out is not an error', !r.broken);
eq('the deck is two cards bigger', count(r.cards), 30);
eq('net is reported', r.net, 2);
chk('and warned about', r.problems.some(p => p.level === 'warn' && /\+2 cards/.test(p.msg)));

r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: '', qty: 2 }]);
eq('taking out without bringing in shrinks the deck', count(r.cards), 26);
eq('net is negative', r.net, -2);

group('rows being edited are not errors');
r = applyVariant(d.cards, d.side, [{ out: '', in: '', qty: 1 }]);
chk('an empty row is ignored', !r.broken && r.problems.length === 0);
r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 0 }]);
chk('a zero-quantity row warns rather than errors', !r.broken);
eq('and changes nothing', count(r.cards), 28);

/* ------------------------------------------------------------------ */
group('a card split across two lines is still one card');
/* Real exports do this — two printings of the same card, or a companion listed
   twice. findCard returns the first match, so without merging, "2 Abrade" plus
   "2 Abrade" reads as two copies and a perfectly legal three-card swap breaks. */
const split = parseDeck('2 Lightning Bolt\n2 Lightning Bolt\n20 Mountain\n' +
                        'Sideboard\n1 Abrade\n2 Abrade');
r = applyVariant(split.cards, split.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 3 }]);
chk('taking out three of a split playset works', !r.broken, (r.errors[0] || {}).msg);
eq('the entries merged', qtyOf(r.cards, 'Lightning Bolt'), 1);
eq('the sideboard side merged too', qtyOf(r.cards, 'Abrade'), 3);
eq('and the deck is one list per card', r.cards.filter(c => c.name === 'Lightning Bolt').length, 1);
eq('merging does not change the deck size', count(applyVariant(split.cards, split.side, []).cards), 24);
eq('the original list is untouched — still two Bolt entries',
   split.cards.filter(c => c.name === 'Lightning Bolt').length, 2);

group('the four-copy limit');
const four = parseDeck('4 Lightning Bolt\n20 Mountain\nSideboard\n2 Lightning Bolt');
r = applyVariant(four.cards, four.side, [{ out: '', in: 'Lightning Bolt', qty: 2 }]);
chk('six Bolts post-swap is warned', r.problems.some(p => /6 Lightning Bolt/.test(p.msg)));
chk('…but still analysed', !r.broken);

/* Only cards the swaps actually moved. A maindeck already running five of
   something is a problem with the maindeck, and blaming it on every variant in
   turn puts a finding in the comparison panel that no swap caused. */
const already = parseDeck('5 Shock\n20 Mountain\nSideboard\n4 Duress');
r = applyVariant(already.cards, already.side, [{ out: 'Shock', in: 'Duress', qty: 1 }]);
chk('an untouched over-limit card is not blamed on the variant',
    !r.problems.some(p => /Shock/.test(p.msg)), (r.problems[0] || {}).msg);
r = applyVariant(already.cards, already.side, []);
eq('nor on a variant with no swaps at all', r.problems.length, 0);

group('problems are tagged by what caused them');
r = applyVariant(d.cards, d.side, [{ out: 'Lightning Bolt', in: 'Abrade', qty: 0 }]);
eq('a half-filled editor row is tagged as a no-op', r.problems[0].kind, 'noop');
r = applyVariant(d.cards, d.side, [{ out: '', in: 'Abrade', qty: 2 }]);
eq('an unbalanced variant is tagged as a net problem', r.problems[0].kind, 'net');
r = applyVariant(four.cards, four.side, [{ out: '', in: 'Lightning Bolt', qty: 2 }]);
chk('a copy-limit warning is tagged', r.problems.some(p => p.kind === 'copies'));

group('deck legality, independent of any variant');
let leg = deckLegality(four.cards, four.side);
chk('six copies across main and side is flagged',
    leg.problems.some(p => /Lightning Bolt/.test(p.msg) && /6 copies/.test(p.msg)));
leg = deckLegality(parseDeck('40 Mountain').cards, []);
eq('forty Mountains are fine', leg.problems.length, 0);

const big = parseDeck('20 Mountain\nSideboard\n' + '4 Abrade\n'.repeat(5));
leg = deckLegality(big.cards, big.side);
eq('sideboard size is reported', leg.sideCount, 20);
chk('an oversized sideboard is flagged', leg.problems.some(p => /15/.test(p.msg)));

const ok15 = parseDeck('20 Mountain\nSideboard\n3 Abrade\n4 Duress\n4 Negate\n4 Shock');
eq('exactly fifteen is not flagged',
   deckLegality(ok15.cards, ok15.side).problems.filter(p => /15/.test(p.msg)).length, 0);

/* ------------------------------------------------------------------ */
group('describing a variant back to the user');
eq('reads as a sideboard plan',
   describeSwaps([{ out: 'Cut Down', in: 'Duress', qty: 2 }]), '−2 Cut Down, +2 Duress');
eq('one-sided swaps read correctly',
   describeSwaps([{ out: '', in: 'Duress', qty: 1 }]), '+1 Duress');
eq('empty rows are left out', describeSwaps([{ out: '', in: '', qty: 3 }]), '');
eq('zero-quantity rows are left out',
   describeSwaps([{ out: 'Cut Down', in: 'Duress', qty: 0 }]), '');
eq('nothing at all is the empty string', describeSwaps(null), '');

group('the parse cache');
/* render() asks for the same parse three times a keystroke, and once more per
   compare column. One entry is enough — but it has to notice when the DB moves,
   because a Scryfall lookup changes what identical text parses INTO. */
const CACHED = '4 Lightning Bolt\n20 Mountain\nSideboard\n2 Abrade';
DB = {};
const cold = parseDeckCached(CACHED);
chk('a repeat call returns the very same object', parseDeckCached(CACHED) === cold);
chk('different text does not', parseDeckCached(CACHED + '\n1 Shock') !== cold);
chk('and the old text is re-parsed after that', parseDeckCached(CACHED) !== cold);
const beforeDB = parseDeckCached(CACHED);
chk('before the lookup, the card is unresolved', beforeDB.cards[0].unknown === true);
DB = { 'lightning bolt': { land: false, produces: [], cmc: 1, cost: '{R}',
                           pips: { W:0,U:0,B:0,R:1,G:0 }, typeLine: 'Instant', subtypes: [] } };
const afterDB = parseDeckCached(CACHED);
chk('the same text re-parses once the DB changes', afterDB !== beforeDB);
chk('and the card resolves', !afterDB.cards[0].unknown);
DB = {};

group('basic lands are exempt from the copy limit');
chk('by name', isBasicLand({ name: 'Mountain' }));
chk('snow basics too', isBasicLand({ name: 'Snow-Covered Island' }));
chk('by type line', isBasicLand({ name: 'Wastes', typeLine: 'Basic Land' }));
chk('a shockland is not basic', !isBasicLand({ name: 'Blood Crypt', typeLine: 'Land — Swamp Mountain' }));

process.exit(report());
