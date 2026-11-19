// Exploratory, not pre-registered (README "Clumped counts in the watch"): how clumped are a real shop's daily orders, and
// what each count arm sends on them. node eval/clumping-real-shop.mjs > eval/clumping-real-shop.out.txt
import { readFileSync } from 'node:fs';
import { replayWatch } from '../watch-core.mjs';
const rows = readFileSync(new URL('../data/online-retail-daily.csv', import.meta.url),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const labels = rows.map(r=>r[0]), orders = rows.map(r=>+r[1]);
const wd = rows.map(r=>new Date(r[0]+'T00:00:00Z').getUTCDay());
// dispersion on open days by month: var/mean
const open = orders.filter((v,i)=>wd[i]!==6);
for (let m=0;m<open.length;m+=60){const x=open.slice(m,m+60);const mu=x.reduce((a,b)=>a+b)/x.length;const v=x.reduce((a,b)=>a+(b-mu)**2,0)/(x.length-1);console.log('open days',m,'mean',mu.toFixed(1),'var/mean',(v/mu).toFixed(2));}
for (const [name,o] of Object.entries({bocpd:{detector:'bocpd'}, window:{detector:'bocpd-window'}, 'window+nb':{detector:'bocpd-window',overdispersion:'nb'}, 'bocpd+nb':{detector:'bocpd',overdispersion:'nb'}})) {
  const r = replayWatch(orders, labels, { model:'poisson', period:7, from:90, budget:Infinity, ...o });
  console.log(name, 'checks', r.checks, 'alerts', r.alerts.length, r.alerts.map(a=>a.label+(a.meanAfter<a.meanBefore?'↓':'↑')).join(' '));
}
