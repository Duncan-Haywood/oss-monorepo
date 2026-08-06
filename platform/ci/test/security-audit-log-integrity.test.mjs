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
// Uniqueness was originally asserted over the matrix rows alone, which is the
// one surface in this document where a duplicate cannot survive: the matrix is
// a table of one row per id, so a second `SEC-021` row is visible to anyone who
// reads it, and the contiguity check below would fail on the resulting gap
// anyway. The write-ups are the surface where ids actually collide — they are
// appended at the bottom of a 700-line file by whoever found the thing, on a
// branch, without reading the other 28. That is not hypothetical here:
// `docs/INTEGRATION-REPORT-2026-08-02.md` records two branches independently
// assigning SEC-020, SEC-021 and SEC-022, and a second collision on SEC-021
// survived into this tree — a Low homepage-container finding and a Medium
// rate-limiting finding sharing one heading, the second of which had no matrix
// row and so was tracked by nothing. Both of the inclusion checks below use a
// `Set`, so both read a reused id as one finding and pass.
//
// The failure mode this closes is the merge, not the typo. Two findings under
// one id merge without conflict, and the loser is not deleted — it is silently
// aliased onto the winner's row, keeping its status, its severity and its
// "Fixed" marker.

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

function detailSections(source) {
  // `### SEC-001 — High — Password-Reset Token Race`
  return [...source.matchAll(/^###\s+(SEC-\d+)\s+—\s*(.*)$/gm)].map((match) => ({
    id: match[1],
    heading: match[2].trim(),
    line: source.slice(0, match.index).split('\n').length,
  }));
}

function detailIds(source) {
  return detailSections(source).map((section) => section.id);
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

test('Security audit log - no identifier is claimed by two write-ups', () => {
  const sections = detailSections(readLog());

  assert.ok(sections.length > 0, `${LOG} must contain detailed findings`);

  const firstUse = new Map();
  const collisions = [];
  for (const section of sections) {
    const earlier = firstUse.get(section.id);
    if (earlier) {
      collisions.push(
        `${section.id} is used at line ${earlier.line} for "${earlier.heading}" and again at ` +
          `line ${section.line} for "${section.heading}"`,
      );
      continue;
    }
    firstUse.set(section.id, section);
  }

  assert.deepEqual(
    collisions,
    [],
    `${LOG} gives one identifier to two different findings:\n  ${collisions.join('\n  ')}\n` +
      'The matrix has one row per id, so the second finding inherits the first\'s severity, ' +
      'status and remediation and stops being tracked on its own terms. Renumber the later ' +
      'write-up to the next free identifier and give it its own matrix row.',
  );
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
