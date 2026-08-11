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

process.exit(report());
