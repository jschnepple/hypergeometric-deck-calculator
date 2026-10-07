/* Two things that were silently wrong at once, both found by one real decklist
   (a 60-card Izzet brew, session seven).

   1. LAND DETECTION. The list said "5 islands" and "3 spyrebluff canal". Neither
      resolves on the two tiers that may touch a deck on their own — the
      collection endpoint wants "Island", and `!"islands"` matches nothing — so
      both fell through to the fuzzy tier, which is a SUGGESTION and is never
      applied automatically. That part is correct and stays. What was not correct
      is what happened next: parseList gives an unresolved card land:false and
      mana value 0, and analyseCards partitioned on `land` alone, so eight lands
      became eight colourless nonland 0-drops. The page reported 12 lands in a
      20-land deck, 48 spells, an average mana value of 1.33 instead of 1.60, and
      a land recommendation computed from that average — while the panel above it
      said the unresolved cards were "excluded from every calculation".

      Two fixes, deliberately separate: a pluralised basic is resolved
      DETERMINISTICALLY (it is not a guess), and an unresolved card is now in
      neither partition rather than in the spell one.

   2. TWO-FACED CARDS. The deck ran Callous Sell-Sword // Burn Together purely as
      a red removal spell. Scryfall's top-level mana_cost for an Adventure is the
      two costs concatenated — "{1}{B} // {R}" — so parseCost summed them and the
      colour table demanded thirteen BLACK sources from a deck playing no black
      at all. Faces are now measured one at a time, and a deck can say which half
      it actually casts.

   Oracle payloads below are trimmed from the live Scryfall API. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'analysis'], { COLORS: ['W','U','B','R','G'], DB: {} });

/* ------------------------------------------------------- basic land aliasing */

group('basicAlias: plurals are deterministic, not guesses');

eq('islands',            basicAlias('islands'),            'Island');
eq('Mountains',          basicAlias('Mountains'),          'Mountain');
eq('forests',            basicAlias('forests'),            'Forest');
eq('swamps',             basicAlias('swamps'),             'Swamp');
eq('plains stays plains',basicAlias('plains'),             'Plains');
eq('wastes',             basicAlias('wastes'),             'Wastes');
eq('snow-covered plural',basicAlias('Snow-Covered Islands'),'Snow-Covered Island');

group('basicAlias: everything else is left alone');

// The singular already resolves by exact match; aliasing it would be noise.
eq('singular Island',    basicAlias('Island'),   null);
// A real card that merely ends in s must never be rewritten to a basic.
eq('Ponder',             basicAlias('Ponder'),   null);
eq('Spirebluff Canal',   basicAlias('Spirebluff Canal'), null);
// A misspelling is a GUESS and belongs in the suggestion tier, not here.
eq('spyrebluff canal',   basicAlias('spyrebluff canal'), null);
eq('empty',              basicAlias(''),         null);

group('dbLookup: the plural finds the record the singular filed');

const ISLAND = { object:'card', oracle_id:'isl', name:'Island', layout:'normal',
  type_line:'Basic Land — Island', oracle_text:'({T}: Add {U}.)',
  produced_mana:['U'], cmc:0, mana_cost:'' };

DB = {}; indexCard(DB, ISLAND);
chk('exact singular resolves',       !!dbLookup('Island'));
chk('the plural resolves too',       !!dbLookup('islands'));
chk('…to the SAME record',           dbLookup('islands') === dbLookup('Island'));
chk('…and it is a land',             dbLookup('islands').land === true);
eq ('…producing blue',               dbLookup('islands').produces, ['U']);
chk('an unrelated name still misses', dbLookup('Isolated Chapel') === null);

/* The new tier sits BELOW the existing two and may never reorder them.

   A folded COLLISION is a refusal, and the check for it is `fk in idx` rather
   than a truthiness test precisely so the stored null is read as "refused" and
   not as "missing, try the next tier". Getting that backwards would answer a
   contested key with a guess after all. */
group('dbLookup: the new tier never jumps the queue');
DB = {};
indexCard(DB, { oracle_id:'a', name:'Dáin’s Company', type_line:'Sorcery', cmc:2, mana_cost:'{1}{G}' });
indexCard(DB, { oracle_id:'b', name:"Dain's Company",  type_line:'Sorcery', cmc:2, mana_cost:'{1}{W}' });
// Neither spelling is an exact key, so this goes to the fold — and is refused.
chk('two cards folding together are still refused',
    dbLookup("Dáin's Company") === null);
