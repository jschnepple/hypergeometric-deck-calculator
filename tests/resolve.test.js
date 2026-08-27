/* Getting a typed card name to a Scryfall record.

   Three real failures drove this file, all reported against one decklist, and
   two of them turned out to have nothing to do with the cause anyone assumed.

   1. DIACRITICS. "Dain's Company" and "Kili the Resourceful" were reported as
      unrecognised. Scryfall's collection endpoint resolves both perfectly — it
      folds accents itself, verified against the live API. The tool lost them
      AFTER a successful lookup, because `lookup` filed the record under the
      canonical accented name and `parseList` asked for the name that had been
      typed. A seam, in the family of the eight from session five: two functions
      each individually correct, disagreeing about a key.

   2. ARENA RENAMES. "Giantcraft Helm" is genuinely not an oracle name. It is
      `printed_name` on Through the Omenpaths #167, whose `name` is "Doc Ock's
      Tentacles" — a field the tool had never read. 138 of the first 175 cards
      in that set are renamed the same way, so this is a whole Arena set, not a
      card.

   3. Everything below the fold. The unresolved panel was correct and easy to
      miss, which is a bad combination for a warning that understates every
      figure on the page.

   The fixtures here are the REAL API payloads, trimmed. They were fetched from
   api.scryfall.com during the session that wrote this file rather than typed
   from memory, which is the house rule that nine of the first eleven bugs in
   this project came from breaking. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing', 'sideboard'], {
  COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {},
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
});

/* ---------- real Scryfall payloads, trimmed ---------- */

/* api.scryfall.com/cards/om1/167 — note `name` and `printed_name` differ, on an
   English card. The Arena set prints Universes Beyond cards under other names. */
const DOC_OCK = {
  name: "Doc Ock's Tentacles", printed_name: 'Giantcraft Helm', lang: 'en',
  mana_cost: '{1}', cmc: 1.0, type_line: 'Artifact — Equipment',
  oracle_text: 'Whenever a creature you control with mana value 5 or greater enters, you may attach this Equipment to it.\nEquipped creature gets +4/+4.\nEquip {5}',
  set: 'om1', digital: true,
};
const DAIN = {
  name: "Dáin's Company", lang: 'en', mana_cost: '{2}{G}', cmc: 3.0,
  type_line: 'Sorcery', oracle_text: 'Search your library for a creature card.', set: 'hob',
};
const KILI = {
  name: 'Kíli the Resourceful', lang: 'en', mana_cost: '{1}{G}', cmc: 2.0,
  type_line: 'Legendary Creature — Dwarf Scout', oracle_text: '', set: 'hob',
};
const MOUNTAIN = {
  name: 'Mountain', lang: 'en', mana_cost: '', cmc: 0.0,
  type_line: 'Basic Land — Mountain', oracle_text: '({T}: Add {R}.)',
  produced_mana: ['R'], set: 'blb',
};

const freshDB = (...cards) => { DB = {}; cards.forEach(c => indexCard(DB, c)); return DB; };

/* ============================================================
   FOLDING
   ============================================================ */
group('foldKey survives how people actually type a card name');

eq('an acute accent folds', foldKey("Dáin's Company"), "dain's company");
eq('so does an i-acute', foldKey('Kíli the Resourceful'), 'kili the resourceful');
eq('and an umlaut', foldKey('Jötun Grunt'), 'jotun grunt');
eq('a curly apostrophe folds to a straight one', foldKey('Dain’s Company'), "dain's company");
eq('an em dash folds to a hyphen', foldKey('Ratchet—Bomb'), 'ratchet-bomb');
eq('a ligature folds, because NFD will not decompose it', foldKey('Æther Vial'), 'aether vial');
eq('and the unligatured spelling folds to the same key', foldKey('Aether Vial'), 'aether vial');
eq('whitespace is collapsed', foldKey('  Lightning   Bolt '), 'lightning bolt');
eq('case is folded', foldKey('LIGHTNING BOLT'), 'lightning bolt');
eq('an already-plain name is unchanged', foldKey('Lightning Bolt'), 'lightning bolt');
eq('empty is empty', foldKey(''), '');
eq('null is empty', foldKey(null), '');

/* ============================================================
   THE BUG THAT STARTED THIS
   ============================================================ */
group('a card Scryfall resolved is not lost on the way into the DB');

