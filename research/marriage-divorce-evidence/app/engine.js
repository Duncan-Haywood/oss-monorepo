// In-browser inference for the exported scikit-learn pipelines (no dependencies).
// Reproduces SimpleImputer(median) -> [SplineTransformer] -> [StandardScaler] for numeric
// columns and OneHotEncoder(drop='first', handle_unknown='ignore') for categorical columns,
// then a PoissonRegressor (log link), a binary LogisticRegression or a DecisionTreeRegressor.
// tests/engine.test.mjs checks every model against predictions computed in Python.

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
    // extrapolation='linear': continue each basis from its boundary value and slope.
    const edge = x < lo ? lo : hi;
    const { value, deriv } = bsplineBasis(t, d, edge, interval(t, d, edge));
    out = value.map((v, i) => v + deriv[i] * (x - edge));
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
  num.columns.forEach((col, j) => {
    const raw = row[col];
    const x = raw === null || raw === undefined || Number.isNaN(raw) ? num.impute[j] : Number(raw);
    const feats = num.spline ? splineFeatures(num.spline, j, x) : [x];
    feats.forEach((v) => {
      values.push(v);
      owners.push(col);
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
    const v = row[col] === null || row[col] === undefined ? 'Unknown' : String(row[col]);
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

export function predict(model, row) {
  const { values } = prepare(model, row);
  if (model.kind === 'poisson_glm' || model.kind === 'logistic_glm') {
    let eta = model.intercept;
    for (let i = 0; i < values.length; i++) eta += model.coef[i] * values[i];
    // logistic_glm (binary LogisticRegression) returns a probability, not a rate.
    return model.kind === 'logistic_glm' ? 1 / (1 + Math.exp(-eta)) : Math.exp(eta);
  }
  return model.tree.value[treeLeaf(model.tree, values).node];
}

// Additive (log-rate) contribution of each raw input column, relative to the model's
// reference point (all standardized numerics at their training mean, first category).
// exp(sum of contributions + intercept) equals predict(); for logistic_glm the terms are on
// the log-odds scale and the logistic of that sum equals predict().
export function contributions(model, row) {
  if (model.kind !== 'poisson_glm' && model.kind !== 'logistic_glm') return null;
  const { values, owners } = prepare(model, row);
  const out = {};
  for (let i = 0; i < values.length; i++) {
    out[owners[i]] = (out[owners[i]] || 0) + model.coef[i] * values[i];
  }
  return { intercept: model.intercept, terms: out };
}

export function explainTree(model, row) {
  if (model.kind !== 'tree') return null;
  const { values } = prepare(model, row);
  const { node, path } = treeLeaf(model.tree, values);
  return {
    rate: model.tree.value[node],
    leafSamples: model.tree.n_node_samples[node],
    steps: path.map((p) => ({
      feature: model.feature_names[p.feature],
      threshold: p.threshold,
      left: p.left,
      value: values[p.feature],
    })),
  };
}
