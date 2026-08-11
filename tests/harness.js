/* Tiny assertion harness. No dependencies — `node tests/run-all.js` and that's it. */
let fails = 0, passes = 0, suite = '';

function group(name) { suite = name; console.log(`\n--- ${name} ---`); }
function chk(label, cond, detail) {
  if (cond) { passes++; console.log(`PASS  ${label}`); }
  else { fails++; console.log(`FAIL  ${label}${detail !== undefined ? '  -> ' + detail : ''}`); }
}
function eq(label, got, want, tol = 0) {
  const ok = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tol
    : JSON.stringify(got) === JSON.stringify(want);
  chk(label, ok, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
function report() {
  console.log(`\n${'='.repeat(52)}`);
  console.log(fails ? `${fails} FAILED, ${passes} passed` : `ALL ${passes} TESTS PASSED`);
  return fails;
}
module.exports = { group, chk, eq, report, counts: () => ({ fails, passes }) };
