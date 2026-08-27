/* The only test that loads the actual page and clicks on it.

   Every other file here slices pure logic out of index.html and calls it
   directly, which is fast and dependency-free but cannot see the half of the
   feature that lives in event handlers, element ids and innerHTML targets. A
   typo in `$('sbLst')` passes every one of them and breaks the page on load.

   So this one boots the real document in jsdom and drives it: paste a list,
   make a variant, pick swaps from the dropdowns, open the Compare tab, run the
   simulation, save, reload, break the variant on purpose. It asserts on what
   the user would see.

   IT SKIPS ITSELF IF JSDOM IS NOT INSTALLED. The suite's zero-dependency
   promise is not worth trading away for this, so `node tests/run-all.js` still
   works on a clean checkout with nothing installed — you simply get the
   integration layer only when you have opted into it:

       npm install jsdom     (anywhere on NODE_PATH, or in this directory)

   The decklist below uses the inline {R} and [land:U] overrides throughout, so
   the whole run is offline: no Scryfall, no network, no cache. */

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('\n--- DOM integration ---');
  console.log('SKIP  jsdom is not installed — `npm install jsdom` to run the integration layer.');
  process.exit(0);
}

const fs = require('fs');
const path = require('path');
const { group, chk, report } = require('./harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const jsErrors = [];
const dom = new JSDOM(HTML, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.org/',            // gives localStorage a real origin
  beforeParse(w) {
    // jsdom has no matchMedia; the page reads it once for prefers-reduced-motion.
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
                            addEventListener() {}, removeEventListener() {} });
    w.onerror = m => jsErrors.push('window.onerror: ' + m);
    const ce = w.console.error;
    w.console.error = (...a) => { jsErrors.push('console.error: ' + a.join(' ')); ce(...a); };
  },
});

const w = dom.window, d = w.document;
const $ = id => d.getElementById(id);
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const text = el => el.textContent.replace(/\s+/g, ' ').trim();
const clean = (label, html) => {
  chk(`${label}: no undefined`, !/undefined/.test(html), (html.match(/.{0,60}undefined.{0,60}/) || [''])[0]);
  chk(`${label}: no NaN`,       !/NaN/.test(html),       (html.match(/.{0,60}NaN.{0,60}/) || [''])[0]);
};

const LIST = [
  '4 Bolt {R}', '4 Guide {R}', '4 Skewer {2}{R}', '4 Dragon {3}{R}{R}',
  '4 Charm {R}{R}', '4 Cantrip {1}{R}', '4 Threat {2}{R}', '4 Finisher {4}{R}',
  '4 Trick {1}{R}', '8 Island [land:U]', '16 Mountain [land:R]',
  'Sideboard', '4 Abrade {1}{R}', '4 Negate {1}{U}', '4 Cryptic {1}{U}{U}{U}',
].join('\n');

/* ------------------------------------------------------------------ */
group('the page boots');
chk('no errors on load', jsErrors.length === 0, jsErrors.join(' | '));
const refIds = new Set();
for (const m of HTML.matchAll(/\$\('([\w-]+)'\)/g)) refIds.add(m[1]);
for (const m of HTML.matchAll(/getElementById\('([\w-]+)'\)/g)) refIds.add(m[1]);
const missing = [...refIds].filter(i => !$(i));
chk(`every one of the ${refIds.size} referenced element ids exists`, missing.length === 0, missing.join(', '));
const tabs = [...$('tabs').children].map(b => b.dataset.t);
chk('every tab has a panel', tabs.every(t => !!$('p-' + t)), tabs.join(','));

/* ------------------------------------------------------------------ */
group('pasting a list with a sideboard');
$('list').value = LIST;
fire($('list'), 'input');
chk('the sideboard is counted against fifteen', /12\/15/.test($('sbCount').textContent), $('sbCount').textContent);
chk('its cards are listed', /Abrade/.test($('sbList').innerHTML));
chk('the deck is 60, not 72', /\b60\b/.test($('glance').innerHTML), text($('glance')).slice(0, 90));
clean('sideboard panel', $('sbList').innerHTML + $('sbFlags').innerHTML + $('vEditor').innerHTML);

