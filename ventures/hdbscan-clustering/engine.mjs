// HDBSCAN: which groups are in this table, how many, and which rows belong to
// none of them? (Campello, Moulavi & Sander 2013; outlier scores from
// Campello, Moulavi, Zimek & Sander 2015.) Density-based clustering that does
// not need the number of clusters: it builds the whole hierarchy of
// density-connected groups from a minimum spanning tree of the mutual
// reachability graph, condenses it with a minimum cluster size, and keeps the
// clusters that persist longest (excess of mass). Rows in no dense group are
// labelled noise rather than forced into a cluster.
//
// Pure functions, no DOM, no network, no randomness: the same input always
// gives the same clusters. Implemented from the papers; no third-party code
// was ported. scikit-learn 1.9.1's HDBSCAN and the hdbscan 0.8.44 package
// (both BSD-3) were used only to produce eval/reference.json, which the tests
// compare against. Where the papers leave a choice open the engine follows
// the conventions those libraries document (min_samples counts the point
// itself; lambda = 1 / distance; the root is never selected by default), so
// the labels can be checked one for one.

export const PAPERS = [
  {
    authors: "Ricardo J. G. B. Campello, Davoud Moulavi, Joerg Sander",
    title: "Density-Based Clustering Based on Hierarchical Density Estimates",
    venue: "Advances in Knowledge Discovery and Data Mining (PAKDD 2013), Lecture Notes in Computer Science 7819, 160-172",
    year: 2013,
    url: "https://doi.org/10.1007/978-3-642-37456-2_14",
    doi: "10.1007/978-3-642-37456-2_14",
    implemented:
      "Core distance (distance to the min_samples-th nearest row, counting the row itself), mutual reachability distance max(core(a), core(b), d(a, b)), its minimum spanning tree (Prim's algorithm on the complete graph), the single-linkage hierarchy from the sorted tree, the condensed tree with a minimum cluster size (a split is real only when both sides have at least that many rows; otherwise the smaller side falls out as points), cluster stability sum over member rows of (lambda_p - lambda_birth) with lambda = 1 / distance, and the excess-of-mass selection of the most stable non-overlapping clusters.",
    deviations:
      "Following scikit-learn: the root cluster (all rows) is not selectable unless allow_single_cluster is set, and min_samples defaults to min_cluster_size. Spanning-tree edges of equal weight are merged in a stable order (the order Prim's algorithm found them); scikit-learn's unstable sort can merge them in another order, which moved between 0 and 96 of 300 labels on the reference data (most in 'leaf' selection). With scikit-learn's sort made stable, every label agrees. Rows with a missing value are dropped, not imputed.",
  },
  {
    authors: "Ricardo J. G. B. Campello, Davoud Moulavi, Arthur Zimek, Joerg Sander",
    title: "Hierarchical Density Estimates for Data Clustering, Visualization, and Outlier Detection",
    venue: "ACM Transactions on Knowledge Discovery from Data 10(1), article 5",
    year: 2015,
    url: "https://doi.org/10.1145/2733381",
    doi: "10.1145/2733381",
    implemented:
      "GLOSH outlier scores: 1 - lambda_p / lambda_max, where lambda_p is the density level at which the row leaves the condensed tree and lambda_max the highest density level reached anywhere below the cluster it leaves; 0 for rows at the densest point of their cluster, near 1 for rows far from any dense region. Also the journal version's statement of the method above.",
    deviations:
      "Where lambda_max is infinite (duplicate rows at distance 0 below the cluster) a row with a finite lambda scores 1 and one with an infinite lambda scores 0; the hdbscan package returns NaN there.",
  },
  {
    authors: "Leland McInnes, John Healy",
    title: "Accelerated Hierarchical Density Based Clustering",
    venue: "2017 IEEE International Conference on Data Mining Workshops (ICDMW), 33-42",
    year: 2017,
    url: "https://doi.org/10.1109/ICDMW.2017.12",
    doi: "10.1109/ICDMW.2017.12",
    implemented:
      "The membership strength of a clustered row, lambda_p / lambda_max over the cluster's direct children (1 at the cluster's densest rows), and the 'leaf' selection, which keeps the leaves of the condensed cluster tree for many small, homogeneous clusters.",
    deviations:
      "The paper's dual-tree Boruvka minimum spanning tree is not implemented: the engine uses an O(n^2) Prim loop, which is exact and fast enough for the 10,000-row limit in a browser tab.",
  },
];

