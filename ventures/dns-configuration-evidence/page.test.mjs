import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Closest sibling: the same admin keeping a before/after operational record
// that nothing uploads — backup runs there, resolver answers here. The
// related-tool chrome rotates alphabetically inside the evidence subcategory,
// so without an explicit one-hop a crawler on this page may never land on it.
test('index links one hop to the backup-verification-evidence sibling', () => {
  assert.match(
    html,
    /href="\.\.\/backup\-verification\-evidence\/"/,
    'index must link ../backup-verification-evidence/ so a crawler reaches that tool in one hop',
  );
  assert.match(html, /backup verification evidence/i);
});

// Second sibling: both read a domain's own DNS records with nothing
// uploaded, one diffing a named set of records over time, the other
// checking one specific family (SPF/DKIM/DMARC/BIMI) at a point in time.
test('index links one hop to the email-auth-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/email\-auth\-check\/"/,
    'index must link ../email-auth-check/ so a crawler reaches that tool in one hop',
  );
  assert.match(html, /email authentication checker/i);
});
