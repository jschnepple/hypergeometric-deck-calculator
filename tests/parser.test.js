/* Decklist parsing. These formats all come from real exports (Moxfield,
   Archidekt, Arena), so the awkward ones — set codes, commas and apostrophes in
   card names, split cards — are the point, not edge cases. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing'], { COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {} });

group('decklist line formats');
const one = line => parseList(line).cards[0];
const cases = [
  ['plain',              '4 Lightning Bolt',                        4, 'Lightning Bolt'],
  ['x notation',         '4x Lightning Bolt',                       4, 'Lightning Bolt'],
  ['Moxfield set code',  '3 Sheoldred, the Apocalypse (DMU) 107',    3, 'Sheoldred, the Apocalypse'],
  ['apostrophe in name', "2 Brotherhood's End",                     2, "Brotherhood's End"],
  ['comma in name',      '4 Chandra, Dressed to Kill',              4, 'Chandra, Dressed to Kill'],
  ['leading whitespace', '   4    Mountain   ',                     4, 'Mountain'],
  ['split card',         '2 Blightstep Pathway // Searstep Pathway', 2, 'Blightstep Pathway // Searstep Pathway'],
];
for (const [label, line, qty, name] of cases) {
  const c = one(line);
  chk(`${label}: ${qty}x "${name}"`, c && c.qty === qty && c.name === name,
      c ? `got ${c.qty}x "${c.name}"` : 'parsed nothing');
}

group('inline annotations');
const ic = one('4 Homebrew Thing {1}{R}{R}');
chk('inline mana cost sets mana value', ic.cmc === 3, `cmc=${ic.cmc}`);
chk('inline mana cost sets pips', ic.pips.R === 2, `R=${ic.pips.R}`);
chk('inline cost is not flagged unknown', !ic.unknown);

const il = one('4 Mystery Land [land:RG]');
chk('inline land is a land', il.land === true);
eq('inline land produces both colours', il.produces, ['R', 'G']);

const cl = one('2 Weird Utility Land [land:C]');
chk('colourless land is still a land', cl.land === true);
eq('colourless land has no coloured sources', cl.produces, []);
eq('empty land tag also works', one('2 Thing [land:]').produces, []);

group('lines that should be ignored');
const junk = parseList([
  '// a comment', '# another comment', 'Sideboard', 'Deck', 'Maybeboard',
  '', '   ', 'random text with no quantity', '4 Mountain',
].join('\n'));
eq('only the real card survives', junk.cards.length, 1);
eq('and it parsed correctly', junk.cards[0].name, 'Mountain');

group('unknown cards');
const un = parseList('4 Totally Made Up Card');
eq('unknown card is still listed', un.cards.length, 1);
chk('unknown card is flagged', un.cards[0].unknown === true);
eq('unknown card reported for the UI', un.unknown, ['Totally Made Up Card']);
chk('unknown card contributes no mana value', un.cards[0].cmc === 0);

group('quantities');
eq('double-digit quantities', one('12 Forest').qty, 12);
eq('single copy', one('1 Sol Ring').qty, 1);

/* Both groups below are regressions from the first real decklist run through the
   tool (Barrel Boys, 2026-08-11). Each bug shifted a headline number: the ramp
   one moved the land recommendation by a whole land. */

group('entersTapped: only unconditional tapped lands count');
const TAPPED_CASES = [
  ['Meticulous Archive (surveil land)', 'This land enters tapped.\nWhen this land enters, surveil 1.', true],
  ['plain tapped land',                 'This land enters the battlefield tapped.',                     true],
  ['Hallowed Fountain (shock)',         "As this land enters, you may pay 2 life. If you don't, it enters tapped.", false],
  ['Sacred Foundry (shock)',            "As this land enters, you may pay 2 life. If you don't, it enters tapped.", false],
  ['Mistrise Village (conditional)',    'This land enters tapped unless you control a Mountain or a Forest.', true],
  ['fastland (conditional)',            'This land enters tapped unless you control two or fewer other lands.', true],
  ['Plains',                            '',                                                             false],
];
for (const [label, oracle, want] of TAPPED_CASES) {
  chk(`${label} -> ${want ? 'tapped' : 'untapped'}`, entersTapped(oracle) === want,
      `got ${entersTapped(oracle)}`);
}
chk('case is normalised', entersTapped('THIS LAND ENTERS TAPPED.') === true);

group('landFaces: classify off the front face');
const LF = [
  ['plain land',        {type_line:'Land'},                                                        true,  false],
  ['basic land',        {type_line:'Basic Land — Mountain'},                                       true,  false],
  ['shockland',         {type_line:'Land — Mountain Plains'},                                      true,  false],
  ['MDFC spell/land (Bala Ged Recovery)',
    {type_line:'Sorcery // Land', card_faces:[{type_line:'Sorcery'},{type_line:'Land'}]},          false, true],
  ['MDFC spell/land (Agadeem\'s Awakening)',
    {type_line:'Sorcery // Land', card_faces:[{type_line:'Sorcery'},{type_line:'Land'}]},          false, true],
  ['Pathway (land // land)',
    {type_line:'Land // Land', card_faces:[{type_line:'Land'},{type_line:'Land'}]},                true,  true],
  ['transform DFC creature',
    {type_line:'Creature — Human // Creature — Werewolf', card_faces:[{type_line:'Creature — Human'},{type_line:'Creature — Werewolf'}]}, false, false],
  ['plain spell',       {type_line:'Instant'},                                                     false, false],
  ['Landwalk-ish name is not a land', {type_line:'Enchantment — Aura'},                            false, false],
];
for (const [label, cd, wantLand, wantBack] of LF) {
  const r = landFaces(cd);
  chk(`${label}: land=${wantLand} backLand=${wantBack}`,
      r.isLand === wantLand && r.backLand === wantBack,
      `got land=${r.isLand} backLand=${r.backLand}`);
}

group('scryfallName: query the front face of split / double-faced cards');
eq('split card',   scryfallName('Fire // Ice'), 'Fire');
eq('modal DFC',    scryfallName('Bala Ged Recovery // Bala Ged Sanctuary'), 'Bala Ged Recovery');
eq('transform DFC',scryfallName('Fable of the Mirror-Breaker // Reflection of Kiki-Jiki'), 'Fable of the Mirror-Breaker');
eq('single-faced card is untouched', scryfallName('Lightning Bolt'), 'Lightning Bolt');
eq('name with no spaces around the slashes', scryfallName('Fire//Ice'), 'Fire');
eq('whitespace is trimmed', scryfallName('  Mountain  '), 'Mountain');
eq('empty input does not throw', scryfallName(''), '');

group('isRampDraw: lands are never cheap ramp/draw');
chk('Fabled Passage is not ramp/draw',
    isRampDraw('{T}, Sacrifice this land: Search your library for a basic land card…', 0, true) === false);
chk('Evolving Wilds is not ramp/draw',
    isRampDraw('{T}, Sacrifice this land: Search your library for a basic land card.', 0, true) === false);
chk('Cryogen Relic is ramp/draw',
    isRampDraw('When this artifact enters or leaves the battlefield, draw a card.', 2, false) === true);
chk('Rampant Growth is ramp/draw',
    isRampDraw('Search your library for a basic land card…', 2, false) === true);
chk('expensive draw spell does not count',
    isRampDraw('Draw a card.', 5, false) === false);
chk('a cheap spell that does neither does not count',
    isRampDraw('Deal 3 damage to any target.', 1, false) === false);

process.exit(report());