{
  freshDB(DAIN, KILI);

  /* The exact reproduction. Scryfall returns "Dáin's Company"; the decklist
     says "Dain's Company"; before the fold index those never met. */
  const d = parseDeck("4 Dain's Company\n4 Kili the Resourceful");
  eq('nothing is unresolved', d.unknown, []);
  eq("Dain's Company resolves", d.cards[0].cmc, 3);
  eq('Kili the Resourceful resolves', d.cards[1].cmc, 2);
  eq('and carries its type line', d.cards[1].typeLine, 'Legendary Creature — Dwarf Scout');

  const exact = parseDeck("4 Dáin's Company");
  eq('the accented spelling still resolves', exact.unknown, []);
  chk('and to the same record', dbLookup("Dain's Company") === dbLookup("Dáin's Company"));

  eq('a curly apostrophe resolves too', parseDeck("4 Dain’s Company").unknown, []);
  eq('and so does sloppy spacing', parseDeck("4  Dain's   Company").unknown, []);
}

group('the fold only ever rescues a miss');

{
  freshDB(DAIN, MOUNTAIN);
  chk('an exact key is preferred', dbLookup('Mountain') === DB['mountain']);
  eq('a name that matches nothing is still null', dbLookup('Not A Card'), null);
  eq('an empty name is null', dbLookup(''), null);
}

group('two different cards folding together are refused, not guessed');

{
  /* The risk the fold introduces: if two real cards fold to one key, resolving
     to whichever was indexed last would be a confident wrong answer about a
     card the user did name correctly. The slot is emptied instead, and both
     still resolve by their exact spellings. */
  const A = { name: 'Fóo', lang: 'en', mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '' };
  const B = { name: 'Fòo', lang: 'en', mana_cost: '{G}', cmc: 5, type_line: 'Sorcery', oracle_text: '' };
  freshDB(A, B);
  eq('the ambiguous folded key resolves to nothing', dbLookup('Foo'), null);
  eq('but the first spelling still works', dbLookup('Fóo').cmc, 1);
  eq('and so does the second', dbLookup('Fòo').cmc, 5);
}

/* ============================================================
   PRINTED NAMES
   ============================================================ */
group('printed_name is a name the card answers to');

{
  freshDB(DOC_OCK);
  eq('the oracle name resolves', dbLookup("Doc Ock's Tentacles").cmc, 1);
  eq('the Arena printed name resolves to the same card',
     dbLookup('Giantcraft Helm'), dbLookup("Doc Ock's Tentacles"));
  eq('and it is the same record object, not a copy',
     dbLookup('Giantcraft Helm') === dbLookup("Doc Ock's Tentacles"), true);
  eq('the type line comes through', dbLookup('Giantcraft Helm').typeLine, 'Artifact — Equipment');

  const d = parseDeck('4 Giantcraft Helm');
  eq('so an Arena decklist resolves', d.unknown, []);
  eq('with the right mana value', d.cards[0].cmc, 1);

  eq('cardKeys lists both names',
     cardKeys(DOC_OCK).sort(), ["doc ock's tentacles", 'giantcraft helm']);
  eq('a card without a printed name lists one', cardKeys(MOUNTAIN), ['mountain']);
}

{
  /* Both faces of a DFC, and both faces' printed names, are keys. */
  const dfc = {
    name: 'Front // Back', printed_name: 'Vorne // Hinten', lang: 'de',
    type_line: 'Creature — Human // Land', cmc: 2,
    card_faces: [
      { name: 'Front', printed_name: 'Vorne', mana_cost: '{1}{G}', type_line: 'Creature — Human', oracle_text: '' },
      { name: 'Back', printed_name: 'Hinten', mana_cost: '', type_line: 'Land', oracle_text: '{T}: Add {G}.' },
    ],
  };
  const keys = cardKeys(dfc);
  chk('every face name is a key', keys.includes('front') && keys.includes('back'));
  chk('every printed face name is a key', keys.includes('vorne') && keys.includes('hinten'));
  chk('and the combined names too', keys.includes('front // back') && keys.includes('vorne // hinten'));
  eq('keys are unique', keys.length, new Set(keys).size);
}

/* ============================================================
   CARD RECORDS
   ============================================================
   This logic used to live inside lookup(), in the SCRYFALL section, which
   extract.js cannot reach because it touches the network — so none of it had
   ever been tested, including the front-face type line rule that three separate
   bugs have turned on. */
group('cardRecord, now that it can be reached at all');

