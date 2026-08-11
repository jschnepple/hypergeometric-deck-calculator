/* Fetchlands and restricted-use mana.

   Both exist because Scryfall's produced_mana is the wrong shape for them:

     - a fetchland has NO produced_mana at all, so left alone it is a land that
       makes no coloured mana — catastrophic for a deck on eight to twelve
       fetches, and the opposite of what this tool's Method tab used to claim;
     - a restricted land ("spend this mana only to cast an artifact spell")
       lists every colour with no hint of the restriction, so counting it
       naively hands you a five-colour manabase you do not have.

   Oracle text below is verbatim from the Scryfall API. */
const { load } = require('./extract');
const { group, chk, eq, report } = require('./harness');

load(['math', 'parsing'], { COLORS: ['W', 'U', 'B', 'R', 'G'], DB: {} });

/* ---------------------------------------------------------------- parseFetch */

group('parseFetch: recognising the fetch clause');

const EVOLVING = '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.';
const PASSAGE  = '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.';
const MISTY    = '{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Island card, put it onto the battlefield, then shuffle.';
const HEATH    = '{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Plains card, put it onto the battlefield, then shuffle.';

const ev = parseFetch(EVOLVING);
chk('Evolving Wilds is a fetch', !!ev);
chk('…and is basic-only', ev.basicOnly === true);
chk('…and fetches tapped', ev.tapped === true);
eq('…and can get any basic type', ev.types.length, 5);

const fp = parseFetch(PASSAGE);
chk('Fabled Passage fetches tapped', fp.tapped === true);

const mr = parseFetch(MISTY);
eq('Misty Rainforest gets Forest or Island', mr.types.sort(), ['Forest', 'Island']);
chk('…is not basic-only', mr.basicOnly === false);
chk('…and fetches untapped', mr.tapped === false);

eq('Windswept Heath gets Forest or Plains', parseFetch(HEATH).types.sort(), ['Forest', 'Plains']);

group('parseFetch: things that are not land fetches');
chk('artifact tutor is not a fetch',
    parseFetch('{2}, {T}, Sacrifice another artifact: Search your library for an artifact card…') === null);
chk('creature tutor is not a fetch',
    parseFetch('Search your library for a creature card, reveal it, then shuffle.') === null);
chk('a plain land is not a fetch', parseFetch('{T}: Add {G}.') === null);
chk('empty text does not throw', parseFetch('') === null);

/* --------------------------------------------------------------- resolveFetch */

group('resolveFetch: a fetch is only worth what the deck can actually get');

const land = (name, qty, subtypes, produces, typeLine) =>
  ({ name, qty, land: true, subtypes, produces, typeLine: typeLine || ('Land — ' + subtypes.join(' ')) });

const basics = [
  land('Forest', 4, ['Forest'], ['G'], 'Basic Land — Forest'),
  land('Island', 4, ['Island'], ['U'], 'Basic Land — Island'),
];
const shock = land('Steam Vents', 4, ['Island', 'Mountain'], ['U', 'R']);

eq('Misty Rainforest with Forests and Islands is a G/U source',
   resolveFetch(mr, basics).sort(), ['G', 'U']);

eq('Misty Rainforest in a deck with no Islands is NOT a blue source',
   resolveFetch(mr, [land('Forest', 8, ['Forest'], ['G'], 'Basic Land — Forest')]), ['G']);

eq('Misty Rainforest can get a shockland, so it picks up red too',
   resolveFetch(mr, [shock]).sort(), ['R', 'U']);

eq('Evolving Wilds cannot get a shockland — basics only',
   resolveFetch(ev, [shock]), []);

eq('Evolving Wilds gets the basics it can find',
   resolveFetch(ev, basics).sort(), ['G', 'U']);

eq('a fetch with nothing to fetch produces nothing',
   resolveFetch(mr, [land('Plains', 4, ['Plains'], ['W'], 'Basic Land — Plains')]), []);

const withFetch = basics.concat([
  Object.assign(land('Misty Rainforest', 4, [], []), { fetch: mr }),
]);
eq('a fetch never chains off another fetch', resolveFetch(mr, withFetch).sort(), ['G', 'U']);

/* ------------------------------------------------------------ parseRestriction */

group('parseRestriction: detecting restricted-use mana');

const CASTLE = '{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast an artifact spell.';
const CAVERN = '{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type…';

eq('Castle Doom is artifact-restricted', parseRestriction(CASTLE).type, 'artifact');
eq('Cavern of Souls is creature-restricted', parseRestriction(CAVERN).type, 'creature');
chk('an unrestricted land has no restriction', parseRestriction('{T}: Add {G} or {W}.') === null);
chk('empty text does not throw', parseRestriction('') === null);

group('restrictionAllows: checked against the spell being cast');
const artifactRestr = parseRestriction(CASTLE);
const creatureRestr = parseRestriction(CAVERN);

chk('artifact-restricted mana pays for an artifact',
    restrictionAllows(artifactRestr, { typeLine: 'Artifact' }) === true);
chk('…and for an artifact creature',
    restrictionAllows(artifactRestr, { typeLine: 'Legendary Artifact Creature — Robot' }) === true);
chk('…but not for a sorcery',
    restrictionAllows(artifactRestr, { typeLine: 'Sorcery' }) === false);
chk('…and not for a plain creature',
    restrictionAllows(artifactRestr, { typeLine: 'Legendary Creature — Human Artificer' }) === false);
chk('creature-restricted mana pays for a creature',
    restrictionAllows(creatureRestr, { typeLine: 'Creature — Elf' }) === true);
chk('an unrestricted source always counts',
    restrictionAllows(null, { typeLine: 'Sorcery' }) === true);
chk('with no spell in hand a restricted source does NOT count',
    restrictionAllows(artifactRestr, null) === false);

/* ------------------------------------------------------------------ sourcesFor */

group('sourcesFor: restricted sources are held out, not silently added');

const doom = { name: 'Castle Doom', qty: 4, land: true, subtypes: [],
               produces: ['W', 'U', 'B', 'R', 'G'], restriction: artifactRestr };
const plains = land('Plains', 4, ['Plains'], ['W'], 'Basic Land — Plains');
const pool = [plains, doom];

const forArtifact = sourcesFor('W', 3, pool, {}, 60, true, { typeLine: 'Artifact' });
eq('Castle Doom counts for an artifact spell', forArtifact.total, 8);
eq('…and nothing is held back', forArtifact.restricted, 0);

const forSorcery = sourcesFor('W', 3, pool, {}, 60, true, { typeLine: 'Sorcery' });
eq('Castle Doom does not count for a sorcery', forSorcery.total, 4);
eq('…and is reported as restricted instead', forSorcery.restricted, 4);

const summary = sourcesFor('W', 3, pool, {}, 60, true);
eq('a summary count with no spell excludes it', summary.total, 4);
eq('…and still reports it', summary.restricted, 4);

const red = sourcesFor('R', 3, pool, {}, 60, true, { typeLine: 'Sorcery' });
eq('a colour supplied ONLY by a restricted land reads as zero', red.total, 0);
eq('…with the restricted count surfaced', red.restricted, 4);

process.exit(report());
