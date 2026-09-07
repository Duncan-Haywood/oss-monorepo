// Classify tests as flaky, broken, or stable from two or more JUnit-XML test
// reports (the format pytest, jest-junit, go-junit-report, PHPUnit, RSpec's
// RSpecJUnitFormatter, and Maven/Gradle Surefire all produce). No CDN, no
// DOMParser: a small hand-rolled tokenizer so the exact same code runs in the
// browser page and under `node --test`, where DOMParser does not exist.
//
// The question this answers: across N runs of (nominally) the same suite,
// which individual tests flipped between pass and fail? That is the
// definition of "flaky" that needs no model and no guessing -- it is a fact
// about the reports themselves. A test that failed in every run it appeared
// in is broken, not flaky; a test that only ever passed is stable.
//
// Deliberately format-agnostic about *why* a test is missing from a run: the
// single most common real-world shape is a CI job that reruns only the tests
// that failed the first time (pytest --lf, jest --onlyFailures, most "retry
// failed tests" CI features) -- so run 2 legitimately contains a strict
// subset of run 1's tests, and that must not be misread as "this test didn't
// run" rather than "this test wasn't retried."

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

/**
 * A minimal, forgiving XML parser: enough structure to find `<testcase>`
 * elements and their immediate children, not a general-purpose XML library.
 * Throws with a plain-English message on input that isn't XML at all, since
 * that's the mistake a visitor pasting the wrong thing will actually make.
 */
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
    throw new Error("no XML tags found — paste a JUnit XML report, not something else");
  }
  return root;
}

function walk(node, visit) {
  for (const child of node.children || []) {
    if (child.tag && child.tag !== "#text") visit(child);
    walk(child, visit);
  }
}

/**
 * One row per `<testcase>` element found anywhere in the document, in
 * document order. A single file can legitimately contain more than one
 * `<testcase>` for the same test — pytest-rerunfailures and Surefire's
 * rerun support both re-emit the element per attempt — and each is kept as
 * its own occurrence rather than collapsed, which is what lets a single-file
 * rerun report show flakiness on its own.
 */
export function extractTestcases(xmlText) {
  const tree = parseXml(xmlText);
  const rows = [];
  walk(tree, (node) => {
    if (node.tag !== "testcase") return;
    const classname = node.attrs.classname || node.attrs.class || "";
    const name = node.attrs.name || "(unnamed test)";
    let status = "passed";
    let message = null;
    let rerun = false;
    for (const child of node.children) {
      if (child.tag === "failure" || child.tag === "error") {
        status = "failed";
        message = message || child.attrs.message || null;
      } else if (child.tag === "skipped" && status !== "failed") {
        status = "skipped";
      } else if (child.tag === "flakyFailure" || child.tag === "flakyError" || child.tag === "rerunFailure" || child.tag === "rerunError") {
        // Surefire/Failsafe's own rerun elements: this attempt failed but a
        // later one in the same <testcase> passed, so the runner already
        // knows this test flickered. Treat it as first-class evidence.
        rerun = true;
      }
    }
    rows.push({
      classname,
      name,
      key: classname ? `${classname}::${name}` : name,
      status,
      message,
      rerunSignal: rerun,
    });
  });
  return rows;
}

const VERDICT_RANK = { flaky: 0, broken: 1, "skipped-only": 2, stable: 3 };

/**
 * @param {Array<{label?: string, xml: string}>} runs
 * @returns {Array<object>} one row per distinct test, worst-first
 */
export function classifyRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("give at least one run's JUnit XML");
  }

  const byKey = new Map();
  runs.forEach((run, index) => {
    const label = run.label || `run ${index + 1}`;
    let cases;
    try {
      cases = extractTestcases(run.xml);
    } catch (err) {
      throw new Error(`${label}: ${err.message}`);
    }
    for (const tc of cases) {
      if (!byKey.has(tc.key)) {
        byKey.set(tc.key, { classname: tc.classname, name: tc.name, key: tc.key, occurrences: [] });
      }
      byKey.get(tc.key).occurrences.push({ run: label, status: tc.status, message: tc.message, rerunSignal: tc.rerunSignal });
    }
  });

  const rows = [...byKey.values()].map((entry) => {
    const passed = entry.occurrences.filter((o) => o.status === "passed").length;
    const failed = entry.occurrences.filter((o) => o.status === "failed").length;
    const skipped = entry.occurrences.filter((o) => o.status === "skipped").length;
    const seenInRuns = new Set(entry.occurrences.map((o) => o.run)).size;
    const rerunSignal = entry.occurrences.some((o) => o.rerunSignal);
    const failureMessage = entry.occurrences.find((o) => o.status === "failed")?.message || null;

    let verdict;
    if (rerunSignal || (passed > 0 && failed > 0)) {
      verdict = "flaky";
    } else if (failed > 0) {
      verdict = "broken";
    } else if (passed > 0) {
      verdict = "stable";
    } else {
      verdict = "skipped-only";
    }

    return {
      classname: entry.classname,
      name: entry.name,
      key: entry.key,
      passed,
      failed,
      skipped,
      seenInRuns,
      totalRuns: runs.length,
      verdict,
      failureMessage,
    };
  });

  rows.sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.key.localeCompare(b.key));
  return rows;
}

export function summarizeRuns(rows, totalRuns) {
  const flaky = rows.filter((r) => r.verdict === "flaky");
  const broken = rows.filter((r) => r.verdict === "broken");
  const stable = rows.filter((r) => r.verdict === "stable");
  const lowConfidence = totalRuns < 2 && !flaky.some((r) => r.seenInRuns >= 1 && r.failed > 0 && r.passed > 0);

  if (flaky.length) {
    return {
      status: "flaky",
      text: `${flaky.length} of ${rows.length} test(s) flipped between pass and fail — that is flakiness, not a real regression by itself.`,
    };
  }
  if (broken.length) {
    return {
      status: "broken",
      text: `No flakiness found. ${broken.length} test(s) failed every time they ran${lowConfidence ? " (only one run given — rerun to be sure before trusting this)" : ""} — that reads as a real, consistent failure.`,
    };
  }
  return {
    status: "stable",
    text: `No flakiness and no consistent failures found. All ${stable.length} test(s) passed every time they ran.`,
  };
}
