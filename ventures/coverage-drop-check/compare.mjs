// Compare two coverage XML reports (Cobertura or JaCoCo) and say whether
// line coverage dropped, and which files moved. No CDN, no DOMParser: a
// small hand-rolled tokenizer so the exact same code runs in the browser
// page and under `node --test`.
//
// The question this answers: given a baseline report (main, last release)
// and a current report (this PR, this commit), did the line rate go down,
// and which files account for it? That is a fact about the two reports,
// not a guess — no AI, no floor-threshold that would miss a drop from 92%
// to 81% as long as it stays above 80.

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isNaN(codePoint) ? whole : String.fromCodePoint(codePoint);
    }
    return ENTITIES[body] ?? whole;
  });
}

const TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[\s\S]*?>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(source) {
  const text = String(source ?? "");
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  let lastIndex = 0;
  let sawTag = false;
  let match;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text))) {
    const whole = match[0];
    if (whole.startsWith("<![CDATA[")) {
      stack[stack.length - 1].children.push({ tag: "#text", text: whole.slice(9, -3) });
      lastIndex = TOKEN_RE.lastIndex;
      continue;
    }
    if (whole.startsWith("<!--") || whole.startsWith("<!DOCTYPE") || whole.startsWith("<?")) {
      lastIndex = TOKEN_RE.lastIndex;
      continue;
    }

    const [, closing, name, attrStr, selfClose] = match;
    sawTag = true;
    lastIndex = TOKEN_RE.lastIndex;

    if (closing) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const attrs = {};
    let am;
    ATTR_RE.lastIndex = 0;
    while ((am = ATTR_RE.exec(attrStr))) {
      attrs[am[1]] = decodeEntities(am[2] !== undefined ? am[2] : am[3]);
    }
    const node = { tag: name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }

  if (!sawTag) {
    throw new Error("no XML tags found — paste a Cobertura or JaCoCo coverage report, not something else");
  }
  return root;
}

function walk(node, visit) {
  for (const child of node.children || []) {
    if (child.tag && child.tag !== "#text") visit(child);
    walk(child, visit);
  }
}