{
  const r = cardRecord(DOC_OCK);
  eq('mana value', r.cmc, 1);
  eq('cost', r.cost, '{1}');
  eq('type line', r.typeLine, 'Artifact — Equipment');
  eq('subtypes come from after the dash', r.subtypes, ['Equipment']);
  eq('not a land', r.land, false);
  eq('not an MDFC land', r.mdfcLand, false);
  eq('no verge', r.verge, null);
  eq('no fetch', r.fetch, null);
}
{
  const r = cardRecord(MOUNTAIN);
  eq('a basic is a land', r.land, true);
  eq('producing its colour', r.produces, ['R']);
  eq('untapped', r.tapped, false);
  eq('with its subtype', r.subtypes, ['Mountain']);
}
{
  /* The rule three bugs have turned on: the type line is the FRONT face, never
     Scryfall's combined one. "Sorcery // Land" would read as both. */
  const split = {
    name: 'Spell // Terrain', lang: 'en', type_line: 'Sorcery // Land', cmc: 2,
    card_faces: [
      { name: 'Spell', mana_cost: '{1}{R}', type_line: 'Sorcery', oracle_text: 'Deal 3 damage.' },
      { name: 'Terrain', mana_cost: '', type_line: 'Land', oracle_text: 'Terrain enters tapped.' },
    ],
  };
  const r = cardRecord(split);
  eq('the type line is the front face only', r.typeLine, 'Sorcery');
  chk('so it does not read as a land', !/Land/.test(r.typeLine));
}

/* ============================================================
   REWRITING A LINE
   ============================================================ */
group('renameInList changes the name and nothing else');

eq('a plain line', renameInList('4 Lightnig Bolt', 'Lightnig Bolt', 'Lightning Bolt'),
   '4 Lightning Bolt');
eq('the quantity survives', renameInList('12 Foo', 'Foo', 'Bar'), '12 Bar');
eq('an inline cost tag survives',
   renameInList('4 Foo {1}{R}', 'Foo', 'Bar'), '4 Bar {1}{R}');
eq('an inline land tag survives',
   renameInList('4 Foo [land:RG]', 'Foo', 'Bar'), '4 Bar [land:RG]');
eq('a set code survives',
   renameInList('4 Foo (NEO) 123', 'Foo', 'Bar'), '4 Bar (NEO) 123');
eq('every copy of the line is rewritten',
   renameInList('4 Foo\n2 Baz\n1 Foo', 'Foo', 'Bar'), '4 Bar\n2 Baz\n1 Bar');
eq('other cards are untouched',
   renameInList('4 Foolish Thing\n4 Foo', 'Foo', 'Bar'), '4 Foolish Thing\n4 Bar');
eq('it matches through a fold',
   renameInList("4 Dain's Company", "Dáin's Company", 'X'), '4 X');
eq('comments and headers are untouched',
   renameInList('// Foo\nSideboard\n4 Foo', 'Foo', 'Bar'), '// Foo\nSideboard\n4 Bar');
eq('leading whitespace is preserved',
   renameInList('   4 Foo', 'Foo', 'Bar'), '   4 Bar');
eq('an empty replacement is refused', renameInList('4 Foo', 'Foo', ''), '4 Foo');
eq('an empty source is refused', renameInList('4 Foo', '', 'Bar'), '4 Foo');
eq('a name that is not there changes nothing',
   renameInList('4 Foo', 'Nope', 'Bar'), '4 Foo');

{
  /* The seam this shares its extraction with: whatever parseList calls the
     name is exactly the span renameInList replaces. Two opinions about where a
     name ends would rewrite a line the parser then read differently. */
  const line = '4 Foo (NEO) 123';
  eq('parseEntry and renameInList agree on the name', parseEntry(line).name, 'Foo');
  eq('and the rewrite round-trips',
     parseEntry(renameInList(line, 'Foo', 'Bar')).name, 'Bar');
}

/* ============================================================
   THE DIALOG
   ============================================================ */
group('the resolution dialog says which of four things happened');

