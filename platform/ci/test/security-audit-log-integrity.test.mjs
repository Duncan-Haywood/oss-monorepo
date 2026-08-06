import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LOG = 'docs/SECURITY_AUDIT_LOG.md';

// The log opens by saying every issue "is assigned a unique identifier,
// assessed for severity and impact, and tracked until resolution". The findings
// matrix is that tracking surface — it is what anyone reads to answer "what is
// outstanding". The detailed sections below it are the evidence.
//
// On 2026-08-02 the matrix ended at SEC-019 while SEC-020 and SEC-021 had full
// detailed sections, written the day before. Two findings were documented and
// untracked, and the summary read as though the log ended three findings ago.
// Nothing noticed, because nothing compared the two halves of the document.
//
// This is a cheap structural check, not a judgement about content: the two
// halves must name the same findings, the identifiers must be unique and
// contiguous, and every tracked finding must carry a status.
//
// On 2026-08-06 all four of those checks passed over a log in which SEC-021
// named two unrelated findings — the homepage container publishing its own
// configuration (Low), and rate limiters keyed on a caller-controlled
// x-forwarded-for entry (Medium). They passed because uniqueness was asserted
// over `matrixRows` alone, and the matrix is the one surface a duplicate cannot
// easily reach: it is a sorted, contiguous table that a human eye reads as a
// list. An id is *defined* on two surfaces, and the other one — the `### SEC-xxx —`
// headings — was never checked for repeats.
//
// The collision was also what hid the second finding. "Every documented finding
// is tracked in the matrix" is asked as `tracked.has(id)`, so the rate-limit
// finding satisfied it using the container finding's row, and the matrix row
// anyone would read to see what was outstanding described the other issue. A
// duplicate id does not merely mislabel a finding; it silences the check that
// exists to notice a finding nobody is tracking.
//
// So uniqueness is now asserted on every surface an id can be defined on, and
// the two surfaces must agree on severity — an independent detector of the same
// fault, since a collision between findings of different severity shows up as
// disagreement even if a future duplicate slips past the count.

function readLog() {
  return fs.readFileSync(path.join(REPO_ROOT, LOG), 'utf8');
}

function matrixRows(source) {
  // `| **SEC-001** | High | Application | `path` | description | **Fixed** |`
  return [...source.matchAll(/^\|\s*\*\*(SEC-\d+)\*\*\s*\|(.+)\|\s*$/gm)].map((match) => ({
    id: match[1],
    cells: match[2].split('|').map((cell) => cell.trim()),
  }));
}

// `### SEC-021 — Low — The Homepage Container Published Its Own Configuration`
// The heading carries the id and, between the first two em dashes, the severity.
function detailSections(source) {
  return [...source.matchAll(/^###\s+(SEC-\d+)\s+—\s*([^—]+?)\s*—/gm)].map((match) => ({
    id: match[1],
    severity: match[2],
  }));
}