group('creating a variant');
w.prompt = () => 'vs Control';
click($('vAdd'));
chk('a chip appears', /vs Control/.test($('vbar').innerHTML));
chk('and is selected', $('vbar').querySelector('.vchip.on').dataset.v === '1');
chk('the page is visibly marked as showing a variant', d.body.classList.contains('variant-on'));

group('the swap editor');
click($('vAddSwap'));
const sels = () => $('vEditor').querySelector('.vrow').querySelectorAll('select');
chk('cards coming out are the maindeck', [...sels()[0].options].some(o => o.value === 'Dragon'));
chk('cards coming in are the sideboard, and only the sideboard',
    [...sels()[1].options].some(o => o.value === 'Cryptic') &&
    ![...sels()[1].options].some(o => o.value === 'Dragon'));
sels()[0].value = 'Guide';   fire(sels()[0], 'change');
sels()[1].value = 'Cryptic'; fire(sels()[1], 'change');
const qty = $('vEditor').querySelector('input[data-attr="qty"]');
qty.value = '4'; fire(qty, 'change');
chk('the swap reads back as a sideboard plan', /−4 Guide, \+4 Cryptic/.test(text($('vbar'))), text($('vbar')));
chk('and is reported as balanced', /balanced/.test(text($('vEditor'))));
clean('editor', $('vEditor').innerHTML);

group('every panel now describes the variant');
chk('blue has become a requirement', /Blue/.test($('p-colors').innerHTML));
clean('verdict', $('p-verdict').innerHTML);
clean('colours', $('p-colors').innerHTML);
clean('land count', $('p-lands').innerHTML);
clean('curve', $('p-curve').innerHTML);

group('the compare tab');
const cmpTab = [...$('tabs').children].find(b => b.dataset.t === 'compare');
click(cmpTab);
chk('the panel is shown', !$('p-compare').classList.contains('hide'));
chk('the simulation controls appear once there is something to compare',
    !$('cmpControls').classList.contains('hide'));
chk('the matrix rendered', /Side by side/.test($('cmpOut').innerHTML));
chk('four Cryptic Commands on eight Islands is called out', /blue/i.test(text($('cmpOut'))),
    text($('cmpOut')).slice(0, 200));
clean('compare panel', $('cmpOut').innerHTML);

group('the sampled comparison');
$('cmpCount').value = '200';
click($('cmpRun'));
chk('keep rates rendered', /Keepable hands/.test($('cmpOut').innerHTML));
chk('the noise band is stated rather than assumed', /noise/.test(text($('cmpOut'))));
clean('compare with a simulation', $('cmpOut').innerHTML);

group('the goldfish deals from the variant on screen');
click([...$('tabs').children].find(b => b.dataset.t === 'goldfish'));
$('gfCount').value = '100';
click($('gfRun'));
chk('hands were dealt', /shipped/.test(text($('gfOut'))), text($('gfOut')).slice(0, 120));
clean('goldfish', $('gfOut').innerHTML);

group('the consistency tab, from empty to a frontier');
const conTab = [...$('tabs').children].find(b => b.dataset.t === 'consistency');
click(conTab);
chk('the panel is shown', !$('p-consistency').classList.contains('hide'));
chk('and teaches before there is anything to show', /No goals yet/.test(text($('glOut'))),
    text($('glOut')).slice(0, 120));
chk('it names the deck it is about to describe', /vs Control/.test($('glDeck').textContent),
    $('glDeck').textContent);

click($('goalCurve'));
chk('a preset goal appears in the builder', /Two lands/.test($('goalEditor').innerHTML));
chk('and is answered on the panel', /\d+\.\d%/.test(text($('glOut'))), text($('glOut')).slice(0, 160));
chk('exactly, not sampled', /exact/.test($('glOut').innerHTML));
chk('the frontier is drawn', /<svg/.test($('glOut').innerHTML));
clean('consistency', $('glOut').innerHTML);
clean('goal builder', $('goalEditor').innerHTML);

group('a goal that is not finished is refused, not answered');
click($('goalLeyline'));
chk('the free-spell preset arrives with no card chosen',
    /no card chosen/.test(text($('glOut'))), text($('glOut')).slice(0, 200));