export const DEFAULTS = {
  minClusterSize: 5, // scikit-learn's default
  minSamples: null, // null: same as minClusterSize
  method: "eom", // "eom" (excess of mass) or "leaf"
  allowSingleCluster: false,
  scale: "standard", // "standard" (z-score), "robust" (median / IQR) or "none"
  top: 10,
};

export const MAX_ROWS = 10000;

// ---------------------------------------------------------------- distances

function sqDist(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k];
    s += d * d;
  }
  return s;
}

/** k-th smallest (0-based) of a Float64Array, in place (Hoare quickselect). */
function select(arr, k) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const pivot = arr[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (arr[i] < pivot) i++;
      while (arr[j] > pivot) j--;
      if (i <= j) {
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        i++; j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return arr[k];
  }
  return arr[k];
}

/**
 * Core distance of every row: the Euclidean distance to its minSamples-th
 * nearest row, counting the row itself as the first (scikit-learn's
 * convention), so minSamples = 1 gives 0 for every row.
 */
export function coreDistances(X, minSamples) {
  const n = X.length;
  const out = new Float64Array(n);
  const buf = new Float64Array(n);
  const k = minSamples - 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) buf[j] = i === j ? 0 : sqDist(X[i], X[j]);
    out[i] = Math.sqrt(select(buf, k));
  }
  return out;
}

/**
 * Minimum spanning tree of the mutual reachability graph, by Prim's algorithm
 * on the complete graph (no adjacency matrix is stored). Returns n - 1 edges
 * { a, b, w } in the order Prim adds them.
 */
export function mutualReachabilityMst(X, core) {
  const n = X.length;
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n);
  const edges = [];
  let current = 0;
  for (let step = 0; step < n - 1; step++) {
    inTree[current] = 1;
    const cc = core[current];
    let nextW = Infinity, nextNode = -1;
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const d = Math.sqrt(sqDist(X[current], X[j]));
      const w = Math.max(cc, core[j], d);
      if (w < best[j]) {
        best[j] = w;
        from[j] = current;
      }
      if (best[j] < nextW || nextNode < 0) {
        nextW = best[j];
        nextNode = j;
      }
    }
    edges.push({ a: from[nextNode], b: nextNode, w: nextW });
    current = nextNode;
  }
  return edges;
}

/**
 * Single-linkage dendrogram from the spanning tree: edges sorted by weight
 * (stable), merged with a union-find. Row i of the result merges clusters
 * `left` and `right` at distance `dist` into new cluster n + i of `size` rows.
 */
export function singleLinkage(edges, n) {
  const order = edges.map((_, i) => i).sort((p, q) => edges[p].w - edges[q].w || p - q);
  const parent = new Int32Array(2 * n - 1).map((_, i) => i);
  const size = new Int32Array(2 * n - 1).fill(1);
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
    return r;
  };
  const left = new Int32Array(n - 1), right = new Int32Array(n - 1), sizes = new Int32Array(n - 1);
  const dist = new Float64Array(n - 1);
  order.forEach((e, i) => {
    const a = find(edges[e].a), b = find(edges[e].b);
    const id = n + i;
    left[i] = a; right[i] = b; dist[i] = edges[e].w;
    sizes[i] = size[a] + size[b];
    parent[a] = id; parent[b] = id; size[id] = sizes[i];
  });
  return { n, left, right, dist, sizes };
}

/**
 * Condense the dendrogram with a minimum cluster size. Returns parallel arrays
 * parent, child, lambda, size: a child below n is a row that leaves `parent`
 * at density level lambda (= 1 / distance); a child of n or more is a new
 * cluster born at lambda with `size` rows. The root cluster is n.
 */
