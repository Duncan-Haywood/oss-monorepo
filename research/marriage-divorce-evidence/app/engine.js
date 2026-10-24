// In-browser inference for the exported scikit-learn pipelines (no dependencies).
// Reproduces SimpleImputer(median[, add_indicator]) -> [SplineTransformer] -> [StandardScaler] for numeric
// columns and OneHotEncoder(drop='first', handle_unknown='ignore') for categorical columns,
// then a PoissonRegressor (log link), a binary LogisticRegression (a probability), a logistic
// discrete-time hazard (a rate), a Poisson
// DecisionTreeRegressor, a random forest of Poisson trees or Poisson gradient boosting
// (HistGradientBoostingRegressor); categorical naive Bayes bins raw inputs itself.
// tests/*engine*.test.mjs and tests/nsfg2002*.test.mjs check every model against Python.

// Basis values B_i(x) and first derivatives for a B-spline with knot vector t and degree d,
// on the knot interval m (t[m] <= x <= t[m+1]); matches scipy.interpolate.BSpline.
function bsplineBasis(t, d, x, m) {
  const nb = t.length - d - 1;
  // N[k][i] = degree-k basis i
  let prev = new Array(t.length - 1).fill(0);
  prev[m] = 1;
  let lower = prev;
  for (let k = 1; k <= d; k++) {
    const cur = new Array(t.length - 1 - k).fill(0);
    for (let i = 0; i < cur.length; i++) {
      let v = 0;
      const a = t[i + k] - t[i];
      const b = t[i + k + 1] - t[i + 1];
      if (a > 0) v += ((x - t[i]) / a) * prev[i];
      if (b > 0) v += ((t[i + k + 1] - x) / b) * prev[i + 1];
      cur[i] = v;
    }
    lower = prev;
    prev = cur;
  }
  const value = prev.slice(0, nb);
  const deriv = new Array(nb).fill(0);
  for (let i = 0; i < nb; i++) {
    const a = t[i + d] - t[i];
    const b = t[i + d + 1] - t[i + 1];
    let v = 0;
    if (a > 0) v += (d / a) * lower[i];
    if (b > 0) v -= (d / b) * lower[i + 1];
    deriv[i] = v;
  }
  return { value, deriv };
}

function interval(t, d, x) {
  const nb = t.length - d - 1;
  let m = d;
  while (m < nb - 1 && x >= t[m + 1]) m++;
  return m;
}

export function splineFeatures(spec, j, x) {
  const t = spec.knots[j];
  const d = spec.degree;
  const lo = t[d];
  const hi = t[t.length - d - 1];
  let out;
  if (x < lo || x > hi) {
    // extrapolation='linear': continue each basis from its boundary value and slope;
    // 'constant': hold each basis at its boundary value.
    const edge = x < lo ? lo : hi;
    const { value, deriv } = bsplineBasis(t, d, edge, interval(t, d, edge));
    out = spec.extrapolation === 'constant' ? value : value.map((v, i) => v + deriv[i] * (x - edge));
  } else {
    out = bsplineBasis(t, d, x, interval(t, d, x)).value;
  }
  // include_bias=False drops the last basis function of each feature.
  return spec.include_bias ? out : out.slice(0, out.length - 1);
}

// Transform one raw row into the model's prepared feature vector, remembering which
// raw column produced each position (used for per-input explanations).
export function prepare(model, row) {
  const values = [];
  const owners = [];
  const num = model.numeric;
  // SimpleImputer: medians, then (add_indicator=True) a 0/1 "was missing" column for each
  // input that had missing values in training. Splines and scaling act on all of them.
  const base = [];
  const baseOwners = [];
  const missing = num.columns.map((col) => {
    const raw = row[col];
    return raw === null || raw === undefined || Number.isNaN(raw);
  });
  num.columns.forEach((col, j) => {
    base.push(missing[j] ? num.impute[j] : Number(row[col]));
    baseOwners.push(col);
  });
  for (const j of num.indicator || []) {
    base.push(missing[j] ? 1 : 0);
    baseOwners.push(num.columns[j]);
  }
  base.forEach((x, j) => {
    const feats = num.spline ? splineFeatures(num.spline, j, x) : [x];
    feats.forEach((v) => {
      values.push(v);
      owners.push(baseOwners[j]);
    });
  });
  if (num.scale) {
    for (let i = 0; i < values.length; i++) {
      values[i] = (values[i] - num.scale.mean[i]) / num.scale.scale[i];
    }
  }
  const cat = model.categorical;
  cat.columns.forEach((col, j) => {
    const cats = cat.categories[j];
    const start = cat.drop_first[j] ? 1 : 0;
    let v = row[col] === null || row[col] === undefined ? 'Unknown' : String(row[col]);
    // Optional categorical imputation (SimpleImputer most_frequent on 'Unknown'): a missing
    // or unknown answer takes the training mode instead of a level of its own.
    if (cat.impute && v === 'Unknown') v = cat.impute[j];
    for (let k = start; k < cats.length; k++) {
      values.push(cats[k] === v ? 1 : 0);
      owners.push(col);
    }
  });
  return { values, owners };
}