// An exact match must win, even when the name looks like a pluralised basic.
DB = {};
const NOT_A_BASIC = { oracle_id:'nab', name:'islands', type_line:'Sorcery',
                      cmc:3, mana_cost:'{2}{U}' };
indexCard(DB, ISLAND); indexCard(DB, NOT_A_BASIC);
chk('an exact "islands" key beats the basic alias',
    dbLookup('islands').land === false);

/* ------------------------------------------- unresolved cards are not spells */

group('analyseCards: an unresolved card is in neither column');

const A_UNK = analyseCards([
  { name:'Island',  qty:8, land:true,  produces:['U'], tapped:false, cmc:0,
    pips:{W:0,U:0,B:0,R:0,G:0}, subtypes:['Island'], typeLine:'Basic Land — Island' },
  { name:'Opt',     qty:4, land:false, produces:[], cmc:1, pips:{W:0,U:1,B:0,R:0,G:0} },
  { name:'blah',    qty:3, unknown:true, land:false, produces:[], cmc:0,
    pips:{W:0,U:0,B:0,R:0,G:0} }
], ['blah'], { N:15, thr:0.90, onPlay:true });

eq('total counts them — they fill slots', A_UNK.total, 15);
eq('lands',                              A_UNK.landCount, 8);
eq('spells EXCLUDE them',                A_UNK.spellCount, 4);
eq('and they are reported',              A_UNK.unknownCount, 3);
eq('the three columns account for every card',
   A_UNK.landCount + A_UNK.spellCount + A_UNK.unknownCount, A_UNK.total);
// The bug's fingerprint: three phantom cards in the 0 bucket.
eq('nothing lands in the 0 column',      A_UNK.curve[0] || 0, 0);
eq('average mana value is over the KNOWN spells', A_UNK.avgMV, 1, 1e-9);

/* --------------------------------------------------------- castable faces */

const SELLSWORD = {
  object:'card', oracle_id:'css', name:'Callous Sell-Sword // Burn Together',
  layout:'adventure', mana_cost:'{1}{B} // {R}', cmc:2,
  type_line:'Creature — Human Soldier // Sorcery — Adventure',
  card_faces:[
    { name:'Callous Sell-Sword', mana_cost:'{1}{B}', type_line:'Creature — Human Soldier',
      oracle_text:'This creature enters with a +1/+1 counter on it for each creature that died under your control this turn.' },
    { name:'Burn Together', mana_cost:'{R}', type_line:'Sorcery — Adventure',
      oracle_text:'Target creature you control deals damage equal to its power to any other target. Then sacrifice it.' }
  ]
};

const FIREICE = {
  object:'card', oracle_id:'fi', name:'Fire // Ice', layout:'split',
  mana_cost:'{1}{R} // {1}{U}', cmc:4, type_line:'Instant // Instant',
  card_faces:[
    { name:'Fire', mana_cost:'{1}{R}', type_line:'Instant' },
    { name:'Ice',  mana_cost:'{1}{U}', type_line:'Instant' }
  ]
};

/* A transform card's back face is not cast, and an MDFC land is already modelled
   by mdfcLand and the Karsten MDFC term. Neither may become a face choice. */
const BALA = {
  object:'card', oracle_id:'bala', name:'Bala Ged Recovery // Bala Ged Sanctuary',
  layout:'modal_dfc', cmc:3, type_line:'Sorcery // Land',
  card_faces:[
    { name:'Bala Ged Recovery',  mana_cost:'{2}{G}', type_line:'Sorcery' },
    { name:'Bala Ged Sanctuary', mana_cost:'',       type_line:'Land',
      oracle_text:'As this land enters, you may pay 3 life. If you don’t, it enters tapped.' }
  ]
};

const WEREWOLF = {
  object:'card', oracle_id:'ww', name:'Kessig Prowler // Sinuous Predator',
  layout:'transform', cmc:1, mana_cost:'{G}', type_line:'Creature — Human Werewolf // Creature — Werewolf',
  card_faces:[
    { name:'Kessig Prowler',   mana_cost:'{G}', type_line:'Creature — Human Werewolf' },
    { name:'Sinuous Predator', mana_cost:'',    type_line:'Creature — Werewolf' }
  ]
};

