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
