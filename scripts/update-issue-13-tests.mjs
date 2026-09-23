import fs from 'node:fs';

const path = 'main.test.js';
let source = fs.readFileSync(path, 'utf8');
const before = "  assert.deepEqual(plugin.settings.readingState, { version: 1, files: {} });";
const after = "  assert.deepEqual(plugin.settings.readingState, { version: 2, files: {} });";
if (!source.includes(before)) throw new Error('Expected v1 reading-state assertion was not found');
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Updated reading-state schema expectation to v2.');
