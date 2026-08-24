/* The analysis layer, under test for the first time.

   It never was before, and the reason is worth recording: analyse() read its six
   inputs straight out of the DOM, so extract.js could not evaluate the ANALYSIS
   slice in node at all. Splitting the DOM contact out into readInputs() — one
   function, living in RENDER — is what made this file possible, and it is the
   same split that lets a sideboard variant be analysed by the identical code
   path with a different card list.

   These are not a re-test of the mana math; math.test.js and manabase.test.js
   own that. What is asserted here is that analyseCards is a pure function of its
   arguments, that analyse() feeds it the maindeck and only the maindeck, and
   that analyseVariant hands back either a real analysis or a clearly-marked
   broken one — never a plausible-looking analysis of a deck that does not
   exist. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard', 'analysis'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
  CNAME: { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' },
});

/* A small resolved card DB, so parseList produces real cards without a network. */
DB = {
  'lightning bolt':   { land: false, produces: [], cmc: 1, pips: { W:0,U:0,B:0,R:1,G:0 }, cost: '{R}', typeLine: 'Instant', subtypes: [] },
  'goblin guide':     { land: false, produces: [], cmc: 1, pips: { W:0,U:0,B:0,R:1,G:0 }, cost: '{R}', typeLine: 'Creature — Goblin Scout', subtypes: [] },
  'skewer the critics':{ land: false, produces: [], cmc: 2, pips: { W:0,U:0,B:0,R:1,G:0 }, cost: '{1}{R}', typeLine: 'Sorcery', subtypes: [] },
  'glorybringer':     { land: false, produces: [], cmc: 5, pips: { W:0,U:0,B:0,R:2,G:0 }, cost: '{3}{R}{R}', typeLine: 'Creature — Dragon', subtypes: [] },
  'negate':           { land: false, produces: [], cmc: 2, pips: { W:0,U:1,B:0,R:0,G:0 }, cost: '{1}{U}', typeLine: 'Instant', subtypes: [] },
  'abrade':           { land: false, produces: [], cmc: 2, pips: { W:0,U:0,B:0,R:1,G:0 }, cost: '{1}{R}', typeLine: 'Instant', subtypes: [] },
  'mountain':         { land: true, produces: ['R'], tapped: false, cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 }, typeLine: 'Basic Land — Mountain', subtypes: ['Mountain'] },
  'island':           { land: true, produces: ['U'], tapped: false, cmc: 0, pips: { W:0,U:0,B:0,R:0,G:0 }, typeLine: 'Basic Land — Island', subtypes: ['Island'] },
};

const OPTS = { N: 60, thr: 0.90, onPlay: true, rampN: 0, comp: 0 };
const LIST = `4 Goblin Guide
4 Lightning Bolt
4 Skewer the Critics
4 Glorybringer
20 Mountain

Sideboard
3 Abrade
2 Negate`;

/* ------------------------------------------------------------------ */
group('analyse() reads the maindeck, and only the maindeck');

let A = analyse(Object.assign({ text: LIST }, OPTS));
eq('deck total excludes the sideboard', A.total, 36);
eq('land count', A.landCount, 20);
chk('the sideboard is carried alongside, not inside', A.side.length === 2);
eq('sideboard size', A.side.reduce((s, c) => s + c.qty, 0), 5);
chk('no sideboard card reached the deck', !A.cards.some(c => c.name === 'Abrade'));
chk('legality came back with it', !!A.legality && A.legality.sideCount === 5);
eq('nothing is flagged on a legal list', A.legality.problems.length, 0);
eq('variant is null for the maindeck', A.variant, null);

group('a blue sideboard card does not create a blue requirement');
/* The clearest expression of the bug this fixes: Negate is in the sideboard, so
   game one has no blue requirement at all, and the old code produced one. */
eq('no blue sources needed', A.need.U, 0);
chk('red is required', A.need.R > 0);

/* ------------------------------------------------------------------ */
group('analyseCards is pure');

const cards = parseDeck(LIST).cards;
const a1 = analyseCards(cards, [], OPTS);
const a2 = analyseCards(cards, [], OPTS);
eq('same input, same land recommendation', a1.rec, a2.rec, 1e-12);
eq('same average mana value', a1.avgMV, a2.avgMV, 1e-12);
eq('same red sources', a1.sources.R, a2.sources.R, 1e-12);

group('assumptions arrive as arguments, not from a hidden global');
const onDraw = analyseCards(cards, [], Object.assign({}, OPTS, { onPlay: false }));
eq('on the play is recorded', a1.onPlay, true);
eq('on the draw is recorded', onDraw.onPlay, false);
const ramped = analyseCards(cards, [], Object.assign({}, OPTS, { rampN: 8 }));
chk('cheap ramp lowers the recommendation', ramped.rec < a1.rec);
eq('by Karsten’s coefficient, exactly', a1.rec - ramped.rec, 0.28 * 8, 1e-9);
const comp = analyseCards(cards, [], Object.assign({}, OPTS, { comp: 1 }));
eq('a companion raises it', comp.rec - a1.rec, 0.27, 1e-9);
const forty = analyseCards(cards, [], Object.assign({}, OPTS, { N: 40 }));
eq('deck size scales it', forty.rec, a1.rec * 40 / 60, 1e-9);