export function treeLeaf(tree, x) {
  let node = 0;
  const path = [];
  while (tree.left[node] !== -1) {
    const f = tree.feature[node];
    const goLeft = x[f] <= tree.threshold[node];
    path.push({ node, feature: f, threshold: tree.threshold[node], left: goLeft });
    node = goLeft ? tree.left[node] : tree.right[node];
  }
  return { node, path };
}

// Walk a tree with per-node values; returns the leaf and the value change at each split
// (Saabas path attribution: root value + sum of changes = leaf value, exactly).
function walk(tree, x) {
  let node = 0;
  const steps = [];
  while (tree.left[node] !== -1) {
    const f = tree.feature[node];
    const v = x[f];
    const goLeft = Number.isNaN(v) && tree.missing_left ? tree.missing_left[node] : v <= tree.threshold[node];
    const next = goLeft ? tree.left[node] : tree.right[node];
    steps.push({ feature: f, delta: tree.value[next] - tree.value[node] });
    node = next;
  }
  return { node, steps };
}

const probToRate = (eta) => -Math.log1p(-1 / (1 + Math.exp(-eta))); // rate = -log(1 - sigmoid(eta))

// Naive Bayes: per-input log-odds of an event in a marriage-year. Bins are left-closed
// [edge_i, edge_i+1); a missing number is the bin after the last edge; an unseen category
// contributes nothing.
function nbTerms(model, row) {
  const lp = model.feature_log_prob;
  const terms = {};
  model.features.forEach((f, j) => {
    let code;
    if (model.bins[f]) {
      const edges = model.bins[f];
      const raw = row[f];
      if (raw === null || raw === undefined || Number.isNaN(Number(raw))) code = edges.length;
      else {
        code = 0;
        while (code + 1 < edges.length && Number(raw) >= edges[code + 1]) code++;
      }
    } else {
      code = model.categorical[f].indexOf(row[f] === null || row[f] === undefined ? 'Unknown' : String(row[f]));
      if (code < 0) return;
    }
    terms[f] = lp[j][1][code] - lp[j][0][code];
  });
  return { intercept: model.class_log_prior[1] - model.class_log_prior[0], terms };
}

const sumTerms = (c) => Object.values(c.terms).reduce((a, b) => a + b, c.intercept);

export function predict(model, row) {
  if (model.kind === 'naive_bayes') return probToRate(sumTerms(nbTerms(model, row)));
  const { values } = prepare(model, row);
  if (model.kind === 'poisson_glm' || model.kind === 'logistic_glm' || model.kind === 'logistic_hazard') {
    let eta = model.intercept;
    for (let i = 0; i < values.length; i++) eta += model.coef[i] * values[i];
    if (model.kind === 'poisson_glm') return Math.exp(eta);
    // logistic_glm (binary LogisticRegression) returns a probability, not a rate.
    return model.kind === 'logistic_glm' ? 1 / (1 + Math.exp(-eta)) : probToRate(eta);
  }
  if (model.kind === 'forest') {
    let s = 0;
    for (const t of model.trees) s += t.value[walk(t, values).node];
    return s / model.trees.length;
  }
  if (model.kind === 'boosted') {
    let eta = model.baseline;
    for (const t of model.trees) eta += t.value[walk(t, values).node];
    return Math.exp(eta);
  }
  return model.tree.value[treeLeaf(model.tree, values).node];
}

// Exact additive contribution of each raw input column, on the model's own scale:
// - poisson_glm: log rate; exp(intercept + sum) = predict().
// - logistic_glm: log-odds; sigmoid(intercept + sum) = predict(), a probability.
// - logistic_hazard, naive_bayes: log-odds of an event in the year; rate = -log(1 - sigmoid(sum)).
// - forest: rate (mean of per-tree path changes); intercept + sum = predict().
// - boosted: log rate (sum of per-tree path changes); exp(intercept + sum) = predict().
// Relative to each model's reference point (GLMs: standardized numerics at their training
// mean and first categories; trees: the training-average root values). `scale` names it.
export function contributions(model, row) {
  if (model.kind === 'naive_bayes') return { scale: 'hazard_log_odds', ...nbTerms(model, row) };
  if (model.kind === 'tree') return null;
  const { values, owners } = prepare(model, row);
  const out = {};
  const add = (k, v) => { out[k] = (out[k] || 0) + v; };
  if (model.kind === 'forest' || model.kind === 'boosted') {
    let root = 0;
    for (const t of model.trees) {
      root += t.value[0];
      for (const st of walk(t, values).steps) add(owners[st.feature], st.delta);
    }
    if (model.kind === 'forest') {
      for (const k of Object.keys(out)) out[k] /= model.trees.length;
      return { scale: 'rate', intercept: root / model.trees.length, terms: out };
    }
    return { scale: 'log_rate', intercept: model.baseline + root, terms: out };
  }
  for (let i = 0; i < values.length; i++) add(owners[i], model.coef[i] * values[i]);
  const scale = { poisson_glm: 'log_rate', logistic_glm: 'log_odds', logistic_hazard: 'hazard_log_odds' }[model.kind];
  return { scale, intercept: model.intercept, terms: out };
}