function findFirst(node, tag) {
  if (node.tag === tag) return node;
  for (const child of node.children || []) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

function findParent(root, target) {
  let found = null;
  function search(node) {
    for (const child of node.children || []) {
      if (child === target) {
        found = node;
        return;
      }
      if (!found) search(child);
    }
  }
  search(root);
  return found;
}

function packagePathFor(root, sourcefile) {
  let node = sourcefile;
  while (node) {
    const parent = findParent(root, node);
    if (parent && parent.tag === "package") {
      const name = parent.attrs.name || "";
      return name ? `${name.replace(/\./g, "/")}/` : "";
    }
    node = parent;
  }
  return "";
}

function lineRate(covered, valid) {
  if (!valid) return 0;
  return covered / valid;
}

function fileRecord(filename, covered, valid) {
  return { filename, covered, valid, lineRate: lineRate(covered, valid) };
}

function fromCobertura(coverage) {
  const files = {};
  walk(coverage, (node) => {
    if (node.tag !== "class") return;
    const filename = node.attrs.filename || node.attrs.name || "(unnamed)";
    let covered = 0;
    let valid = 0;
    for (const child of node.children || []) {
      if (child.tag !== "lines") continue;
      for (const line of child.children || []) {
        if (line.tag !== "line") continue;
        valid += 1;
        if (Number(line.attrs.hits || 0) > 0) covered += 1;
      }
    }
    if (!valid && (coverage.attrs["lines-valid"] || node.attrs["line-rate"])) {
      // A class with a rate but no <line> children still contributes via
      // the rate attributes when present; skip empty placeholders.
    }
    if (files[filename]) {
      files[filename] = fileRecord(
        filename,
        files[filename].covered + covered,
        files[filename].valid + valid,
      );
    } else {
      files[filename] = fileRecord(filename, covered, valid);
    }
  });

  const attrCovered = Number(coverage.attrs["lines-covered"]);
  const attrValid = Number(coverage.attrs["lines-valid"]);
  const summedCovered = Object.values(files).reduce((n, f) => n + f.covered, 0);
  const summedValid = Object.values(files).reduce((n, f) => n + f.valid, 0);
  const covered = Number.isFinite(attrCovered) && Number.isFinite(attrValid) && attrValid > 0
    ? attrCovered
    : summedCovered;
  const valid = Number.isFinite(attrCovered) && Number.isFinite(attrValid) && attrValid > 0
    ? attrValid
    : summedValid;

  return { format: "cobertura", covered, valid, lineRate: lineRate(covered, valid), files };
}

function jacocoLineCounter(node) {
  for (const child of node.children || []) {
    if (child.tag === "counter" && (child.attrs.type || "").toUpperCase() === "LINE") {
      const missed = Number(child.attrs.missed || 0);
      const covered = Number(child.attrs.covered || 0);
      return { covered, valid: covered + missed };
    }
  }
  return null;
}

function fromJacoco(report) {
  const files = {};
  walk(report, (node) => {
    if (node.tag !== "sourcefile") return;
    const prefix = packagePathFor(report, node);
    const filename = `${prefix}${node.attrs.name || "(unnamed)"}`;
    const counter = jacocoLineCounter(node);
    let covered;
    let valid;
    if (counter) {
      covered = counter.covered;
      valid = counter.valid;
    } else {
      covered = 0;
      valid = 0;
      for (const child of node.children || []) {
        if (child.tag !== "line") continue;
        valid += 1;
        if (Number(child.attrs.ci || 0) > 0) covered += 1;
      }
    }
    if (files[filename]) {
      files[filename] = fileRecord(
        filename,
        files[filename].covered + covered,
        files[filename].valid + valid,
      );
    } else {
      files[filename] = fileRecord(filename, covered, valid);
    }
  });

  const reportCounter = jacocoLineCounter(report);
  const summedCovered = Object.values(files).reduce((n, f) => n + f.covered, 0);
  const summedValid = Object.values(files).reduce((n, f) => n + f.valid, 0);
  const covered = reportCounter ? reportCounter.covered : summedCovered;
  const valid = reportCounter ? reportCounter.valid : summedValid;

  return { format: "jacoco", covered, valid, lineRate: lineRate(covered, valid), files };
}

/**
 * Parse a Cobertura (`<coverage>`) or JaCoCo (`<report>`) XML document into
 * an overall line rate plus a per-file map.
 */
export function parseCoverage(xmlText) {
  const tree = parseXml(xmlText);
  const coverage = findFirst(tree, "coverage");
  if (coverage) return fromCobertura(coverage);
  const report = findFirst(tree, "report");
  if (report) return fromJacoco(report);
  throw new Error("no coverage root — paste a Cobertura (coverage.py, pytest-cov, nyc) or JaCoCo XML report");
}

function pctPoints(a, b) {
  return (a - b) * 100;
}

/**
 * @param {string} baselineXml
 * @param {string} currentXml
 * @param {{maxDropPct?: number}} [options]
 */
export function compareCoverage(baselineXml, currentXml, options = {}) {
  const maxDropPct = Number(options.maxDropPct ?? 0);
  if (!Number.isFinite(maxDropPct) || maxDropPct < 0) {
    throw new Error("--max-drop must be a non-negative number of percentage points");
  }
  const baseline = parseCoverage(baselineXml);
  const current = parseCoverage(currentXml);
  const dropPct = pctPoints(baseline.lineRate, current.lineRate);
  const names = new Set([...Object.keys(baseline.files), ...Object.keys(current.files)]);
  const files = [];
  for (const filename of names) {
    const before = baseline.files[filename];
    const after = current.files[filename];
    if (!before) {
      files.push({
        filename,
        verdict: "new",
        baselineRate: null,
        currentRate: after.lineRate,
        dropPct: null,
        baselineCovered: 0,
        currentCovered: after.covered,
        baselineValid: 0,
        currentValid: after.valid,
      });
      continue;
    }
    if (!after) {
      files.push({
        filename,
        verdict: "removed",
        baselineRate: before.lineRate,
        currentRate: null,
        dropPct: null,
        baselineCovered: before.covered,
        currentCovered: 0,
        baselineValid: before.valid,
        currentValid: 0,
      });
      continue;
    }
    const fileDrop = pctPoints(before.lineRate, after.lineRate);
    let verdict = "unchanged";
    if (fileDrop > 1e-9) verdict = "dropped";
    else if (fileDrop < -1e-9) verdict = "improved";
    files.push({
      filename,
      verdict,
      baselineRate: before.lineRate,
      currentRate: after.lineRate,
      dropPct: fileDrop,
      baselineCovered: before.covered,
      currentCovered: after.covered,
      baselineValid: before.valid,
      currentValid: after.valid,
    });
  }
  files.sort((a, b) => {
    const rank = { dropped: 0, removed: 1, new: 2, improved: 3, unchanged: 4 };
    const da = a.dropPct == null ? -Infinity : a.dropPct;
    const db = b.dropPct == null ? -Infinity : b.dropPct;
    return (rank[a.verdict] - rank[b.verdict]) || db - da || a.filename.localeCompare(b.filename);
  });

  const overallDropped = dropPct > maxDropPct + 1e-9;
  return {
    baseline: { format: baseline.format, covered: baseline.covered, valid: baseline.valid, lineRate: baseline.lineRate },
    current: { format: current.format, covered: current.covered, valid: current.valid, lineRate: current.lineRate },
    dropPct,
    maxDropPct,
    overallDropped,
    files,
    droppedFiles: files.filter((f) => f.verdict === "dropped"),
    improvedFiles: files.filter((f) => f.verdict === "improved"),
    newFiles: files.filter((f) => f.verdict === "new"),
    removedFiles: files.filter((f) => f.verdict === "removed"),
  };
}

export function summarizeCompare(result) {
  const basePct = (result.baseline.lineRate * 100).toFixed(2);
  const currPct = (result.current.lineRate * 100).toFixed(2);
  const drop = result.dropPct.toFixed(2);
  if (result.overallDropped) {
    return {
      status: "dropped",
      text: `Line coverage dropped ${drop} points (${basePct}% → ${currPct}%), past the ${result.maxDropPct} point allowance. ${result.droppedFiles.length} file(s) got worse.`,
    };
  }
  if (result.dropPct > 1e-9) {
    return {
      status: "ok",
      text: `Line coverage dropped ${drop} points (${basePct}% → ${currPct}%), within the ${result.maxDropPct} point allowance.`,
    };
  }
  if (result.dropPct < -1e-9) {
    return {
      status: "improved",
      text: `Line coverage rose ${(-result.dropPct).toFixed(2)} points (${basePct}% → ${currPct}%).`,
    };
  }
  return {
    status: "ok",
    text: `Line coverage is unchanged at ${currPct}%.`,
  };
}
