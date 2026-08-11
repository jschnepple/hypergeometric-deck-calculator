#!/usr/bin/env node
/* Runs every test file against the code actually shipped in index.html.
   Usage:  node tests/run-all.js          */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

let failed = 0;
for (const f of files) {
  console.log(`\n${'='.repeat(52)}\n  ${f}\n${'='.repeat(52)}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  } catch (e) {
    failed++;
  }
}
console.log(`\n${'='.repeat(52)}`);
if (failed) { console.log(`${failed} of ${files.length} test files FAILED`); process.exit(1); }
console.log(`All ${files.length} test files passed.`);
