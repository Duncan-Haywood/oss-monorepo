import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../cli.mjs';
import { exampleCsv } from '../example.mjs';

function capture(argv) {
  let out = '';
  const code = run(argv, { write: (s) => { out += s; } });
  return { code, out };
}

test('CLI prints a report, JSON and a flagged CSV for the example', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benford-'));
  const file = path.join(dir, 'ledger.csv');
  fs.writeFileSync(file, exampleCsv());
  const text = capture([file, '--threshold', '5000,10000']);
  assert.equal(text.code, 0);
  assert.match(text.out, /threshold 5,000: 84 just under vs 30 just over.*FLAG/);
  assert.match(text.out, /Northgate Supplies.*FLAG/);
  const json = JSON.parse(capture([file, '--json', '--group', 'vendor']).out);
  assert.equal(json.groupColumn, 'vendor');
  assert.equal(json.first.verdict, 'close conformity');
  const flagged = path.join(dir, 'flagged.csv');
  capture([file, '--flagged', flagged]);
  assert.match(fs.readFileSync(flagged, 'utf8'), /^row,amount,group,tests_flagging,reasons\n/);
  assert.throws(() => capture([file, '--amount', 'nope']), /No column named "nope"/);
  assert.equal(capture([]).code, 2);
});
