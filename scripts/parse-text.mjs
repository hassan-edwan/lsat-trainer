#!/usr/bin/env node
// Convert a plain-text test (see docs/FORMAT.md) to LSAT Trainer JSON.
// Usage: node scripts/parse-text.mjs input.txt [output.json]
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTest, parseTestText } from '../src/lib/importer.js';
import { typeLabel } from '../src/lib/taxonomy.js';

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/parse-text.mjs input.txt [output.json]');
  process.exit(1);
}

const raw = parseTestText(fs.readFileSync(input, 'utf8'));
let test;
try {
  test = normalizeTest(raw);
} catch (e) {
  console.error(`Could not convert ${input}:\n${e.message}`);
  process.exit(1);
}

for (const s of test.sections) {
  console.error(`\n${s.title} (${s.kind}, ${s.questions.length} questions)`);
  for (const q of s.questions) {
    console.error(`  ${String(q.number).padStart(2)}. ${q.types.map(typeLabel).join(', ').padEnd(28)} ${q.autoTagged ? '(auto)' : '      '} ${q.stem.slice(0, 70)}`);
  }
}

const json = JSON.stringify(test, null, 2);
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json + '\n');
  console.error(`\nWrote ${output}`);
} else {
  process.stdout.write(json + '\n');
}