export function condenseTree(link, minClusterSize) {
  const { n, left, right, dist, sizes } = link;
  const root = 2 * n - 2;
  const count = (node) => (node < n ? 1 : sizes[node - n]);
  const relabel = new Int32Array(2 * n - 1);
  relabel[root] = n;
  let nextLabel = n + 1;
  const ignore = new Uint8Array(2 * n - 1);
  const parent = [], child = [], lambda = [], size = [];
  const push = (p, c, l, s) => { parent.push(p); child.push(c); lambda.push(l); size.push(s); };
  // Breadth-first order over the dendrogram, left before right.
  const bfs = (start) => {
    const out = [];
    let queue = [start];
    while (queue.length) {
      out.push(...queue);
      const next = [];
      for (const x of queue) if (x >= n) next.push(left[x - n], right[x - n]);
      queue = next;
    }
    return out;
  };
  const dropPoints = (sub, p, l) => {
    for (const s of bfs(sub)) {
      if (s < n) push(p, s, l, 1);
      ignore[s] = 1;
    }
  };
  for (const node of bfs(root)) {
    if (ignore[node] || node < n) continue;
    const i = node - n;
    const l = left[i], r = right[i];
    const lam = dist[i] > 0 ? 1 / dist[i] : Infinity;
    const lc = count(l), rc = count(r);
    const p = relabel[node];
    if (lc >= minClusterSize && rc >= minClusterSize) {
      relabel[l] = nextLabel++;
      push(p, relabel[l], lam, lc);
      relabel[r] = nextLabel++;
      push(p, relabel[r], lam, rc);
    } else if (lc < minClusterSize && rc < minClusterSize) {
      dropPoints(l, p, lam);
      dropPoints(r, p, lam);
    } else if (lc < minClusterSize) {
      relabel[r] = p;
      dropPoints(l, p, lam);
    } else {
      relabel[l] = p;
      dropPoints(r, p, lam);
    }
  }
  return { n, parent, child, lambda, size };
}

/** Stability of every cluster: sum over its rows (and child clusters) of (lambda_leave - lambda_birth) x size. */
export function clusterStability(tree) {
  const { n, parent, child, lambda, size } = tree;
  const birth = new Map([[n, 0]]);
  for (let i = 0; i < child.length; i++) if (child[i] >= n) birth.set(child[i], lambda[i]);
  const stab = new Map();
  for (let i = 0; i < parent.length; i++) {
    const p = parent[i];
    stab.set(p, (stab.get(p) || 0) + (lambda[i] - birth.get(p)) * size[i]);
  }
  return stab;
}

/** Choose the flat clustering: excess of mass ("eom") or the leaves of the cluster tree ("leaf"). Returns a sorted array of cluster ids. */
export function selectClusters(tree, stability, method = "eom", allowSingleCluster = false) {
  const { n, parent, child } = tree;
  const kids = new Map();
  for (let i = 0; i < child.length; i++) {
    if (child[i] < n) continue;
    if (!kids.has(parent[i])) kids.set(parent[i], []);
    kids.get(parent[i]).push(child[i]);
  }
  const ids = [...stability.keys()].sort((a, b) => b - a); // children before parents
  const nodes = allowSingleCluster ? ids : ids.filter((c) => c !== n);
  const chosen = new Map(nodes.map((c) => [c, true]));
  if (method === "leaf") {
    const leaves = nodes.filter((c) => !kids.has(c));
    for (const c of nodes) chosen.set(c, false);
    if (leaves.length) for (const c of leaves) chosen.set(c, true);
    else if (allowSingleCluster) chosen.set(n, true);
  } else {
    const stab = new Map(stability);
    const descendants = (c) => {
      const out = [];
      const stack = [...(kids.get(c) || [])];
      while (stack.length) {
        const x = stack.pop();
        out.push(x);
        stack.push(...(kids.get(x) || []));
      }
      return out;
    };
    for (const c of nodes) {
      const sub = (kids.get(c) || []).reduce((s, k) => s + stab.get(k), 0);
      if (sub > stab.get(c)) {
        chosen.set(c, false);
        stab.set(c, sub);
      } else {
        for (const d of descendants(c)) chosen.set(d, false);
      }
    }
  }
  return [...chosen].filter(([, v]) => v).map(([c]) => c).sort((a, b) => a - b);
}

/**
 * Labels (cluster index, or -1 for noise), membership strength and GLOSH
 * outlier score of every row, from the condensed tree and the chosen clusters.
 */
