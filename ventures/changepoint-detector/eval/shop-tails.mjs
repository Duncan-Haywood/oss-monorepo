// The real shop's revenue noise, for the simulated shops of eval/shop-tails-closure-sim.mjs
// (eval/shop-tails-closure.prereg.md). Reads data/online-retail-daily.csv (UCI Online Retail, the design year),
// keeps the trading days (revenue > 0), takes log revenue less its weekday's median log residual and less a
// 13-trading-day running median, and returns those residuals centred on their median.
//   node eval/shop-tails.mjs   prints their sd, robust (MAD) sd and quantiles
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const median = (x) => { const y = [...x].sort((p, q) => p - q), n = y.length; return n % 2 ? y[(n - 1) / 2] : (y[n / 2 - 1] + y[n / 2]) / 2; };

export function shopResiduals(file = new URL('../data/online-retail-daily.csv', import.meta.url)) {
  const rows = readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const days = rows.filter((r) => Number(r[2]) > 0).map((r) => ({ w: new Date(r[0] + 'T00:00:00Z').getUTCDay(), y: Math.log(Number(r[2])) }));
  const run = (ys) => ys.map((_, i) => median(ys.slice(Math.max(0, i - 6), i + 7)));
  let m = run(days.map((d) => d.y));
  const wk = Array.from({ length: 7 }, (_, w) => { const r = days.map((d, i) => (d.w === w ? d.y - m[i] : null)).filter((x) => x !== null); return r.length ? median(r) : 0; });
  const adj = days.map((d) => d.y - wk[d.w]);
  m = run(adj);
  const res = adj.map((y, i) => y - m[i]);
  const c = median(res);
  return res.map((r) => r - c);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = shopResiduals();
  const sd = Math.sqrt(r.reduce((s, x) => s + x * x, 0) / (r.length - 1));
  const mad = 1.4826 * median(r.map(Math.abs));
  const q = (p) => [...r].sort((a, b) => a - b)[Math.floor(p * (r.length - 1))];
  console.log(`${r.length} trading days; sd ${sd.toFixed(3)}, MAD sd ${mad.toFixed(3)}; quantiles 1% ${q(0.01).toFixed(2)}, 5% ${q(0.05).toFixed(2)}, 50% ${q(0.5).toFixed(2)}, 95% ${q(0.95).toFixed(2)}, 99% ${q(0.99).toFixed(2)}; max ${Math.max(...r).toFixed(2)}, min ${Math.min(...r).toFixed(2)}`);
}
