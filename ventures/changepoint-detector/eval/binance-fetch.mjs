// Fetch Binance's public spot trade files (data.binance.vision, one UTC day per symbol) and the symbols'
// quoted tick sizes (data-api.binance.vision exchangeInfo, PRICE_FILTER tickSize), for
// eval/stale-growth-quoted-tick.mjs. Nothing is committed. Needs curl and unzip.
// usage: node eval/binance-fetch.mjs <dir>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYMBOLS, DAY } from './stale-growth-quoted-tick.mjs';

const dir = process.argv[2] || 'binance-data';
mkdirSync(dir, { recursive: true });
const curl = (url, out) => execFileSync('curl', ['-sSfL', '--retry', '3', '-m', '600', '-o', out, url], { stdio: 'inherit' });
const info = join(dir, 'exchangeInfo.json');
if (!existsSync(info)) curl(`https://data-api.binance.vision/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS))}`, info);
const ticks = {};
for (const s of JSON.parse(readFileSync(info, 'utf8')).symbols) ticks[s.symbol] = s.filters.find((f) => f.filterType === 'PRICE_FILTER').tickSize;
writeFileSync(join(dir, 'ticks.json'), JSON.stringify(ticks, null, 1));
for (const s of SYMBOLS) {
  const csv = join(dir, `${s}-trades-${DAY}.csv`);
  if (existsSync(csv)) continue;
  const zip = join(dir, `${s}-trades-${DAY}.zip`);
  try { curl(`https://data.binance.vision/data/spot/daily/trades/${s}/${s}-trades-${DAY}.zip`, zip); execFileSync('unzip', ['-o', '-q', zip, '-d', dir]); }
  catch (e) { console.log(`${s}: not fetched (${e.message.split('\n')[0]})`); }
}
console.log(`ticks: ${JSON.stringify(ticks)}`);