export function labelRows(tree, clusters, allowSingleCluster = false) {
  const { n, parent, child, lambda } = tree;
  const chosen = new Set(clusters);
  const index = new Map(clusters.map((c, i) => [c, i]));
  const maxId = Math.max(n, ...parent, ...child);
  const up = new Int32Array(maxId + 1).fill(-1); // a node's parent in the condensed tree
  for (let i = 0; i < child.length; i++) up[child[i]] = parent[i];
  // A row's cluster: climb until a chosen cluster or the root.
  const owner = (x) => {
    let c = up[x];
    while (c !== n && !chosen.has(c)) c = up[c];
    return c;
  };
  const leaveLambda = new Float64Array(n);
  const leaveFrom = new Int32Array(n);
  for (let i = 0; i < child.length; i++) if (child[i] < n) { leaveLambda[child[i]] = lambda[i]; leaveFrom[child[i]] = parent[i]; }

  // Highest lambda among each cluster's direct children (membership) and
  // anywhere below it (GLOSH).
  const directMax = new Float64Array(maxId + 1);
  for (let i = 0; i < child.length; i++) directMax[parent[i]] = Math.max(directMax[parent[i]], lambda[i]);
  const deepMax = Float64Array.from(directMax);
  for (let c = maxId; c > n; c--) if (up[c] >= 0) deepMax[up[c]] = Math.max(deepMax[up[c]], deepMax[c]);

  const labels = new Int32Array(n).fill(-1);
  const strength = new Float64Array(n);
  const outlier = new Float64Array(n);
  let rootThreshold = 0;
  if (allowSingleCluster && chosen.size === 1 && chosen.has(n)) rootThreshold = directMax[n];
  for (let p = 0; p < n; p++) {
    const c = owner(p);
    if (c !== n) labels[p] = index.get(c);
    else if (chosen.has(n) && chosen.size === 1 && leaveLambda[p] >= rootThreshold) labels[p] = index.get(n);
    if (labels[p] >= 0) {
      const cl = clusters[labels[p]];
      const m = directMax[cl];
      strength[p] = m === 0 || !Number.isFinite(leaveLambda[p]) ? 1 : Math.min(leaveLambda[p], m) / m;
    }
    const lm = deepMax[leaveFrom[p]];
    const lp = leaveLambda[p];
    if (lm === 0 || !Number.isFinite(lp)) outlier[p] = 0;
    else if (!Number.isFinite(lm)) outlier[p] = 1;
    else outlier[p] = (lm - lp) / lm;
  }
  return { labels, strength, outlier };
}

/**
 * The whole method on a numeric matrix (rows of equal length, already
 * scaled). Options: minClusterSize, minSamples, method, allowSingleCluster.
 */
export function hdbscan(X, opts = {}) {
  const n = X.length;
  const minClusterSize = opts.minClusterSize ?? DEFAULTS.minClusterSize;
  const minSamples = opts.minSamples ?? minClusterSize;
  const method = opts.method ?? DEFAULTS.method;
  const allowSingleCluster = Boolean(opts.allowSingleCluster);
  if (n < 2) throw new Error("need at least two rows");
  if (minSamples > n) throw new Error(`minSamples (${minSamples}) must be at most the number of rows (${n})`);
  const core = coreDistances(X, minSamples);
  const mst = mutualReachabilityMst(X, core);
  const link = singleLinkage(mst, n);
  const tree = condenseTree(link, minClusterSize);
  const stability = clusterStability(tree);
  const clusters = selectClusters(tree, stability, method, allowSingleCluster);
  const { labels, strength, outlier } = labelRows(tree, clusters, allowSingleCluster);
  // Births and a normalised persistence for each chosen cluster.
  const birth = new Map([[n, 0]]);
  for (let i = 0; i < tree.child.length; i++) if (tree.child[i] >= n) birth.set(tree.child[i], tree.lambda[i]);
  return {
    labels: Array.from(labels),
    probabilities: Array.from(strength),
    outlierScores: Array.from(outlier),
    clusters: clusters.map((c) => ({ id: c, stability: stability.get(c), birthLambda: birth.get(c) })),
    coreDistances: Array.from(core),
    mst,
    tree,
    params: { minClusterSize, minSamples, method, allowSingleCluster },
  };
}

/** Adjusted Rand index between two labelings (noise -1 counts as its own label). */
export function adjustedRand(a, b) {
  const n = a.length;
  const key = (x, y) => `${x}|${y}`;
  const nij = new Map(), ai = new Map(), bj = new Map();
  for (let i = 0; i < n; i++) {
    nij.set(key(a[i], b[i]), (nij.get(key(a[i], b[i])) || 0) + 1);
    ai.set(a[i], (ai.get(a[i]) || 0) + 1);
    bj.set(b[i], (bj.get(b[i]) || 0) + 1);
  }
  const c2 = (x) => (x * (x - 1)) / 2;
  let sij = 0, sa = 0, sb = 0;
  for (const v of nij.values()) sij += c2(v);
  for (const v of ai.values()) sa += c2(v);
  for (const v of bj.values()) sb += c2(v);
  const expected = (sa * sb) / c2(n);
  const max = (sa + sb) / 2;
  return max === expected ? 1 : (sij - expected) / (max - expected);
}

// --------------------------------------------------------------------- CSV

const isMissing = (s) => /^\s*(|na|n\/a|nan|null|none|\?|-)\s*$/i.test(String(s ?? ""));
const numText = (s) => String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,%\s]/g, "");
const isNum = (s) => {
  const t = numText(s);
  return t !== "" && Number.isFinite(Number(t));
};

