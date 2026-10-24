// Score a run.mjs results file the way assistant.mjs scores the rules: a case
// is fully right when every expected field has the expected value and nothing
// else was written; a wrong write is a value written that the sentence did not
// ask for. Three readings of the same model replies:
//
//   model alone          validateFills on the reply, as the panel used to
//   old panel            the model's reading replaced the rules' when it found at least as many values
//   new panel            numbers the person did not say dropped, the rules' values stand,
//                        the model only adds fields the rules missed, and each number
//                        said fills one field (client.js)
//
//   node platform/pages/assistant/model-bench/score.mjs results.json [--list]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUtterance, validateFills, mergeFills, extractJson } from '../fill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const evals = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'evals.json'), 'utf8'));

function score(read) {
  const s = { cases: 0, passed: 0, wrongWrites: 0, missed: 0, blind: { cases: 0, passed: 0, wrongWrites: 0 } };
  for (const c of run.cases) {
    const got = Object.fromEntries(read(c).fills.map((f) => [f.key, f.value]));
    let ok = true;
    let wrong = 0;
    for (const [k, v] of Object.entries(got)) if (c.expect[k] !== v) { wrong++; ok = false; }
    for (const k of Object.keys(c.expect)) if (!(k in got)) { s.missed++; ok = false; }
    s.cases++;
    s.wrongWrites += wrong;
    if (ok) s.passed++;
    if (c.round > 0) { s.blind.cases++; s.blind.wrongWrites += wrong; if (ok) s.blind.passed++; }
  }
  return s;
}

const fields = (c) => evals.forms[c.form].fields;
const rules = (c) => parseUtterance(c.say, fields(c));
const alone = (c) => validateFills(extractJson(c.raw), fields(c));
const oldPanel = (c) => { const m = alone(c); const r = rules(c); return m.fills.length >= r.fills.length ? m : r; };
const newPanel = (c) => mergeFills(rules(c), validateFills(extractJson(c.raw), fields(c), c.say), c.say);

const ms = run.cases.map((c) => c.ms).sort((x, y) => x - y);
const sec = (x) => Math.round(x / 100) / 10;
console.log(JSON.stringify({
  model: run.model,
  threads: run.threads,
  isolated: run.crossOriginIsolated,
  loadSec: sec(run.loadMs),
  answer: { sec: sec(run.answer.ms), firstTokenSec: sec(run.answer.firstMs), chunks: run.answer.chunks },
  fillSec: { median: sec(ms[ms.length >> 1]), p90: sec(ms[Math.floor(ms.length * 0.9)]), max: sec(ms.at(-1)) },
  errors: run.cases.filter((c) => c.err).length,
  rules: score(rules),
  modelAlone: score(alone),
  oldPanel: score(oldPanel),
  newPanel: score(newPanel),
}, null, 1));
if (process.argv.includes('--list')) {
  for (const c of run.cases) {
    const got = Object.fromEntries(newPanel(c).fills.map((f) => [f.key, f.value]));
    const wrong = Object.entries(got).filter(([k, v]) => c.expect[k] !== v);
    if (wrong.length) console.log(`${c.form} | ${c.say} | wrong: ${JSON.stringify(Object.fromEntries(wrong))}`);
  }
}
