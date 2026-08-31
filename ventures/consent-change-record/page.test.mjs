import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('a rejected trace clears the stale review record instead of leaving it next to the error', () => {
  // Before this fix, the compare click handler's catch block nulled `latest`
  // (so Download could not hand out stale data) and set #error, but left the
  // #report <pre> showing the previous comparison's review record. A
  // visitor who missed the one-line error could read that stale report as
  // the record for the traces now pasted into the form.
  const catchMatch = scriptSource.match(/catch \(error\) \{([\s\S]*?)\n\s*\} \}\);/);
  assert.ok(catchMatch, 'the compare click handler catch block was not found');
  const body = catchMatch[1];
  assert.match(body, /latest = null/, 'latest is not invalidated, so Download could still hand out a stale record');
  assert.match(body, /report\.textContent = /, '#report keeps its stale review record instead of being reset');
  assert.match(body, /document\.querySelector\('#error'\)\.textContent = error\.message/, 'the error message is never shown');
});