group('missing options fall back rather than producing NaN');
const bare = analyseCards(cards, [], {});
chk('deck size defaults to 60', bare.N === 60);
chk('recommendation is a real number', isFinite(bare.rec));
chk('threshold defaults to 90%', Math.abs(bare.thr - 0.90) < 1e-9);
const noOpts = analyseCards([], [], undefined);
eq('an empty deck analyses to nothing', noOpts.total, 0);
chk('…without throwing or producing NaN', isFinite(noOpts.avgMV) && isFinite(noOpts.rec));

/* ------------------------------------------------------------------ */
group('analyseVariant runs the same analysis on a swapped deck');

const V = { id: 1, name: 'vs Control', swaps: [{ out: 'Goblin Guide', in: 'Negate', qty: 2 }] };
const AV = analyseVariant(Object.assign({ text: LIST }, OPTS), V);
chk('not broken', !AV.broken);
eq('deck size is preserved', AV.total, A.total);
eq('the variant is attached', AV.variant.name, 'vs Control');
chk('blue is now required', AV.need.U > 0);
eq('…and the deck has no blue sources', AV.sources.U, 0);
chk('the curve moved', AV.avgMV !== A.avgMV);

group('the baseline is untouched by analysing a variant');
const after = analyse(Object.assign({ text: LIST }, OPTS));
eq('maindeck total still 36', after.total, 36);
eq('maindeck still needs no blue', after.need.U, 0);
eq('maindeck red sources unchanged', after.sources.R, A.sources.R, 1e-12);

group('a broken variant returns a marked stub, not numbers');
const bad = analyseVariant(Object.assign({ text: LIST }, OPTS),
                           { id: 2, name: 'broken', swaps: [{ out: 'Sheoldred', in: 'Negate', qty: 2 }] });
chk('marked broken', bad.broken === true);
chk('the errors are carried', bad.errors.length > 0);
eq('it analyses as empty rather than as a half-swapped deck', bad.total, 0);
chk('every field a panel reads still exists',
    bad.curve !== undefined && bad.sources !== undefined && bad.drivers !== undefined &&
    bad.need !== undefined && isFinite(bad.rec));
chk('the sideboard is still reported', bad.side.length === 2);

group('a variant with no swaps is the maindeck');
const same = analyseVariant(Object.assign({ text: LIST }, OPTS), { id: 3, name: 'empty', swaps: [] });
eq('same total', same.total, A.total);
eq('same land count', same.landCount, A.landCount);
eq('same average mana value', same.avgMV, A.avgMV, 1e-12);

/* ------------------------------------------------------------------ */
group('unresolved cards are counted against the deck being analysed');
/* The subtle one. analyseVariant cannot reuse the maindeck's unresolved list:
   validateDeck refuses to simulate a list with unresolved cards precisely
   because they behave as colourless 0-drops, and reading the wrong list gets it
   wrong in both directions. */
const MYSTERY = `4 Goblin Guide
4 Lightning Bolt
4 Skewer the Critics
4 Glorybringer
20 Mountain

Sideboard
3 Some Card Scryfall Has Never Heard Of
2 Negate`;

const clean = analyse(Object.assign({ text: MYSTERY }, OPTS));
eq('the maindeck resolves cleanly', clean.unknown.length, 0);

const boardedIn = analyseVariant(Object.assign({ text: MYSTERY }, OPTS),
  { id: 5, name: 'brings in a mystery', swaps: [{ out: 'Goblin Guide', in: 'Some Card Scryfall Has Never Heard Of', qty: 3 }] });
chk('boarding in an unresolved card puts it in the deck',
    boardedIn.cards.some(c => c.unknown));
eq('…and the variant reports it as unresolved', boardedIn.unknown.length, 1);
eq('by name', boardedIn.unknown[0], 'Some Card Scryfall Has Never Heard Of');

const UNRESOLVED_MAIN = `4 Goblin Guide
4 Another Card That Does Not Exist
4 Skewer the Critics
4 Glorybringer
20 Mountain

Sideboard
4 Negate`;
const withBad = analyse(Object.assign({ text: UNRESOLVED_MAIN }, OPTS));
eq('the maindeck reports its own unresolved card', withBad.unknown.length, 1);
const boardedOut = analyseVariant(Object.assign({ text: UNRESOLVED_MAIN }, OPTS),
  { id: 6, name: 'boards it out', swaps: [{ out: 'Another Card That Does Not Exist', in: 'Negate', qty: 4 }] });
eq('boarding every copy out clears the unresolved list', boardedOut.unknown.length, 0);
chk('and the card really is gone', !boardedOut.cards.some(c => c.name === 'Another Card That Does Not Exist'));

group('an unbalanced variant is analysed, and says so');
const big = analyseVariant(Object.assign({ text: LIST }, OPTS),
                           { id: 4, name: 'plus two', swaps: [{ out: '', in: 'Abrade', qty: 2 }] });
chk('not broken', !big.broken);
eq('the deck really is bigger', big.total, 38);
eq('the net is reported', big.swapNet, 2);
chk('and warned about', big.problems.some(p => p.level === 'warn'));

process.exit(report());