group('castableFaces: only where both halves are really cast');

const f = castableFaces(SELLSWORD, false);
chk('an Adventure has two faces', !!f && f.length === 2);
eq ('front is the creature',      f[0].name, 'Callous Sell-Sword');
eq ('…at {1}{B}',                 f[0].cost, '{1}{B}');
eq ('…mana value 2',              f[0].cmc, 2);
eq ('back is the Adventure',      f[1].name, 'Burn Together');
eq ('…mana value 1',              f[1].cmc, 1);
eq ('…demanding only red',        f[1].pips, {W:0,U:0,B:0,R:1,G:0});

chk('a split card qualifies',           !!castableFaces(FIREICE, false));
chk('a transform card does NOT',        castableFaces(WEREWOLF, false) === null);
chk('an MDFC land does NOT',            castableFaces(BALA, true) === null);
chk('…even asked without the flag, its back has no cost',
    castableFaces(BALA, false) === null);

group('cardRecord: the summed cost is no longer the whole story');

const rec = cardRecord(SELLSWORD);
// Scryfall's own cmc for an Adventure is already the front face's, and is kept.
eq ('record mana value',      rec.cmc, 2);
eq ('record type line is the FRONT face', rec.typeLine, 'Creature — Human Soldier');
chk('record carries faces',   !!rec.faces && rec.faces.length === 2);
eq ('record layout',          rec.layout, 'adventure');
// The bug, preserved as the reason the faces exist: read as ONE spell, the
// concatenated cost asks for black AND red at once.
eq ('the summed reading demands both colours',
    parseCost(SELLSWORD.mana_cost).pips, {W:0,U:0,B:1,R:1,G:0});

/* ------------------------------------------------------------- face intent */

group('faceMode: the vocabulary a player would actually type');

eq('no tag is both',    faceMode(undefined),    'both');
eq('main',              faceMode('main'),       'main');
eq('front',             faceMode('front'),      'main');
eq('adventure',         faceMode('adventure'),  'alt');
eq('adv',               faceMode('adv'),        'alt');
eq('alt',               faceMode('alt'),        'alt');
eq('2',                 faceMode('2'),          'alt');
eq('BOTH, shouting',    faceMode('BOTH'),       'both');
// A tag nobody recognises must not silently pick a half.
eq('nonsense falls back to both', faceMode('sideways'), 'both');

group('parseEntry: the tag comes off the line, in either order');

eq('tag alone',       parseEntry('2 Callous Sell-Sword [face:adventure]').faceTag, 'adventure');
eq('…name is clean',  parseEntry('2 Callous Sell-Sword [face:adventure]').name, 'Callous Sell-Sword');
eq('…quantity kept',  parseEntry('2 Callous Sell-Sword [face:adventure]').qty, 2);
// The inline-cost regex anchors to the end of the line, so a trailing face tag
// used to hide it. Both orders must work.
eq('cost then face',  parseEntry('4 Some Card {1}{R} [face:main]').costTag, '{1}{R}');
eq('face then cost',  parseEntry('4 Some Card [face:main] {1}{R}').costTag, '{1}{R}');
eq('face then cost, name', parseEntry('4 Some Card [face:main] {1}{R}').name, 'Some Card');
eq('no tag',          parseEntry('4 Lightning Bolt').faceTag, null);

group('applyFace: the unchosen half leaves every calculation');

DB = {}; indexCard(DB, SELLSWORD); indexCard(DB, FIREICE);

const pick = (line) => parseList(line).cards[0];

const both = pick('2 Callous Sell-Sword');
eq ('default is both',            both.faceMode, 'both');
eq ('…curve uses the front face', both.cmc, 2);
eq ('…and the front face pips',   both.pips, {W:0,U:0,B:1,R:0,G:0});
eq ('…but BOTH faces are measured', faceViews(both).length, 2);