chk('and only the finished goal is on the chart',
    ($('glOut').innerHTML.match(/<polyline/g) || []).length === 1);
{
  /* Pick one from the dropdown and it becomes answerable. Both ends of every
     choice on this tab are enumerated, so a goal cannot name a card the deck
     does not run. */
  const blocks = [...$('goalEditor').querySelectorAll('.gblock')];
  const leyline = blocks[blocks.length - 1];
  const nameSel = leyline.querySelector('select[data-attr="name"]');
  chk('the card dropdown offers the maindeck', [...nameSel.options].some(o => o.value === 'Dragon'));
  nameSel.value = 'Dragon'; fire(nameSel, 'change');
  chk('choosing one unblocks the goal', !/no card chosen/.test(text($('glOut'))));
  chk('and puts it on the chart',
      ($('glOut').innerHTML.match(/<polyline/g) || []).length === 2);
  clean('consistency, two goals', $('glOut').innerHTML);
}

group('the mulligan policy is a control, not a constant');
{
  const before = text($('glOut'));
  $('glMulls').value = '5'; fire($('glMulls'), 'change');
  chk('raising it changes the answer', text($('glOut')) !== before);
  chk('and the chain runs all the way down', /keep anything/.test(text($('glOut'))));
  clean('consistency, five mulligans', $('glOut').innerHTML);
  $('glMulls').value = '2'; fire($('glMulls'), 'change');
}

group('editing a clause');
{
  /* Re-queried after every change on purpose: the builder is rebuilt wholesale
     by render(), so a node held across an edit is detached and its events go
     nowhere. Holding one is how you write a test that silently stops testing. */
  const kind = $('goalEditor').querySelector('.grow select[data-attr="kind"]');
  kind.value = 'types'; fire(kind, 'change');
  chk('switching to card types drops the card selector',
      $('goalEditor').querySelectorAll('.gsel').length === 3,
      String($('goalEditor').querySelectorAll('.gsel').length));
  chk('and the panel follows', /distinct card type/.test(text($('glOut'))));
  clean('consistency, a types clause', $('glOut').innerHTML);

  const n = $('goalEditor').querySelector('.grow input[data-attr="n"]');
  n.value = '4'; fire(n, 'change');
  chk('the count is editable', /at least 4 distinct card types/.test(text($('glOut'))));

  const del = $('goalEditor').querySelector('button[data-gclause]');
  click(del);
  chk('a clause can be removed', !/at least 4 distinct card types/.test(text($('glOut'))));
  clean('consistency, after a delete', $('glOut').innerHTML);
}

group('goals follow the deck you are viewing');
{
  const onVariant = text($('glOut'));
  click($('vbar').querySelector('.vchip[data-v=""]'));
  click(conTab);
  chk('switching to the maindeck moves the figures', text($('glOut')) !== onVariant);
  chk('and the panel says which deck it is describing', /maindeck/.test($('glDeck').textContent));
  clean('consistency, maindeck', $('glOut').innerHTML);
  click($('vbar').querySelector('.vchip[data-v="1"]'));
  click(conTab);
}

group('saving keeps the variant and the goals');
$('slotName').value = 'Test build';
click($('saveSlot'));
const stored = JSON.parse(w.localStorage.getItem('mtg-mana-calc-v1'));
const build = stored.builds['Test build'];
chk('the variant is in the saved build', build.variants.length === 1);
chk('with its swap', build.variants[0].swaps[0].in === 'Cryptic');
chk('the schema is stamped', build.schema === 3);
chk('and the selection is remembered', build.activeVariant === 1);
chk('the goals are in the saved build', build.goals.length === 2, JSON.stringify(build.goals));
chk('with their clauses', build.goals.every(g => g.clauses.length >= 1));
chk('and the mulligan policy', build.goalMulls === 2, String(build.goalMulls));

group('switching back to the maindeck');
click($('vbar').querySelector('.vchip[data-v=""]'));
chk('the marking clears', !d.body.classList.contains('variant-on'));
chk('and the blue requirement goes with it', !/Cryptic/.test($('p-colors').innerHTML));

group('a variant broken by an edit to the maindeck');
/* Cut the card the swap takes out, from underneath it. */
$('list').value = LIST.replace('4 Guide {R}', '');
fire($('list'), 'input');
click($('vbar').querySelector('.vchip[data-v="1"]'));
chk('the chip is marked', /⚠/.test(text($('vbar'))), text($('vbar')).slice(0, 140));
chk('the panels show nothing rather than something wrong',
    !/\bundefined\b/.test($('p-verdict').innerHTML));
