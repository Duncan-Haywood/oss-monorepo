// A coincident composite index from several monthly series, by the Conference Board's published method
// (Conference Board, "Calculating the Composite Indexes", Business Cycle Indicators handbook, 2001):
//   1. each component's symmetric percent change, x_t = 200 (X_t - X_{t-1}) / (X_t + X_{t-1});
//   2. weights w_i proportional to 1 / sd(x_i), scaled to sum to 1 (the "standardization factors");
//   3. the composite change c_t = sum_i w_i x_i;
//   4. the index I_0 = 100, I_t = I_{t-1} (200 + c_t) / (200 - c_t), the inverse of step 1.
// The handbook's last step, trend adjustment to GDP's growth, is left out: a dater works on the index's
// own peaks and troughs, which a trend shift moves only slightly, and GDP is quarterly.
//
// `sdWindow` [from, to] (indices, to exclusive) chooses the months the standard deviations are taken over,
// so a single outlier stretch (2020) can be kept from setting the weights. Default: every month.
//
// `scale` chooses how each component's volatility is measured over that window: 'sd' (default, the handbook's
// standard deviation), 'mad' (1.4826 x the median absolute deviation from the median, which a few wild months
// barely move), or 'trim' (the standard deviation after leaving out changes more than 5 MADs from the median).
//
// compositeIndex(series, { sdWindow, scale }) -> { index, weights, change }
//   series: arrays of positive numbers, equal length, aligned by month.

export function symChange(X) {
  const out = [];
  for (let t = 1; t < X.length; t++) out.push((200 * (X[t] - X[t - 1])) / (X[t] + X[t - 1]));
  return out;
}

const sd = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};

const median = (v) => {
  const a = [...v].sort((p, q) => p - q);
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
};
const mad = (v) => { const m = median(v); return median(v.map((x) => Math.abs(x - m))); };

export const SCALES = {
  sd,
  mad: (v) => 1.4826 * mad(v),
  trim: (v) => { const m = median(v), d = mad(v); const keep = v.filter((x) => Math.abs(x - m) <= 5 * d); return sd(keep.length >= 2 ? keep : v); },
};

export function compositeIndex(series, { sdWindow, scale = 'sd' } = {}) {
  const spread = SCALES[scale];
  if (!spread) throw new Error(`compositeIndex: unknown scale ${scale} (sd, mad or trim)`);
  if (!Array.isArray(series) || series.length < 1) throw new Error('compositeIndex needs at least one series');
  const n = series[0].length;
  for (const s of series) {
    if (s.length !== n) throw new Error('compositeIndex needs series of equal length');
    if (s.some((v) => !(Number.isFinite(v) && v > 0))) throw new Error('compositeIndex needs positive finite values');
  }
  if (n < 3) throw new Error('compositeIndex needs at least 3 months');
  const xs = series.map(symChange);
  const [a, b] = sdWindow ? [Math.max(0, sdWindow[0] - 1), Math.min(n - 1, sdWindow[1] - 1)] : [0, n - 1];
  const inv = xs.map((x) => 1 / spread(x.slice(a, b)));
  const tot = inv.reduce((p, q) => p + q, 0);
  const weights = inv.map((v) => v / tot);
  const change = xs[0].map((_, t) => xs.reduce((acc, x, i) => acc + weights[i] * x[t], 0));
  const index = [100];
  for (const c of change) index.push((index[index.length - 1] * (200 + c)) / (200 - c));
  return { index, weights, change };
}