const adv = pick('2 Callous Sell-Sword [face:adventure]');
eq ('adventure-only mode',        adv.faceMode, 'alt');
eq ('…mana value is the Adventure’s', adv.cmc, 1);
eq ('…cost is the Adventure’s',       adv.cost, '{R}');
eq ('…black is gone entirely',    adv.pips, {W:0,U:0,B:0,R:1,G:0});
eq ('…type line follows the face', adv.typeLine, 'Sorcery — Adventure');
eq ('…and only one face is measured', faceViews(adv).length, 1);
eq ('…named as the face, not the card', faceViews(adv)[0].label, 'Burn Together');

const main = pick('2 Callous Sell-Sword [face:main]');
eq ('creature-only mode',         main.faceMode, 'main');
eq ('…mana value 2',              main.cmc, 2);
eq ('…red is gone',               main.pips, {W:0,U:0,B:1,R:0,G:0});
eq ('…one face measured',         faceViews(main).length, 1);

// A split card reads as the CHEAPER half by default, not the sum of both.
const fire = pick('4 Fire // Ice');
eq ('split default mana value is the left half, not 4', fire.cmc, 2);
// The old reading was {1}{R}{1}{U} at mana value 4 — a spell needing both
// colours at once, which no split card has ever asked for.
eq ('…demanding one colour, not two',                   fire.pips, {W:0,U:0,B:0,R:1,G:0});
eq ('…while still measuring the other half',            faceViews(fire).length, 2);
eq ('…which asks for blue',                             faceViews(fire)[1].pips, {W:0,U:1,B:0,R:0,G:0});

group('faceViews: an ordinary card is unchanged');

const bolt = { name:'Lightning Bolt', qty:4, cmc:1, cost:'{R}',
               pips:{W:0,U:0,B:0,R:1,G:0}, typeLine:'Instant' };
eq('one view',            faceViews(bolt).length, 1);
eq('…labelled by name',   faceViews(bolt)[0].label, 'Lightning Bolt');
eq('…carrying its pips',  faceViews(bolt)[0].pips, {W:0,U:0,B:0,R:1,G:0});

/* -------------------------------------- the requirement the bug produced */

group('analyseCards: the colour a deck does not play');

const MOUNTAIN = { name:'Mountain', qty:12, land:true, produces:['R'], tapped:false,
                   cmc:0, pips:{W:0,U:0,B:0,R:0,G:0}, subtypes:['Mountain'],
                   typeLine:'Basic Land — Mountain' };

const withBoth = analyseCards([MOUNTAIN, Object.assign({}, both, {qty:4})], [],
                              { N:60, thr:0.90, onPlay:true });
chk('running both halves DOES need black', withBoth.need.B > 0);
eq ('…and names the face asking for it',   withBoth.needFrom.B, 'Callous Sell-Sword');

const withAdv = analyseCards([MOUNTAIN, Object.assign({}, adv, {qty:4})], [],
                             { N:60, thr:0.90, onPlay:true });
eq ('adventure-only needs NO black',       withAdv.need.B, 0);
chk('…and still needs red',                withAdv.need.R > 0);
eq ('…named as the Adventure',             withAdv.needFrom.R, 'Burn Together');
chk('…with no black driver left in the table',
    withAdv.drivers.every(d => d.col !== 'B'));

/* ------------------------------------------------------- writing the tag */

group('setFaceInList: the decklist text is the single source of truth');

const LIST = "4 Opt\n2 Callous Sell-Sword\n12 Mountain";

eq('adds the tag',
   setFaceInList(LIST, 'Callous Sell-Sword', 'adventure'),
   "4 Opt\n2 Callous Sell-Sword [face:adventure]\n12 Mountain");

eq('replaces an existing tag rather than stacking',
   setFaceInList("2 Callous Sell-Sword [face:main]", 'Callous Sell-Sword', 'adventure'),
   "2 Callous Sell-Sword [face:adventure]");

eq('both removes the tag',
   setFaceInList("2 Callous Sell-Sword [face:adventure]", 'Callous Sell-Sword', 'both'),
   "2 Callous Sell-Sword");

eq('other lines are untouched',
   setFaceInList(LIST, 'Callous Sell-Sword', 'both'), LIST);

// An inline cost must survive having a face tag written next to it.
eq('an inline cost survives',
   setFaceInList("4 Some Card {1}{R}", 'Some Card', 'main'),
   "4 Some Card {1}{R} [face:main]");

eq('a name that is not in the list changes nothing',
   setFaceInList(LIST, 'Brazen Borrower', 'main'), LIST);

process.exit(report());