clean('verdict, broken variant', $('p-verdict').innerHTML);
click(cmpTab);
chk('compare says why', /can’t be applied|not in the maindeck/.test(text($('cmpOut'))),
    text($('cmpOut')).slice(0, 200));
clean('compare, broken variant', $('cmpOut').innerHTML);

group('the unresolved banner is not something you can scroll past');
{
  /* The reported complaint: the left-column panel was correct and easy to miss,
     which is a bad combination for a warning that understates every figure.

     Back to the maindeck first — the previous group left a BROKEN variant
     selected, and a broken variant carries the analysis shape empty, so its
     unresolved list is legitimately empty too. */
  click($('vbar').querySelector('.vchip[data-v=""]'));
  /* Into the MAINDECK, not appended — LIST ends with a Sideboard block, and
     appending would put the card there, where A.unknown correctly ignores it. */
  $('list').value = LIST.replace('4 Trick {1}{R}', '4 Totally Unknown Card');
  fire($('list'), 'input');
  const b = $('ubanner');
  chk('a banner appears above the tabs', /not recognised/.test(text(b)), text(b).slice(0, 120));
  chk('it names the card', /Totally Unknown Card/.test(text(b)));
  chk('it states the consequence', /understated/.test(text(b)));
  chk('and it is above the panels, not below them',
      b.compareDocumentPosition($('tabs')) & 4);
  clean('unresolved banner', b.innerHTML);

  $('list').value = LIST;
  fire($('list'), 'input');
  chk('and it goes away when everything resolves', $('ubanner').innerHTML === '');
}

group('the resolution dialog');
{
  /* Driven directly rather than through lookup(), because lookup() is the one
     path in the app that touches the network and dom.test.js runs offline. */
  const report = {
    renamed: [{ typed: 'Giantcraft Helm', actual: "Doc Ock's Tentacles", set: 'OM1' }],
    suggested: [{ typed: 'Guied', guess: 'Guide', set: 'ZEN' }],
    ambiguous: [],
    missing: ['Total Nonsense'],
  };
  chk('it starts hidden', $('rmodal').classList.contains('hide'));
  w.showResolveDialog(report);
  chk('showing it reveals the modal', !$('rmodal').classList.contains('hide'));
  chk('the rename is reported', /Doc Ock/.test(text($('rmodalBody'))));
  chk('the missing card is reported', /Total Nonsense/.test(text($('rmodalBody'))));
  clean('resolution dialog', $('rmodalBody').innerHTML);

  /* Accepting a suggestion rewrites the decklist and nothing else. */
  $('list').value = '4 Guied\n20 Mountain [land:R]';
  fire($('list'), 'input');
  w.RESOLVE_REPORT = { renamed: [], suggested: [{ typed: 'Guied', guess: 'Guide' }], ambiguous: [], missing: [] };
  $('rmodalBody').innerHTML = w.resolveDialogHTML(w.RESOLVE_REPORT);
  const fix = $('rmodalBody').querySelector('.rfix');
  chk('the accept button carries both names',
      fix.dataset.from === 'Guied' && fix.dataset.to === 'Guide');
  w.acceptSuggestion(fix.dataset.from, fix.dataset.to);
  chk('the decklist text is rewritten', $('list').value.startsWith('4 Guide\n'),
      JSON.stringify($('list').value.slice(0, 30)));
  chk('and the rest of the list is untouched', /20 Mountain \[land:R\]/.test($('list').value));

  w.showResolveDialog(report);
  click($('rmodalX'));
  chk('the X closes it', $('rmodal').classList.contains('hide'));
  w.showResolveDialog(report);
  click($('rmodalBackdrop'));
  chk('the backdrop closes it', $('rmodal').classList.contains('hide'));
  w.showResolveDialog(report);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  chk('Escape closes it', $('rmodal').classList.contains('hide'));

  /* A lookup with nothing to say must never interrupt. */
  w.showResolveDialog({ renamed: [], suggested: [], ambiguous: [], missing: [] });
  chk('a clean lookup opens no dialog', $('rmodal').classList.contains('hide'));
  w.showResolveDialog(null);
  chk('and neither does a null report', $('rmodal').classList.contains('hide'));
}

group('nothing threw along the way');
chk('no javascript errors during the whole run', jsErrors.length === 0, jsErrors.join(' | '));

process.exit(report());