// Severity is written `**Critical**` in the matrix and `Critical` in a heading,
// so compare on the text rather than the emphasis around it.
function normalizeSeverity(value) {
  return String(value ?? '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase();
}

function detailIds(source) {
  return [...source.matchAll(/^###\s+(SEC-\d+)\s+—/gm)].map((match) => match[1]);
}

test('Security audit log - every documented finding is tracked in the matrix', () => {
  const source = readLog();
  const tracked = new Set(matrixRows(source).map((row) => row.id));

  for (const id of detailIds(source)) {
    assert.ok(
      tracked.has(id),
      `${LOG} documents ${id} in detail but the findings matrix does not list it. The matrix ` +
        'is what anyone reads to see what is outstanding, so a finding missing from it is an ' +
        'untracked finding however well it is written up below.',
    );
  }
});

test('Security audit log - every tracked finding has its evidence', () => {
  const source = readLog();
  const documented = new Set(detailIds(source));

  for (const row of matrixRows(source)) {
    assert.ok(
      documented.has(row.id),
      `${LOG} lists ${row.id} in the findings matrix with no "### ${row.id} — ..." section. A row ` +
        'without a detailed finding records a claim with no impact, fix, or evidence behind it.',
    );
  }
});

test('Security audit log - identifiers are unique and contiguous', () => {
  const source = readLog();
  const ids = matrixRows(source).map((row) => row.id);

  assert.ok(ids.length > 0, `${LOG} must contain a findings matrix`);
  assert.equal(new Set(ids).size, ids.length, `${LOG} assigns an identifier twice`);

  const numbers = ids.map((id) => Number(id.slice(4))).sort((a, b) => a - b);
  assert.equal(numbers[0], 1, `${LOG} must start at SEC-001`);
  for (let i = 1; i < numbers.length; i += 1) {
    assert.equal(
      numbers[i],
      numbers[i - 1] + 1,
      `${LOG} skips SEC-${String(numbers[i - 1] + 1).padStart(3, '0')}. A gap in the sequence is ` +
        'either a finding that was dropped or one that was never added.',
    );
  }
});

test('Security audit log - no identifier is defined twice on any surface', () => {
  const source = readLog();

  // Both surfaces on which an id is *defined*, checked the same way. Asserting
  // this of the matrix alone was the gap: the matrix is a contiguous sorted
  // table, so it is the surface least able to hide a repeat, while the detail
  // headings are appended one at a time by whoever writes the finding.
  // `detailIds`, not `detailSections`: the looser pattern. detailSections needs
  // a second em dash to read the severity off the heading, so a heading written
  // without one would drop out of it — and a check that a malformed heading can
  // fall out of is not a uniqueness check.
  const surfaces = [
    ['findings matrix', matrixRows(source).map((row) => row.id)],
    ['detailed findings', detailIds(source)],
  ];

  for (const [surface, ids] of surfaces) {
    assert.ok(ids.length > 0, `${LOG} has no identifiers on the ${surface} surface`);

    const seen = new Map();
    for (const id of ids) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const repeated = [...seen.entries()].filter(([, count]) => count > 1);

    assert.deepEqual(
      repeated,
      [],
      `${LOG} defines ${repeated
        .map(([id, count]) => `${id} ${count} times`)
        .join(', ')} on the ${surface} surface. Two findings under one id share a ` +
        'single matrix row, so one of them is described by the other\'s row and is ' +
        'tracked nowhere — and it defeats the "every documented finding is tracked" ' +
        'check above, which is satisfied by the id being present rather than by it ' +
        'meaning this finding. Give the newer finding the next free identifier.',
    );
  }
});

test('Security audit log - the matrix and the detail agree on severity', () => {
  const source = readLog();
  const severityById = new Map(
    matrixRows(source).map((row) => [row.id, normalizeSeverity(row.cells[0])]),
  );

  // A heading this test cannot parse a severity from would be skipped below
  // rather than compared, so the comparison would quietly cover fewer findings
  // than the log contains. Every heading must be readable before any is checked.
  const sections = detailSections(source);
  const unparsed = detailIds(source).filter(
    (id) => !sections.some((section) => section.id === id),
  );
  assert.deepEqual(
    unparsed,
    [],
    `${LOG}: ${unparsed.join(', ')} has a heading this contract cannot read a severity ` +
      'from. Headings are `### SEC-xxx — Severity — Title`; without the severity the ' +
      'agreement check below skips the finding instead of checking it.',
  );

  for (const section of sections) {
    const tracked = severityById.get(section.id);
    if (tracked === undefined) {
      continue; // The bijection tests above own this case, with a better message.
    }
    assert.equal(
      normalizeSeverity(section.severity),
      tracked,
      `${LOG}: ${section.id} is rated "${normalizeSeverity(section.severity)}" in its ` +
        `detailed finding and "${tracked}" in the matrix. Either the rating was revised ` +
        'in one place only, or — as with the SEC-021 collision — the row belongs to a ' +
        'different finding that happens to share the identifier.',
    );
  }
});

test('Security audit log - every tracked finding carries a status', () => {
  const source = readLog();

  for (const row of matrixRows(source)) {
    const status = row.cells.at(-1);
    assert.ok(
      status && status.replace(/\*/g, '').trim().length > 0,
      `${LOG}: ${row.id} has no status. "Tracked until resolution" needs somewhere to record ` +
        'whether it is resolved.',
    );
  }
});