// The prediction implied by a contributions() result (inverse of its scale): a rate, or a
// probability for logistic_glm.
export function valueFromContributions(c) {
  const eta = sumTerms(c);
  if (c.scale === 'rate') return eta;
  if (c.scale === 'hazard_log_odds') return probToRate(eta);
  if (c.scale === 'log_odds') return 1 / (1 + Math.exp(-eta));
  return Math.exp(eta);
}

// A split on a standardized (not spline-expanded) numeric input, in the input's own units;
// null for one-hot, indicator and spline features.
export function rawThreshold(model, f, threshold) {
  const num = model.numeric;
  if (num.spline || f >= num.columns.length) return null;
  return num.scale ? threshold * num.scale.scale[f] + num.scale.mean[f] : threshold;
}

export function explainTree(model, row) {
  if (model.kind !== 'tree') return null;
  const { values } = prepare(model, row);
  const { node, path } = treeLeaf(model.tree, values);
  return {
    rate: model.tree.value[node],
    leafSamples: model.tree.n_node_samples[node],
    leaf: node,
    steps: path.map((p) => ({
      feature: model.feature_names[p.feature],
      threshold: p.threshold,
      rawThreshold: rawThreshold(model, p.feature, p.threshold),
      left: p.left,
      value: values[p.feature],
    })),
  };
}

// Distance-to-training-data score (tools/ood.py): squared Mahalanobis distance of a
// profile's fixed inputs from the training people, and its percentile among held-out
// people. `abstain` is true above the bundle's threshold. An unseen category scores as the
// reference level and is reported in `unseen`.
export function oodScore(spec, row) {
  const x = [];
  const unseen = [];
  for (const c of spec.numeric) {
    const v = row[c];
    x.push(v === null || v === undefined || Number.isNaN(Number(v)) ? spec.medians[c] : Number(v));
  }
  for (const c of spec.categorical) {
    const lv = spec.levels[c];
    let v = row[c] === null || row[c] === undefined ? 'Unknown' : String(row[c]);
    if (spec.impute && v === 'Unknown') v = spec.impute[c]; // bundles that map Unknown to the mode
    if (!lv.includes(v)) unseen.push(c);
    for (let k = 1; k < lv.length; k++) x.push(lv[k] === v ? 1 : 0);
  }
  const z = x.map((v, i) => v - spec.mean[i]);
  let d2 = 0;
  for (let i = 0; i < z.length; i++) {
    let s = 0;
    for (let j = 0; j < z.length; j++) s += spec.precision[i][j] * z[j];
    d2 += z[i] * s;
  }
  const { p, d2: q } = spec.heldout_quantiles;
  let percentile;
  if (d2 <= q[0]) percentile = 0;
  else if (d2 >= q[q.length - 1]) percentile = 100;
  else {
    let k = 1;
    while (q[k] < d2) k++;
    const t = q[k] === q[k - 1] ? 1 : (d2 - q[k - 1]) / (q[k] - q[k - 1]);
    percentile = 100 * (p[k - 1] + t * (p[k] - p[k - 1]));
  }
  return { d2, percentile, abstain: percentile > spec.abstain_above_percentile, unseen };
}

// numpy's default (linear) quantile of an unsorted array.
function quantileLinear(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}

// Cumulative dissolution probability by `horizon` years after the wedding for one person,
// with a bootstrap interval when the model ships `bootstrap` coefficient replicates (Poisson
// GLMs). `rowAt(k)` returns the input row for marriage-year k (0 = first year). The interval
// is the model's sampling uncertainty, not the chance element in one marriage.
export function cumulativeRisk(model, rowAt, horizon, level = 0.95) {
  let H = 0;
  const boot = model.bootstrap;
  const Hb = boot ? new Array(boot.replicates).fill(0) : null;
  for (let k = 0; k < horizon; k++) {
    const row = rowAt(k);
    H += predict(model, row);
    if (boot) {
      const { values } = prepare(model, row);
      for (let b = 0; b < boot.replicates; b++) {
        let eta = boot.intercept[b];
        const c = boot.coef[b];
        for (let i = 0; i < values.length; i++) eta += c[i] * values[i];
        Hb[b] += Math.exp(eta);
      }
    }
  }
  const out = { point: 1 - Math.exp(-H) };
  if (boot) {
    const draws = Hb.map((h) => 1 - Math.exp(-h));
    out.lo = quantileLinear(draws, (1 - level) / 2);
    out.hi = quantileLinear(draws, 1 - (1 - level) / 2);
  }
  return out;
}
