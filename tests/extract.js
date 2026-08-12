/* Pulls named sections out of index.html so the tests exercise the SHIPPED code
   rather than a stale copy. Sections are delimited by the banner comments in the
   source; if you rename a banner, update SECTIONS here and the tests will tell you.

   The full script cannot simply be eval'd in node because the boot sequence and
   event wiring touch the DOM, so we slice out the pure-logic regions instead. */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');

const SECTIONS = {
  math:        ['MATH CORE',   'PARSING'],
  parsing:     ['PARSING',     'ANALYSIS'],
  payoffs:     ['DIG PAYOFFS', 'GOLDFISH'],
  goldfish:    ['GOLDFISH',    'RENDER'],
  persistence: ['PERSISTENCE', 'SCRYFALL'],
};

function script() {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('no <script> block found in index.html');
  return m[1];
}

function banner(name) {
  return new RegExp(
    '/\\* ={10,}\\s*\\n\\s*' + name + '\\s*\\n[\\s\\S]*?={10,} \\*/'
  );
}

/** Return the source text of one named section. */
function section(name) {
  const [from, to] = SECTIONS[name] || [];
  if (!from) throw new Error('unknown section: ' + name);
  const src = script();
  const a = src.match(banner(from));
  const b = src.match(banner(to));
  if (!a) throw new Error(`could not find section banner "${from}" in index.html`);
  if (!b) throw new Error(`could not find section banner "${to}" in index.html`);
  const start = a.index + a[0].length;
  const end = b.index;
  if (end <= start) throw new Error(`section "${from}" is empty or banners are out of order`);
  return src.slice(start, end);
}

/** Concatenate several sections, for tests that need more than one. */
function sections(...names) { return names.map(section).join('\n'); }

/* Load sections into global scope so tests can call them directly.

   Two wrinkles, both verified empirically rather than assumed:

   1. It must be INDIRECT eval — `(0,eval)` — so the code runs in global scope
      rather than a scope local to the eval call.
   2. Even then, only `var` and `function` declarations become reachable from the
      calling module. `const`/`let` create global *lexical* bindings that a CJS
      module cannot see, so every `const` in the source (cardsSeen, KARSTEN, PERM,
      STORE_KEY…) would come back "is not defined". We therefore rewrite
      TOP-LEVEL `const`/`let` to `var`. The regex is anchored to column 0, so
      declarations inside functions — which are always indented in this source —
      keep their block scoping and loop closures behave normally.

   `globals` seeds anything the extracted code closes over (COLORS, DB, PAYOFFS…). */
function hoist(src) { return src.replace(/^(?:const|let) /gm, 'var '); }

function load(names, globals = {}) {
  Object.assign(globalThis, globals);
  (0, eval)(hoist(sections(...names)));
}

module.exports = { script, section, sections, load, hoist, SECTIONS, HTML };
