// Differential check of icu.mjs against formatjs (intl-messageformat and
// @formatjs/icu-messageformat-parser, MIT), an independent implementation of
// ICU MessageFormat. Not a dependency: install them anywhere and pass the
// node_modules directory.
//
//   node eval/differential.mjs <dir-with-node_modules> [count] [seed]
//
// Generates random messages from a grammar (valid structure, then random
// single-character mutations), parses each with both, and compares
// accept/reject and the formatted text in several locales. Values are
// strings for plain {who}/{0} arguments: ICU formats a bare number argument
// with the locale's number format and formatjs prints String(value), a known
// difference between the two that the README states.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parse, format, MessageSyntaxError } from '../icu.mjs';

const dir = resolve(process.argv[2] || '.');
const N = Number(process.argv[3] || 20000);
let seed = Number(process.argv[4] || 1);
const require = createRequire(join(dir, 'node_modules', 'x.js'));
const { parse: fjParse } = require('@formatjs/icu-messageformat-parser');
const { IntlMessageFormat } = require('intl-messageformat');

// mulberry32 (public-domain PRNG by Tommy Ettinger).
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['file', 'files', 'Hello', "it's", "l'", 'a b', '#', "''", "'{x}'", "'#'", ' ', 'é', '—', '}', '{'];
const NAMES = ['n', 'count', 'who', 'gender', 'd', '0', '1'];

function text(depth) {
  let t = '';
  const k = Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) t += pick(WORDS.slice(0, 13));
  return t;
}
function msg(depth, inPlural) {
  let m = '';
  const parts = 1 + Math.floor(rnd() * 3);
  for (let p = 0; p < parts; p++) {
    const r = rnd();
    if (r < 0.4 || depth > 2) m += text(depth);
    else if (r < 0.55) m += `{${pick(['who', 'who', '0'])}}`;
    else if (r < 0.62) m += `{n, number${pick(['', ', integer', ', percent'])}}`;
    // No date arguments: formatjs maps date styles to its own option table
    // (its "short" date has a 2-digit year), where ICU and Intl's dateStyle
    // use CLDR's patterns, so every date would differ by design.
    else if (r < 0.66) m += `{n, number}`;
    else if (r < 0.85) {
      const opts = [];
      if (rnd() < 0.3) opts.push(`=${pick([0, 1, 2])} {${msg(depth + 1, true)}}`);
      for (const c of ['one', 'few', 'many']) if (rnd() < 0.5) opts.push(`${c} {${msg(depth + 1, true)}}`);
      opts.push(`other {${msg(depth + 1, true)}}`);
      m += `{count, ${pick(['plural', 'plural', 'selectordinal'])},${rnd() < 0.2 ? ' offset:1' : ''} ${opts.join(' ')}}`;
    } else {
      m += `{gender, select, female {${msg(depth + 1, inPlural)}} male {${msg(depth + 1, inPlural)}} other {${msg(depth + 1, inPlural)}}}`;
    }
  }
  return m;
}
function mutate(s) {
  const ops = ['del', 'ins', 'dup'];
  const i = Math.floor(rnd() * (s.length + 1));
  const op = pick(ops);
  if (op === 'del') return s.slice(0, i) + s.slice(i + 1);
  if (op === 'ins') return s.slice(0, i) + pick(['{', '}', "'", '#', ',', ' ', '=', 'x']) + s.slice(i);
  return s.slice(0, i) + s.slice(i, i + 2) + s.slice(i);
}

const values = { n: 1234.5, count: 0, who: 'Ana', gender: 'female', d: new Date(Date.UTC(2026, 0, 15, 12)), 0: 'zero', 1: 'one' };
const LOCALES = ['en', 'fr', 'pl', 'ru', 'ar', 'cy', 'ja'];
const COUNTS = [0, 1, 2, 3, 5, 11, 21, 22, 101, 1.5];
// Two differences between ICU4J and formatjs are known and expected, and
// counted apart rather than hidden:
//  - styleText: ICU4J's MessagePattern.parseSimpleStyle balances "{" "}"
//    and honours apostrophe quotes inside a simple argument's style
//    ({n, number, {} and an unclosed ' are errors), while formatjs ends the
//    style at the first "}";
//  - bareNumber: ICU formats a number passed to a plain {n} with the
//    locale's number format; formatjs prints String(n).
const hasBareNumber = (ast) => { let hit = false; const w = (ns) => { for (const n of ns) { if (n.type === 'argument' && n.argType === null && typeof values[n.name] === 'number') hit = true; if (n.options) for (const o of n.options) w(o.value); } }; w(ast); return hit; };
const known = { styleText: 0, bareNumber: 0 };
const stats = { total: 0, bothAccept: 0, bothReject: 0, weAcceptTheyReject: 0, weRejectTheyAccept: 0, formatCompared: 0, formatBothThrow: 0, formatDiffer: 0 };
const examples = { weAcceptTheyReject: [], weRejectTheyAccept: [], formatDiffer: [] };
for (let k = 0; k < N; k++) {
  let s = msg(0, false);
  if (rnd() < 0.5) s = mutate(s);
  stats.total++;
  let ours = null; let theirs = null; let ourError = '';
  try { ours = parse(s).ast; } catch (e) { if (!(e instanceof MessageSyntaxError)) throw e; ourError = e.message; }
  try { theirs = fjParse(s, { ignoreTag: true, requiresOtherClause: true }); } catch { theirs = null; }
  if (ours && theirs) stats.bothAccept++;
  else if (!ours && !theirs) stats.bothReject++;
  else if (ours) { stats.weAcceptTheyReject++; if (examples.weAcceptTheyReject.length < 8) examples.weAcceptTheyReject.push(s); }
  else if (/in the style of/.test(ourError) || /,\s*(number|date|time|spellout|ordinal|duration)\s*,[^}]*[{']/.test(s)) known.styleText++;
  else { stats.weRejectTheyAccept++; if (examples.weRejectTheyAccept.length < 8) examples.weRejectTheyAccept.push(s); }
  if (!ours || !theirs) continue;
  for (const loc of LOCALES) {
    const count = pick(COUNTS);
    const v = { ...values, count };
    let a; let b;
    try { a = format(ours, v, loc); } catch (e) { a = `ERR ${e.message}`; }
    try { b = String(new IntlMessageFormat(s, loc, undefined, { ignoreTag: true }).format(v)); } catch (e) { b = `ERR ${e.message}`; }
    stats.formatCompared++;
    if (a.startsWith('ERR ') && b.startsWith('ERR ')) { stats.formatBothThrow++; continue; }
    if (a !== b && hasBareNumber(ours)) { known.bareNumber++; continue; }
    if (a !== b) { stats.formatDiffer++; if (examples.formatDiffer.length < 8) examples.formatDiffer.push({ s, loc, count, ours: a, formatjs: b }); }
  }
}
console.log(JSON.stringify({ stats, known, examples }, null, 2));