function splitLine(line, delim) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse a delimited table with a header row (comma, tab or semicolon). Headerless numeric tables get c1, c2, ... */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row and at least two numeric columns." };
  const delim = ["\t", ";", ","].map((dl) => [dl, splitLine(lines[0], dl).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  let columns, start = 1, headerless = false;
  if (cells[0].every((c) => isNum(c) || isMissing(c))) {
    columns = cells[0].map((_, i) => `c${i + 1}`);
    start = 0;
    headerless = true;
  } else {
    columns = cells[0].map((c, i) => c || `c${i + 1}`);
    const seen = new Set();
    for (const c of columns) {
      if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
      seen.add(c);
    }
  }
  const rows = [];
  for (let i = start; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push(cells[i]);
  }
  if (!rows.length) return { error: "The CSV has a header but no data rows." };
  return { columns, rows, headerless, delimiter: delim };
}

const ID_NAME = /^(#|id|.*[ _-]id|index|row|row ?number|record|year)$/i;

/** Describe each column: numeric, missing cells, distinct values, and whether it looks like an ID, a year or a category code. */
export function profileColumns(parsed) {
  return parsed.columns.map((name, j) => {
    const cells = parsed.rows.map((r) => r[j]);
    const present = cells.filter((c) => !isMissing(c));
    const numeric = present.length > 0 && present.every(isNum);
    const values = numeric ? present.map((c) => Number(numText(c))) : [];
    const distinct = new Set(numeric ? values : present).size;
    const integer = numeric && values.every(Number.isInteger);
    const increasing = integer && values.length > 2 && values.every((v, i) => i === 0 || v > values[i - 1]);
    const idLike = ID_NAME.test(name.trim()) || increasing;
    const code = integer && !idLike && distinct <= 3 && present.length >= 10;
    return { name, numeric, missing: cells.length - present.length, distinct, idLike, code };
  });
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo]);
}

/** Scale each column: "standard" (mean 0, population SD 1, as scikit-learn's StandardScaler), "robust" (median 0, IQR 1) or "none". */
export function scaleColumns(X, mode = "standard") {
  const d = X[0]?.length ?? 0;
  const center = new Array(d).fill(0), spread = new Array(d).fill(1);
  if (mode !== "none") {
    for (let f = 0; f < d; f++) {
      const col = X.map((r) => r[f]);
      if (mode === "robust") {
        const s = [...col].sort((a, b) => a - b);
        center[f] = median(s);
        const iqr = quantile(s, 0.75) - quantile(s, 0.25);
        spread[f] = iqr > 0 ? iqr : 1;
      } else {
        const m = col.reduce((a, b) => a + b, 0) / col.length;
        const sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length);
        center[f] = m;
        spread[f] = sd > 0 ? sd : 1;
      }
    }
  }
  return { Z: X.map((r) => r.map((v, f) => (v - center[f]) / spread[f])), center, spread };
}

/** First two principal components of a scaled matrix (power iteration with deflation), for the scatter plot. */
export function project2d(Z) {
  const n = Z.length, d = Z[0].length;
  if (d === 1) return { coords: Z.map((r) => [r[0], 0]), explained: [1, 0] };
  const mean = new Array(d).fill(0);
  for (const r of Z) for (let f = 0; f < d; f++) mean[f] += r[f] / n;
  const C = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const r of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += ((r[i] - mean[i]) * (r[j] - mean[j])) / n;
  const total = C.reduce((s, row, i) => s + row[i], 0) || 1;
  const comps = [], vals = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: d }, (_, i) => 1 / Math.sqrt(d) + (i === c ? 0.5 : 0));
    let lam = 0;
    for (let it = 0; it < 500; it++) {
      const w = C.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const norm = Math.hypot(...w);
      if (!(norm > 0)) break;
      const nv = w.map((x) => x / norm);
      const delta = Math.hypot(...nv.map((x, i) => x - v[i]));
      v = nv;
      lam = norm;
      if (delta < 1e-12) break;
    }
    // Sign: largest loading positive, so the picture does not flip between runs.
    const big = v.reduce((bi, x, i) => (Math.abs(x) > Math.abs(v[bi]) ? i : bi), 0);
    if (v[big] < 0) v = v.map((x) => -x);
    comps.push(v);
    vals.push(lam);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] -= lam * v[i] * v[j];
  }
  const coords = Z.map((r) => comps.map((v) => v.reduce((s, x, j) => s + x * (r[j] - mean[j]), 0)));
  return { coords, explained: vals.map((l) => l / total), components: comps };
}