const LEAK = /\bundefined\b|\bNaN\b|\[object/;
const sweep = (label, html) => chk(label, !LEAK.test(html),
  (html.match(/.{0,60}(undefined|NaN|\[object).{0,60}/) || [''])[0]);

const emptyReport = () => ({ renamed: [], suggested: [], ambiguous: [], missing: [] });

{
  chk('nothing to report is a no-op', resolveNoop(emptyReport()));
  chk('a null report is a no-op', resolveNoop(null));
  eq('and builds no markup', resolveDialogHTML(emptyReport()), '');
  chk('anything at all is not a no-op',
      !resolveNoop(Object.assign(emptyReport(), { missing: ['x'] })));
}
{
  const r = Object.assign(emptyReport(), {
    renamed: [{ typed: 'Giantcraft Helm', actual: "Doc Ock's Tentacles", set: 'OM1' }],
  });
  const html = resolveDialogHTML(r);
  sweep('a rename leaks nothing', html);
  chk('it names both spellings', html.includes('Giantcraft Helm') && html.includes('Doc Ock'));
  chk('it says the card is already counted', /already counted/.test(html));
  chk('and that the list was not touched', /list is unchanged/.test(html));
  chk('it offers no button, because there is nothing to accept', !/rfix/.test(html));
}
{
  const r = Object.assign(emptyReport(), {
    suggested: [{ typed: 'Lightnig Bolt', guess: 'Lightning Bolt', set: 'M11' }],
  });
  const html = resolveDialogHTML(r);
  sweep('a suggestion leaks nothing', html);
  chk('it is explicit that nothing was applied', /not<\/b> been applied|has <b>not<\/b>/.test(html));
  chk('it carries an accept button', /class="rfix"/.test(html));
  chk('with both names on it',
      /data-from="Lightnig Bolt"/.test(html) && /data-to="Lightning Bolt"/.test(html));
  chk('one suggestion offers no accept-all', !/rFixAll/.test(html));
}
{
  const r = Object.assign(emptyReport(), {
    suggested: [{ typed: 'a', guess: 'A', set: '' }, { typed: 'b', guess: 'B', set: '' }],
  });
  chk('two suggestions offer accept-all', /rFixAll/.test(resolveDialogHTML(r)));
}
{
  const r = Object.assign(emptyReport(), { ambiguous: [{ typed: 'Bolt', count: 4 }] });
  const html = resolveDialogHTML(r);
  sweep('an ambiguous name leaks nothing', html);
  chk('it says how many it matched', /matched 4 cards/.test(html));
  chk('and that it was refused', /Refused/.test(html));
  chk('with no button to accept a coin flip', !/rfix/.test(html));
}
{
  const r = Object.assign(emptyReport(), { missing: ['Total Nonsense'] });
  const html = resolveDialogHTML(r);
  sweep('a missing card leaks nothing', html);
  chk('it states the consequence, not just the count',
      /excluded from every calculation/.test(html));
  chk('and that the figures are understated', /understated/.test(html));
  chk('it shows the inline escape hatch with the real name',
      html.includes('4 Total Nonsense {2}{R}') && html.includes('4 Total Nonsense [land:RG]'));
}
{
  /* All four at once — the shape the reported decklist actually produced. */
  const r = {
    renamed: [{ typed: 'Giantcraft Helm', actual: "Doc Ock's Tentacles", set: 'OM1' }],
    suggested: [{ typed: 'Lightnig Bolt', guess: 'Lightning Bolt', set: 'M11' }],
    ambiguous: [{ typed: 'Bolt', count: 4 }],
    missing: ['Total Nonsense'],
  };
  const html = resolveDialogHTML(r);
  sweep('the full report leaks nothing', html);
  eq('one section per kind', (html.match(/class="rsect"/g) || []).length, 4);
}
{
  const r = Object.assign(emptyReport(), {
    missing: ['<img src=x onerror=alert(1)>'],
    renamed: [{ typed: '"><b>x', actual: 'ok', set: 'AAA' }],
  });
  const html = resolveDialogHTML(r);
  chk('a card name cannot inject markup', !html.includes('<img src=x'));
  chk('nor break out of an attribute', !html.includes('"><b>x'));
  chk('it is escaped instead', html.includes('&lt;img'));
}

group('the banner above the tabs states the consequence');

{
  eq('nothing unresolved draws nothing', unresolvedBannerHTML([]), '');
  eq('a null list draws nothing', unresolvedBannerHTML(null), '');
  const html = unresolvedBannerHTML(['Dain', 'Kili', 'Helm']);
  sweep('the banner leaks nothing', html);
  chk('it counts them', /3 cards not recognised/.test(html));
  chk('it names them', /Dain, Kili, Helm/.test(html));
  chk('it says what that costs', /understated/.test(html));
  chk('and offers the fix', /ubFix/.test(html));
  chk('one card reads singular', /1 card not recognised/.test(unresolvedBannerHTML(['x'])));
  chk('a long list is truncated', / and 2 more/.test(unresolvedBannerHTML(['a','b','c','d','e'])));
  chk('names are escaped', !unresolvedBannerHTML(['<b>x']).includes('<b>x'));
}

process.exit(report() ? 1 : 0);
