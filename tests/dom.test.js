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

group('saving keeps the variant');
$('slotName').value = 'Test build';
click($('saveSlot'));
const stored = JSON.parse(w.localStorage.getItem('mtg-mana-calc-v1'));
const build = stored.builds['Test build'];
chk('the variant is in the saved build', build.variants.length === 1);
chk('with its swap', build.variants[0].swaps[0].in === 'Cryptic');
chk('the schema is stamped', build.schema === 2);
chk('and the selection is remembered', build.activeVariant === 1);

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

group('nothing threw along the way');
chk('no javascript errors during the whole run', jsErrors.length === 0, jsErrors.join(' | '));

process.exit(report());