const listOf = (v) => (Array.isArray(v) ? v.map(String) : String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-3)) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1)) + 1))).toLocaleString("en-US", { maximumFractionDigits: 6 });
};

/** One CSV cell, with a spreadsheet formula-injection guard on text that starts with = + - @ tab or CR. */
export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const pct = (k, n) => `${((100 * k) / n).toFixed(1)}%`;

function intOpt(v, name, min, max) {
  const x = Number(v);
  if (!Number.isInteger(x) || x < min || x > max) return { error: `${name} must be a whole number from ${min} to ${max.toLocaleString("en-US")}.` };
  return { value: x };
}

/**
 * Cluster the rows of a table. Input: { csv | rows (array of objects, or of
 * arrays with `columnNames`), columns? (features to use), labelColumn?,
 * minClusterSize?, minSamples?, method? ("eom" | "leaf"),
 * allowSingleCluster?, scale? ("standard" | "robust" | "none"), top? }.
 * Returns each row's cluster, membership strength and outlier score, a
 * profile of every cluster, the strongest outliers and a plain-language
 * summary; { error } when the input cannot be clustered.
 */
export function analyze(input = {}) {
  const warnings = [];
  let parsed;
  if (Array.isArray(input.rows)) {
    if (!input.rows.length) return { error: "rows is empty." };
    if (Array.isArray(input.rows[0])) {
      const columns = Array.isArray(input.columnNames) ? input.columnNames.map(String) : input.rows[0].map((_, i) => `c${i + 1}`);
      parsed = { columns, rows: input.rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v)))) };
    } else {
      const columns = Object.keys(input.rows[0]);
      parsed = { columns, rows: input.rows.map((o) => columns.map((c) => (o[c] === null || o[c] === undefined ? "" : String(o[c])))) };
    }
  } else {
    parsed = parseCsv(input.csv);
    if (parsed.error) return { error: parsed.error };
  }
  const prof = profileColumns(parsed);
  const byName = new Map(prof.map((p, j) => [p.name, j]));

  let features;
  const asked = listOf(input.columns);
  if (asked.length) {
    for (const c of asked) {
      if (!byName.has(c)) return { error: `There is no column "${c}". Columns: ${parsed.columns.join(", ")}.` };
      if (!prof[byName.get(c)].numeric) return { error: `Column "${c}" is not numeric, so it cannot be used as a feature.` };
    }
    features = [...new Set(asked.map((c) => byName.get(c)))];
  } else {
    features = prof.map((p, j) => (p.numeric && !p.idLike && !p.code ? j : -1)).filter((j) => j >= 0);
    const skipped = prof.filter((p) => p.numeric && (p.idLike || p.code));
    if (skipped.length) warnings.push(`Left out ${skipped.map((p) => `"${p.name}" (${p.idLike ? "looks like an ID or a year" : `a code with ${p.distinct} values`})`).join(", ")}. Choose the columns yourself to include ${skipped.length === 1 ? "it" : "them"}.`);
    const text = prof.filter((p) => !p.numeric);
    if (text.length) warnings.push(`Text column${text.length === 1 ? "" : "s"} ${text.map((p) => `"${p.name}"`).join(", ")} ${text.length === 1 ? "is" : "are"} not used to cluster; they are kept to describe the clusters.`);
  }
  if (!features.length) return { error: "No numeric columns to cluster. The tool needs at least one column of numbers." };

  let labelIdx = -1;
  if (input.labelColumn) {
    if (!byName.has(String(input.labelColumn))) return { error: `There is no column "${input.labelColumn}" to use as the row label.` };
    labelIdx = byName.get(String(input.labelColumn));
  } else {
    labelIdx = prof.findIndex((p) => p.idLike && !p.code && !/^year$/i.test(p.name));
  }
  const lineOffset = parsed.headerless ? 1 : 2;
  const names = features.map((j) => parsed.columns[j]);

  // Rows with a missing feature are left out (density has no sensible fill).
  const kept = [], dropped = [];
  parsed.rows.forEach((r, i) => (features.some((j) => isMissing(r[j])) ? dropped : kept).push(i));
  if (dropped.length) warnings.push(`${plural(dropped.length, "row")} with a missing value in a feature column ${dropped.length === 1 ? "was" : "were"} left out (line${dropped.length === 1 ? "" : "s"} ${dropped.slice(0, 8).map((i) => i + lineOffset).join(", ")}${dropped.length > 8 ? ", ..." : ""}).`);
  const n = kept.length;
  if (n > MAX_ROWS) return { error: `${n.toLocaleString("en-US")} rows is more than this page clusters (${MAX_ROWS.toLocaleString("en-US")}); the method is O(n^2). Take a random sample, or use scikit-learn's HDBSCAN for large tables.` };
  const X = kept.map((i) => features.map((j) => Number(numText(parsed.rows[i][j]))));
  const labelsText = kept.map((i, k) => (labelIdx >= 0 && !isMissing(parsed.rows[i][labelIdx]) ? parsed.rows[i][labelIdx] : `row ${i + 1}`));

  const mcs = intOpt(input.minClusterSize ?? DEFAULTS.minClusterSize, "minClusterSize", 2, MAX_ROWS);
  if (mcs.error) return { error: mcs.error };
  const minClusterSize = mcs.value;
  let minSamples = minClusterSize;
  if (input.minSamples !== undefined && input.minSamples !== null && input.minSamples !== "") {
    const ms = intOpt(input.minSamples, "minSamples", 1, MAX_ROWS);
    if (ms.error) return { error: ms.error };
    minSamples = ms.value;
  }
  const method = String(input.method ?? DEFAULTS.method).toLowerCase();
  if (method !== "eom" && method !== "leaf") return { error: 'method must be "eom" (excess of mass, the default) or "leaf".' };
  const scale = String(input.scale ?? DEFAULTS.scale).toLowerCase();
  if (!["standard", "robust", "none"].includes(scale)) return { error: 'scale must be "standard", "robust" or "none".' };
  const allowSingleCluster = input.allowSingleCluster === true || input.allowSingleCluster === "true";
  const top = Math.max(1, Math.floor(Number(input.top ?? DEFAULTS.top)) || DEFAULTS.top);

  if (n < Math.max(2 * minClusterSize, 4)) return { error: `Only ${plural(n, "complete row")}. With a minimum cluster size of ${minClusterSize}, at least ${Math.max(2 * minClusterSize, 4)} rows are needed for two clusters.` };
  if (minSamples > n) return { error: `minSamples (${minSamples}) is more than the ${plural(n, "row")} to cluster.` };
  const constant = names.filter((_, f) => X.every((x) => x[f] === X[0][f]));
  if (constant.length === names.length) return { error: "Every feature column holds a single value in every row, so there is nothing to group." };
  if (constant.length) warnings.push(`${constant.map((c) => `"${c}"`).join(", ")} ${constant.length === 1 ? "has" : "have"} the same value in every row and cannot help.`);
  if (scale === "none" && names.length > 1) {
    const sds = names.map((_, f) => { const c = X.map((r) => r[f]); const m = c.reduce((a, b) => a + b, 0) / n; return Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / n); }).filter((s) => s > 0);
    if (Math.max(...sds) / Math.min(...sds) > 10) warnings.push("Columns are unscaled and their spreads differ more than tenfold, so the widest column decides the distances. Use scale \"standard\" unless that is what you want.");
  }

  const { Z, center, spread } = scaleColumns(X, scale);
  const fit = hdbscan(Z, { minClusterSize, minSamples, method, allowSingleCluster });
  const k = fit.clusters.length;
  const labels = fit.labels;
  const noiseIdx = labels.map((l, i) => (l < 0 ? i : -1)).filter((i) => i >= 0);

  // Describe each cluster against the whole table: median of each column and
  // how far it sits from the overall median, in robust SDs (1.4826 x MAD).
  const overall = names.map((_, f) => {
    const s = X.map((r) => r[f]).sort((a, b) => a - b);
    const m = median(s);
    const mad = 1.4826 * median(s.map((v) => Math.abs(v - m)).sort((a, b) => a - b));
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - s.reduce((x, y) => x + y, 0) / n) ** 2, 0) / n);
    return { median: m, scale: mad > 0 ? mad : sd > 0 ? sd : 1 };
  });
  const textCols = prof.map((p, j) => ((!p.numeric || p.code) && p.distinct <= 12 && j !== labelIdx && !features.includes(j) ? j : -1)).filter((j) => j >= 0);
  const describeGroup = (idx) => {
    const cols = names.map((name, f) => {
      const s = idx.map((i) => X[i][f]).sort((a, b) => a - b);
      const m = median(s);
      return { column: name, median: m, min: s[0], max: s[s.length - 1], shift: (m - overall[f].median) / overall[f].scale };
    });
    const distinguishing = [...cols].filter((c) => Math.abs(c.shift) >= 0.5).sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)).slice(0, 3);
    // Make-up of the group by each text or code column with few values (at most 12): the three commonest values.
    const mostly = [];
    for (const j of textCols) {
      const counts = new Map();
      for (const i of idx) { const v = parsed.rows[kept[i]][j]; if (!isMissing(v)) counts.set(v, (counts.get(v) || 0) + 1); }
      const top3 = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 3);
      if (top3.length) mostly.push({ column: parsed.columns[j], values: top3.map(([value, count]) => ({ value, count, share: count / idx.length })) });
    }
    return { columns: cols, distinguishing, mostly };
  };
  const clusters = fit.clusters.map((c, ci) => {
    const idx = labels.map((l, i) => (l === ci ? i : -1)).filter((i) => i >= 0);
    // Exemplar: the member with the highest membership strength, ties to the lowest outlier score.
    const ex = idx.reduce((b, i) => (fit.probabilities[i] > fit.probabilities[b] || (fit.probabilities[i] === fit.probabilities[b] && fit.outlierScores[i] < fit.outlierScores[b]) ? i : b), idx[0]);
    const meanStrength = idx.reduce((s, i) => s + fit.probabilities[i], 0) / idx.length;
    return { label: ci, size: idx.length, share: idx.length / n, stability: c.stability, meanStrength, exemplar: { index: ex, label: labelsText[ex], line: kept[ex] + lineOffset }, ...describeGroup(idx) };
  });
  const noise = noiseIdx.length ? describeGroup(noiseIdx) : null;

  const order = labels.map((_, i) => i).sort((a, b) => fit.outlierScores[b] - fit.outlierScores[a] || a - b);
  const outliers = order.slice(0, Math.min(top, n)).map((i) => ({
    index: i, line: kept[i] + lineOffset, label: labelsText[i], cluster: labels[i], score: fit.outlierScores[i],
    standsOut: names.map((name, f) => ({ column: name, value: X[i][f], z: (X[i][f] - overall[f].median) / overall[f].scale })).filter((x) => Math.abs(x.z) >= 2).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3),
  }));

  // Plain-language summary.
  const describeShift = (c) => c.distinguishing.map((d) => `${d.shift > 0 ? "high" : "low"} ${d.column} (median ${fmt(d.median)})`).join(", ");
  let summary;
  if (!k) {
    summary = `No cluster of ${minClusterSize} or more rows stands out from the rest: all ${plural(n, "row")} are noise at these settings. Try a smaller minimum cluster size or minSamples, or allow a single cluster.`;
  } else {
    const sorted = [...clusters].sort((a, b) => b.size - a.size);
    summary = `Found ${plural(k, "cluster")} in ${plural(n, "row")}, plus ${plural(noiseIdx.length, "noise row")} (${pct(noiseIdx.length, n)}) that belong to none. `;
    summary += sorted.slice(0, 4).map((c) => `Cluster ${c.label + 1}: ${plural(c.size, "row")}${c.distinguishing.length ? `, ${describeShift(c)}` : ""}${c.mostly.length ? `; ${c.mostly[0].column} ${c.mostly[0].values.map((v) => `${v.value} ${v.count}`).join(", ")}` : ""}.`).join(" ");
    if (k > 4) summary += ` ${plural(k - 4, "smaller cluster")} more below.`;
    if (k === 1 && !allowSingleCluster) summary += " Only one group is dense enough to stand apart from the others' noise.";
  }

  return {
    n,
    features: names,
    labelColumn: labelIdx >= 0 ? parsed.columns[labelIdx] : null,
    params: { ...fit.params, scale },
    clusterCount: k,
    noiseCount: noiseIdx.length,
    labels,
    probabilities: fit.probabilities,
    outlierScores: fit.outlierScores,
    rowLabels: labelsText,
    lines: kept.map((i) => i + lineOffset),
    clusters,
    noise,
    outliers,
    projection: project2d(Z),
    matrix: X,
    scaling: { center, spread },
    warnings,
    summary,
  };
}

/** The result as CSV: every clustered row's label, cluster (blank for noise), membership and outlier score. */
export function toCsv(result) {
  const lines = ["label,line,cluster,membership,outlier_score"];
  for (let i = 0; i < result.n; i++) lines.push([result.rowLabels[i], result.lines[i], result.labels[i] < 0 ? "noise" : result.labels[i] + 1, result.probabilities[i].toFixed(6), result.outlierScores[i].toFixed(6)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
