// How often does an English-shaped plural ({n, plural, one {…} other {…}})
// go wrong in other languages? Reads the runtime's CLDR plural rules through
// Intl.PluralRules for every two- and three-letter language code the runtime
// supports (aliases folded to their base language, e.g. sh -> sr), and counts
// the integers 0..100 that land in a category such a message lacks.
//
//   node eval/cldr-survey.mjs [--json]
const letters = 'abcdefghijklmnopqrstuvwxyz';
const langs = new Map();
const consider = (tag) => {
  if (!Intl.PluralRules.supportedLocalesOf([tag]).length) return;
  const canon = Intl.getCanonicalLocales(tag)[0];
  const base = canon.split('-')[0];
  if (new Intl.PluralRules(tag).resolvedOptions().locale.split('-')[0] !== base) return; // runtime fell back to another language
  if (!langs.has(base)) langs.set(base, canon);
};
for (const x of letters) for (const y of letters) consider(x + y);
for (const x of letters) for (const y of letters) for (const z of letters) consider(x + y + z);

const rows = [];
for (const [base] of langs) {
  const pr = new Intl.PluralRules(base);
  const cats = pr.resolvedOptions().pluralCategories;
  const ord = new Intl.PluralRules(base, { type: 'ordinal' }).resolvedOptions().pluralCategories;
  const missed = [];
  for (let n = 0; n <= 100; n++) if (!['one', 'other'].includes(pr.select(n))) missed.push(n);
  rows.push({ lang: base, categories: cats.length, cats, ordinalCategories: ord.length, missed: missed.length, first: missed.slice(0, 6) });
}
rows.sort((a, b) => b.missed - a.missed || a.lang.localeCompare(b.lang));
const byCount = {};
for (const r of rows) byCount[r.categories] = (byCount[r.categories] || 0) + 1;
const summary = {
  runtime: { node: process.versions.node, icu: process.versions.icu, cldr: process.versions.cldr },
  languages: rows.length,
  byCategoryCount: byCount,
  usingFewOrMany: rows.filter((r) => r.cats.includes('few') || r.cats.includes('many')).length,
  usingZero: rows.filter((r) => r.cats.includes('zero')).length,
  usingTwo: rows.filter((r) => r.cats.includes('two')).length,
  onlyOther: rows.filter((r) => r.categories === 1).length,
  brokenByOneOther: rows.filter((r) => r.missed > 0).length,
  ordinalWithMoreThanOther: rows.filter((r) => r.ordinalCategories > 1).length,
};
if (process.argv.includes('--json')) console.log(JSON.stringify({ summary, rows }, null, 2));
else {
  console.log(JSON.stringify(summary, null, 2));
  for (const r of rows.filter((x) => x.missed > 0)) console.log(`${r.lang.padEnd(4)} ${String(r.missed).padStart(3)}/101  ${r.cats.join(',')}  e.g. ${r.first.join(', ')}`);
}
