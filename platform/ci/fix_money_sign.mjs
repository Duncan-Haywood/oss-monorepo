#!/usr/bin/env node
// Put the minus sign outside the currency symbol, and never sign a zero.
//
// Why this exists
// ---------------
// Every venture vendors its own `money()` — inline in an `index.html`, in a
// `calc.mjs`, in the proposal module — because `platform/pages/build.mjs`
// publishes each venture directory on its own, so a cross-tree import would 404
// on the live site. They are copies of one function, and that function had two
// defects:
//
//   money(-9.24)  -> "$-9.24"   the sign belongs outside the symbol: "-$9.24"
//   money(-0.004) -> "$-0.00"   a break-even line claiming to be down money
//
// Both are visible wherever a tool prints a difference: the "vs keep-it" column
// on the Faire return table, "$-338.40" against a Shopify plan, "$-14.00" for
// disposing a Walmart return. A handful of ventures had already fixed this
// locally, which is how the portfolio ended up rendering both spellings.
//
// How the rewrite works
// ---------------------
// The copies drifted into eleven spellings — `value =>` and `(value) =>` and
// `n=>`, `.toFixed(2)` and `.toLocaleString(…)` and a `Number.EPSILON`
// half-cent nudge — so this matches the *shape* and reuses each original
// expression verbatim rather than swapping in one canonical body. Digit
// grouping and decimal places therefore come out exactly as they went in; the
// only change is the sign.
//
// The sign test is "negative, and the formatted magnitude contains a nonzero
// digit". That is what makes it correct for every variant at once: a whole-
// dollar formatter and a two-decimal one disagree about what rounds to zero,
// and asking the formatted text is the only check that agrees with whichever
// one is in front of it.
//
// Usage
//   node platform/ci/fix_money_sign.mjs          apply
//   node platform/ci/fix_money_sign.mjs --dry    report, write nothing

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRY = process.argv.includes('--dry');

// `platform/proposal/proposal.mjs` is the canonical copy and is fixed by hand,
// with the reasoning in a comment; `adopt.mjs --sync` puts it in the ventures.
// Rewriting the vendored copies here would only make the sync test red.
const SKIP_BASENAMES = new Set(['proposal.mjs']);

/**
 * `money`-shaped names only. `signedMoney` and friends already decide a sign of
 * their own — often a "+" as well — and prefixing another one would be wrong.
 */
const NAME = String.raw`(?:money|moneyLabel|fmtMoney|formatMoney|money0|money2|usd)`;

// A single-line template that opens with the currency symbol: `` `$${…}` ``.
// `[^`]*` is safe because every one of these is one line with no nested
// backtick. The capture is the expression between `$${` and the closing `}`.
const BODY = String.raw`\$\$\{([^\`]*)\}`;

const ARROW = new RegExp(
  String.raw`(const|let)(\s+)(${NAME})(\s*=\s*)\(?([A-Za-z_$][\w$]*)\)?(\s*=>\s*)\`${BODY}\`;`,
  'g'
);

const DECL = new RegExp(
  String.raw`function\s+(${NAME})\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\s*return\s+\`${BODY}\`;\s*\}`,
  'g'
);

/** The shared tail: format the magnitude, then sign it only if it is nonzero. */
function signed(param, indent) {
  return [
    `${indent}  const text = format(Math.abs(${param}));`,
    // A zero is a zero however the formatter spells it — "$0.00", "$0" — so the
    // test is for a nonzero digit rather than for a particular string.
    `${indent}  return ${param} < 0 && /[1-9]/.test(text) ? \`-\${text}\` : text;`,
  ].join('\n');
}

function rewriteArrow(match, kw, gap, name, eq, param, arrow, expr, offset, source) {
  const indent = ' '.repeat(source.slice(0, offset).match(/[^\n]*$/)[0].length);
  return [
    `${kw}${gap}${name}${eq}(${param}) => {`,
    // The inner parameter deliberately shadows the outer one so the original
    // expression keeps working unchanged, whatever it names or does to it.
    `${indent}  const format = (${param}) => \`$\${${expr}}\`;`,
    signed(param, indent),
    `${indent}};`,
  ].join('\n');
}

function rewriteDecl(match, name, param, expr, offset, source) {
  const indent = ' '.repeat(source.slice(0, offset).match(/[^\n]*$/)[0].length);
  return [
    `function ${name}(${param}) {`,
    `${indent}  const format = (${param}) => \`$\${${expr}}\`;`,
    signed(param, indent),
    `${indent}}`,
  ].join('\n');
}

const files = [
  ...globSync('ventures/*/*.html', { cwd: ROOT }),
  ...globSync('ventures/*/*.mjs', { cwd: ROOT }),
].filter(
  (f) =>
    !SKIP_BASENAMES.has(path.basename(f)) &&
    !/\.test\.mjs$/.test(f) &&
    !/(^|\/)test_|_test\.mjs$/.test(f)
);

let changedFiles = 0;
let changedSites = 0;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const before = readFileSync(abs, 'utf8');
  let count = 0;
  const tally = (fn) => (...args) => {
    count += 1;
    return fn(...args);
  };
  const after = before
    .replace(ARROW, tally(rewriteArrow))
    .replace(DECL, tally(rewriteDecl));
  if (after === before) continue;
  changedFiles += 1;
  changedSites += count;
  if (!DRY) writeFileSync(abs, after);
  if (DRY) console.log(`  ${rel} (${count})`);
}

console.log(
  `${DRY ? 'Would rewrite' : 'Rewrote'} ${changedSites} money() definition(s) in ${changedFiles} file(s).`
);
