// Reshape the two classic few-donor synthetic-control panels into the CLI's wide format (one column per unit) and
// write a `--covariates` file for each (README "Few donors: the Basque Country and West Germany").
//
//   node eval/few-donor-panels.mjs <basque.csv> <germany.csv>
//
// Inputs: pysyncon's copies of the R Synth package's `basque` data (Abadie and Gardeazabal 2003) and of Abadie,
// Diamond and Hainmueller's (2015) OECD panel, https://raw.githubusercontent.com/sdfordham/pysyncon/main/data/
// (sha256 in data/SOURCE.md). Long format, one row per unit and year. No value is changed; Spain's national row is
// dropped from the Basque panel (it is the sum of the regions, not a donor), as in the paper.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = (f) => join(here, '..', 'data', f);
const [basquePath, germanyPath] = process.argv.slice(2);
if (!basquePath || !germanyPath) { console.error('usage: node eval/few-donor-panels.mjs <basque.csv> <germany.csv>'); process.exit(2); }

function readLong(path) {
  const [head, ...rows] = readFileSync(path, 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const num = (v) => (v === '' || v == null ? null : Number(v));
const mean = (a) => { const v = a.filter((x) => x != null); if (!v.length) throw new Error('no values to average'); return v.reduce((s, x) => s + x, 0) / v.length; };
const fmt = (v) => String(Number(v.toPrecision(10)));

function writeWide(file, rows, unitKey, codeOf, yearKey, valueKey, from, to) {
  const units = [...new Set(rows.map((r) => r[unitKey]))].map(codeOf).filter(Boolean);
  const years = []; for (let y = from; y <= to; y++) years.push(y);
  const cell = new Map(rows.map((r) => [`${codeOf(r[unitKey])}|${Number(r[yearKey])}`, num(r[valueKey])]));
  const lines = [['year', ...units].join(',')];
  for (const y of years) {
    lines.push([y, ...units.map((u) => { const v = cell.get(`${u}|${y}`); if (v == null) throw new Error(`${file}: ${u} has no ${valueKey} in ${y}`); return fmt(v); })].join(','));
  }
  writeFileSync(out(file), lines.join('\n') + '\n');
  return units;
}

function writeCovariates(file, rows, unitKey, codeOf, yearKey, defs) {
  const units = [...new Set(rows.map((r) => r[unitKey]))].map(codeOf).filter(Boolean);
  const lines = [['unit', ...defs.map((d) => d.name)].join(',')];
  for (const u of units) {
    const mine = rows.filter((r) => codeOf(r[unitKey]) === u);
    lines.push([u, ...defs.map((d) => fmt(mean(mine.filter((r) => d.years.includes(Number(r[yearKey]))).map((r) => d.value(r)))))].join(','));
  }
  writeFileSync(out(file), lines.join('\n') + '\n');
}

// Basque Country: Spanish regions' GDP per head, thousands of 1986 USD, 1955-1997. Short codes for the regions.
const REGION = {
  'Andalucia': 'AND', 'Aragon': 'ARA', 'Baleares (Islas)': 'BAL', 'Basque Country (Pais Vasco)': 'BAS', 'Canarias': 'CAN',
  'Cantabria': 'CNT', 'Castilla Y Leon': 'CYL', 'Castilla-La Mancha': 'CLM', 'Cataluna': 'CAT', 'Comunidad Valenciana': 'VAL',
  'Extremadura': 'EXT', 'Galicia': 'GAL', 'Madrid (Comunidad De)': 'MAD', 'Murcia (Region de)': 'MUR',
  'Navarra (Comunidad Foral De)': 'NAV', 'Principado De Asturias': 'AST', 'Rioja (La)': 'RIO', 'Spain (Espana)': null,
};
const basque = readLong(basquePath);
const regionCode = (n) => { if (!(n in REGION)) throw new Error(`unknown region ${n}`); return REGION[n]; };
const bu = writeWide('spain-regions-gdp-per-capita.csv', basque, 'regionname', regionCode, 'year', 'gdpcap', 1955, 1997);
const yrs = (a, b, step = 1) => { const r = []; for (let y = a; y <= b; y += step) r.push(y); return r; };
// Covariates of the paper's kind, averaged before 1970 where the file has them (sector shares are every other year).
writeCovariates('spain-regions-covariates-1969.csv', basque, 'regionname', regionCode, 'year', [
  { name: 'investment share 1964-69', years: yrs(1964, 1969), value: (r) => num(r.invest) },
  { name: 'industry share 1961-69', years: yrs(1961, 1969), value: (r) => num(r['sec.industry']) },
  { name: 'agriculture share 1961-69', years: yrs(1961, 1969), value: (r) => num(r['sec.agriculture']) },
  { name: 'population density 1969', years: [1969], value: (r) => num(r.popdens) },
  { name: 'GDP per head 1960-69', years: yrs(1960, 1969), value: (r) => num(r.gdpcap) },
]);

// West Germany: OECD countries' GDP per head, PPP 2002 USD, 1960-2003. Spaces dropped from the names.
const germany = readLong(germanyPath);
const country = (n) => n.replace(/\s+/g, '');
const gu = writeWide('oecd-gdp-per-capita-1960-2003.csv', germany, 'country', country, 'year', 'gdp', 1960, 2003);
writeCovariates('oecd-covariates-1989.csv', germany, 'country', country, 'year', [
  { name: 'trade openness 1981-89', years: yrs(1981, 1989), value: (r) => num(r.trade) },
  { name: 'inflation 1981-89', years: yrs(1981, 1989), value: (r) => num(r.infrate) },
  { name: 'industry share 1981-89', years: yrs(1981, 1989), value: (r) => num(r.industry) },
  { name: 'schooling 1980-85', years: [1980, 1985], value: (r) => num(r.schooling) },
  { name: 'investment 1980-84', years: [1980], value: (r) => num(r.invest80) },
  { name: 'GDP per head 1981-89', years: yrs(1981, 1989), value: (r) => num(r.gdp) },
]);
console.log(`Spain: ${bu.length} regions (${bu.join(', ')}); OECD: ${gu.length} countries (${gu.join(', ')})`);
