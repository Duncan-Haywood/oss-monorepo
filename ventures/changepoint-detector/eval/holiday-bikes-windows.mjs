// Holiday factor inside short stable stretches of the Capital Bikeshare series (the "not tried" item of the
// bike-share README section): 12-week windows, so the yearly swing is mostly out of the fit.
// usage: node eval/holiday-bikes-windows.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const W = 84;
for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  console.log(name);
  let sumNo = 0, sumWith = 0, n = 0;
  for (let s = 0; s + W <= rows.length; s += W) {
    const win = rows.slice(s, s + W);
    const values = win.map((r) => +r[col]), labels = win.map((r) => r[0]);
    const hol = win.filter((r) => r[3] === '1').map((r) => r[0]);
    if (hol.length < 2) continue;
    const a = analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb' });
    const b = analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb', holidays: hol });
    const na = a.pelt.changepoints.length, nb = b.pelt.changepoints.length;
    sumNo += na; sumWith += nb; n++;
    console.log(`  ${labels[0]}..${labels[W - 1]} holidays ${hol.length}: changes ${na} -> ${nb}, factor ${b.holidays ? b.holidays.factor.toFixed(3) : 'n/a'}`);
  }
  console.log(`  windows ${n}: total changes ${sumNo} -> ${sumWith}`);
}
