// Maximum-weight matching in a general graph: Edmonds' blossom algorithm with dual variables,
// O(n^3). Written for the Swiss pairer (swiss.mjs), where a whole round is paired at once: every
// allowed pairing is an edge, its weight says how good the pairing is, and the best round is the
// heaviest perfect matching. No package dependencies.
//
// The structure follows the standard primal-dual presentation (Galil, "Efficient algorithms for
// finding maximum matching in graphs", ACM Computing Surveys 1986), with S/T labels, nested
// blossoms, least-slack edges kept per blossom, and four kinds of dual change.
//
// maxWeightMatching(n, edges, { maxCardinality }) -> mate: mate[v] is v's partner or -1.
// edges: [[i, j, w], ...] with 0 <= i, j < n, i != j. Integer weights keep every dual exact.

export function maxWeightMatching(n, edges, { maxCardinality = false } = {}) {
  if (!edges.length || n < 2) return new Array(Math.max(0, n)).fill(-1);
  const nedge = edges.length;
  let maxweight = 0;
  for (const [, , w] of edges) if (w > maxweight) maxweight = w;
  const endpoint = new Array(2 * nedge);
  for (let k = 0; k < nedge; k++) { endpoint[2 * k] = edges[k][0]; endpoint[2 * k + 1] = edges[k][1]; }
  const neighbend = Array.from({ length: n }, () => []);
  for (let k = 0; k < nedge; k++) {
    const [i, j] = edges[k];
    neighbend[i].push(2 * k + 1);
    neighbend[j].push(2 * k);
  }
  const mate = new Array(n).fill(-1);
  const label = new Array(2 * n).fill(0);
  const labelend = new Array(2 * n).fill(-1);
  const inblossom = Array.from({ length: n }, (_, i) => i);
  const blossomparent = new Array(2 * n).fill(-1);
  const blossomchilds = new Array(2 * n).fill(null);
  const blossombase = Array.from({ length: 2 * n }, (_, i) => (i < n ? i : -1));
  const blossomendps = new Array(2 * n).fill(null);
  const bestedge = new Array(2 * n).fill(-1);
  const blossombestedges = new Array(2 * n).fill(null);
  const unusedblossoms = [];
  for (let b = n; b < 2 * n; b++) unusedblossoms.push(b);
  const dualvar = Array.from({ length: 2 * n }, (_, i) => (i < n ? maxweight : 0));
  const allowedge = new Array(nedge).fill(false);
  let queue = [];

  const slack = (k) => dualvar[edges[k][0]] + dualvar[edges[k][1]] - 2 * edges[k][2];
  const at = (arr, j) => arr[((j % arr.length) + arr.length) % arr.length];

  function leaves(b, out = []) {
    if (b < n) out.push(b);
    else for (const t of blossomchilds[b]) leaves(t, out);
    return out;
  }

  function assignLabel(w, t, p) {
    const b = inblossom[w];
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) queue.push(...leaves(b));
    else if (t === 2) {
      const base = blossombase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  }

  // Trace back from v and w to find a new blossom's base, or -1 for an augmenting path.
  function scanBlossom(v, w) {
    const path = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) { base = blossombase[b]; break; }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) v = -1;
      else {
        v = endpoint[labelend[b]];
        b = inblossom[v];
        v = endpoint[labelend[b]];
      }
      if (w !== -1) { const t = v; v = w; w = t; }
    }
    for (const b of path) label[b] = 1;
    return base;
  }

  function addBlossom(base, k) {
    let [v, w] = edges[k];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];
    const b = unusedblossoms.pop();
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path = [];
    const endps = [];
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0;
    for (const x of leaves(b)) {
      if (label[inblossom[x]] === 2) queue.push(x);
      inblossom[x] = b;
    }
    const bestedgeto = new Array(2 * n).fill(-1);
    for (const c of path) {
      const nblists = blossombestedges[c] === null
        ? leaves(c).map((x) => neighbend[x].map((p) => p >> 1))
        : [blossombestedges[c]];
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let [i, j] = edges[kk];
          if (inblossom[j] === b) { const t = i; i = j; j = t; }
          const bj = inblossom[j];
          if (bj !== b && label[bj] === 1 && (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]))) bestedgeto[bj] = kk;
        }
      }
      blossombestedges[c] = null;
      bestedge[c] = -1;
    }
    blossombestedges[b] = bestedgeto.filter((kk) => kk !== -1);
    bestedge[b] = -1;
    for (const kk of blossombestedges[b]) if (bestedge[b] === -1 || slack(kk) < slack(bestedge[b])) bestedge[b] = kk;
  }

  function expandBlossom(b, endstage) {
    const childs = blossomchilds[b];
    const endps = blossomendps[b];
    for (const s of childs) {
      blossomparent[s] = -1;
      if (s < n) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0) expandBlossom(s, endstage);
      else for (const x of leaves(s)) inblossom[x] = s;
    }
    if (!endstage && label[b] === 2) {
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      let j = childs.indexOf(entrychild);
      let jstep, endptrick;
      if (j & 1) { j -= childs.length; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[at(endps, j - endptrick) >> 1] = true;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[p >> 1] = true;
        j += jstep;
      }
      let bv = at(childs, j);
      label[endpoint[p ^ 1]] = label[bv] = 2;
      labelend[endpoint[p ^ 1]] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        bv = at(childs, j);
        if (label[bv] === 1) { j += jstep; continue; }
        let found = -1;
        for (const x of leaves(bv)) if (label[x] !== 0) { found = x; break; }
        if (found !== -1) {
          label[found] = 0;
          label[endpoint[mate[blossombase[bv]]]] = 0;
          assignLabel(found, 2, labelend[found]);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  }

  function augmentBlossom(b, v) {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= n) augmentBlossom(t, v);
    const childs = blossomchilds[b];
    const endps = blossomendps[b];
    const i = childs.indexOf(t);
    let j = i;
    let jstep, endptrick;
    if (i & 1) { j -= childs.length; jstep = 1; endptrick = 0; } else { jstep = -1; endptrick = 1; }
    while (j !== 0) {
      j += jstep;
      t = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t >= n) augmentBlossom(t, endpoint[p]);
      j += jstep;
      t = at(childs, j);
      if (t >= n) augmentBlossom(t, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    blossomchilds[b] = childs.slice(i).concat(childs.slice(0, i));
    blossomendps[b] = endps.slice(i).concat(endps.slice(0, i));
    blossombase[b] = blossombase[blossomchilds[b][0]];
  }

  function augmentMatching(k) {
    const [v, w] = edges[k];
    for (let [s, p] of [[v, 2 * k + 1], [w, 2 * k]]) {
      for (;;) {
        const bs = inblossom[s];
        if (bs >= n) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        s = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= n) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
      }
    }
  }

  for (let stage = 0; stage < n; stage++) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = n; b < 2 * n; b++) blossombestedges[b] = null;
    allowedge.fill(false);
    queue = [];
    for (let v = 0; v < n; v++) if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    let augmented = false;
    for (;;) {
      while (queue.length && !augmented) {
        const v = queue.pop();
        for (const p of neighbend[v]) {
          const k = p >> 1;
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0) allowedge[k] = true;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) assignLabel(w, 2, p ^ 1);
            else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) addBlossom(base, k);
              else { augmentMatching(k); augmented = true; break; }
            } else if (label[w] === 0) { label[w] = 2; labelend[w] = p ^ 1; }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || kslack < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;
      let deltatype = -1;
      let delta = 0;
      let deltaedge = -1;
      let deltablossom = -1;
      if (!maxCardinality) {
        deltatype = 1;
        delta = Infinity;
        for (let v = 0; v < n; v++) if (dualvar[v] < delta) delta = dualvar[v];
      }
      for (let v = 0; v < n; v++) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (deltatype === -1 || d < delta) { delta = d; deltatype = 2; deltaedge = bestedge[v]; }
        }
      }
      for (let b = 0; b < 2 * n; b++) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const d = slack(bestedge[b]) / 2;
          if (deltatype === -1 || d < delta) { delta = d; deltatype = 3; deltaedge = bestedge[b]; }
        }
      }
      for (let b = n; b < 2 * n; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1 && label[b] === 2 && (deltatype === -1 || dualvar[b] < delta)) {
          delta = dualvar[b]; deltatype = 4; deltablossom = b;
        }
      }
      if (deltatype === -1) {
        deltatype = 1;
        delta = Infinity;
        for (let v = 0; v < n; v++) if (dualvar[v] < delta) delta = dualvar[v];
        delta = Math.max(0, delta);
      }
      for (let v = 0; v < n; v++) {
        if (label[inblossom[v]] === 1) dualvar[v] -= delta;
        else if (label[inblossom[v]] === 2) dualvar[v] += delta;
      }
      for (let b = n; b < 2 * n; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta;
          else if (label[b] === 2) dualvar[b] -= delta;
        }
      }
      if (deltatype === 1) break;
      if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let [i, j] = edges[deltaedge];
        if (label[inblossom[i]] === 0) { const t = i; i = j; j = t; }
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        queue.push(edges[deltaedge][0]);
      } else expandBlossom(deltablossom, false);
    }
    if (!augmented) break;
    for (let b = n; b < 2 * n; b++) {
      if (blossomparent[b] === -1 && blossombase[b] >= 0 && label[b] === 1 && dualvar[b] === 0) expandBlossom(b, true);
    }
  }
  return mate.map((p) => (p >= 0 ? endpoint[p] : -1));
}
