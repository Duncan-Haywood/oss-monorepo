// Peak water demand from first principles: Hunter's probability method.
//
// R. B. Hunter, "Methods of Estimating Loads in Plumbing Systems", National
// Bureau of Standards Report BMS65 (1940). A fixture of a given type draws q
// gpm for t seconds once every T seconds in the busiest period, so at a random
// instant it is flowing with probability p = t/T. With n such fixtures the
// number flowing is binomial(n, p), and Hunter sized pipes for the number m
// that is exceeded no more than 1% of the time; the design flow is m * q.
//
// Hunter worked one fixture type at a time and blended types through "fixture
// units", weights read off his curves. Here the mix is done exactly: the total
// flow of several types is the sum of independent scaled binomials, and its
// distribution is a convolution on a 0.1 gpm grid. The design flow is the
// smallest flow exceeded with probability no more than `tail` (Hunter: 0.01).

export const GRID_GPM = 0.1;

// BMS65 Table 1 values, checked against the NIST scan
// (nvlpubs.nist.gov/nistpubs/Legacy/BMS/nbsbuildingmaterialsstructures65.pdf):
// flush valves 9 s in 300 s at 27 gpm; flush tanks 60 s in 300 s at 4 gpm;
// bathtubs 60 s in 900 s (1/15) at 8 gpm. They describe congested 1930s use,
// which is why they are a historical baseline here, not a default for a house.
export const HUNTER_1940 = Object.freeze([
  Object.freeze({ name: 'Flush valve (Hunter 1940)', gpm: 27, seconds: 9, everySeconds: 300 }),
  Object.freeze({ name: 'Flush tank (Hunter 1940)', gpm: 4, seconds: 60, everySeconds: 300 }),
  Object.freeze({ name: 'Bathtub (Hunter 1940)', gpm: 8, seconds: 60, everySeconds: 900 }),
]);

// Binomial pmf, computed in log space so thousands of fixtures do not
// underflow (0.8^5000 is below the smallest double). Terms below 1e-300 are 0.
export function binomialPmf(n, p) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a whole number of fixtures');
  if (!(p >= 0 && p <= 1)) throw new RangeError('p must be between 0 and 1');
  const out = new Float64Array(n + 1);
  if (p === 0) { out[0] = 1; return out; }
  if (p === 1) { out[n] = 1; return out; }
  const lp = Math.log(p), lq = Math.log1p(-p);
  let lc = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) lc += Math.log(n - k + 1) - Math.log(k);
    const v = lc + k * lp + (n - k) * lq;
    out[k] = v < -690 ? 0 : Math.exp(v);
  }
  return out;
}

// Hunter's design factor: the smallest m with P(X > m) <= tail.
export function designCount(n, p, tail = 0.01) {
  const pmf = binomialPmf(n, p);
  let above = 1;
  for (let m = 0; m <= n; m++) {
    above -= pmf[m];
    if (above <= tail + 1e-12) return m;
  }
  return n;
}

export function probabilityOf(group) {
  if (group.p != null) return Number(group.p);
  if (group.usesPerHour != null) return Number(group.usesPerHour) * Number(group.seconds) / 3600;
  return Number(group.seconds) / Number(group.everySeconds);
}

export function validateGroups(groups) {
  const errors = [];
  if (!Array.isArray(groups) || groups.length === 0) return ['Add at least one fixture type.'];
  groups.forEach((g, i) => {
    const label = g?.name || `fixture type ${i + 1}`;
    const count = Number(g?.count);
    if (!Number.isInteger(count) || count < 0) errors.push(`${label}: the count must be a whole number, 0 or more.`);
    else if (count > 20000) errors.push(`${label}: ${count} fixtures is more than this tool handles (20,000).`);
    if (!(Number(g?.gpm) > 0) || Number(g?.gpm) > 200) errors.push(`${label}: the flow must be between 0 and 200 gpm.`);
    const p = probabilityOf(g ?? {});
    if (!(p > 0 && p < 1)) errors.push(`${label}: the share of time it runs must be above 0 and below 1 (got ${Number.isFinite(p) ? p.toFixed(4) : 'nothing'}); check seconds per use and how often.`);
  });
  return errors;
}

// Distribution of the total flow, P(total = k * GRID_GPM).
export function flowDistribution(groups) {
  let dist = new Float64Array([1]);
  for (const g of groups) {
    const n = Number(g.count);
    if (n === 0) continue;
    const step = Math.max(1, Math.round(Number(g.gpm) / GRID_GPM));
    const pmf = binomialPmf(n, probabilityOf(g));
    let kmax = n;
    while (kmax > 0 && pmf[kmax] < 1e-16) kmax--;
    const next = new Float64Array(dist.length + kmax * step);
    for (let k = 0; k <= kmax; k++) {
      const w = pmf[k];
      if (w === 0) continue;
      const off = k * step;
      for (let j = 0; j < dist.length; j++) next[off + j] += dist[j] * w;
    }
    dist = next;
  }
  return dist;
}

// Smallest flow F with P(total > F) <= tail. With `truncate`, the
// probability is conditional on at least one fixture flowing (the zero-
// truncated form): demand is then judged only over the instants when water
// is being drawn at all, which matters when fixtures are idle most of the time.
export function percentileFlow(dist, tail = 0.01, truncate = false) {
  const p0 = dist[0];
  const scale = truncate ? 1 - p0 : 1;
  if (scale <= 0) return 0;
  let above = truncate ? 1 - p0 : 1;
  for (let k = 0; k < dist.length; k++) {
    if (!(truncate && k === 0)) above -= dist[k];
    else above = 1 - p0; // P(total > 0)
    if (above / scale <= tail + 1e-12) return round1(k * GRID_GPM);
  }
  return round1((dist.length - 1) * GRID_GPM);
}

const round1 = x => Math.round(x * 10) / 10;

export function demand(groups, { tail = 0.01, truncate = false } = {}) {
  const errors = validateGroups(groups);
  if (!(tail > 0 && tail < 0.5)) errors.push('The exceedance probability must be above 0 and below 0.5 (Hunter used 0.01).');
  if (errors.length) return { errors };
  const active = groups.filter(g => Number(g.count) > 0);
  if (!active.length) return { errors: ['Every fixture count is zero.'] };
  const dist = flowDistribution(active);
  const raw = percentileFlow(dist, tail, truncate);
  const largest = Math.max(...active.map(g => Number(g.gpm)));
  const allAtOnce = round1(active.reduce((a, g) => a + Number(g.count) * Number(g.gpm), 0));
  const mean = active.reduce((a, g) => a + Number(g.count) * Number(g.gpm) * probabilityOf(g), 0);
  const idle = dist[0];
  const perType = active.map(g => {
    const p = probabilityOf(g);
    const m = designCount(Number(g.count), p, tail);
    return { name: g.name, count: Number(g.count), gpm: Number(g.gpm), p, designCount: m, aloneGpm: round1(m * Number(g.gpm)) };
  });
  return {
    errors: [],
    designGpm: Math.max(raw, largest),
    percentileGpm: raw,
    largestFixtureGpm: largest,
    floorApplied: raw < largest,
    allAtOnceGpm: allAtOnce,
    meanGpm: mean,
    idleProbability: idle,
    sumOfTypesAloneGpm: round1(perType.reduce((a, t) => a + t.aloneGpm, 0)),
    perType,
    tail,
    truncate,
  };
}

// Demand against fixture count for one type, the shape of Hunter's curves.
export function demandCurve(group, counts, opts) {
  return counts.map(n => ({ count: n, gpm: demand([{ ...group, count: n }], opts).designGpm }));
}
