import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('an invalid input clears the stale report instead of leaving it next to a silent error', () => {
  // Before this fix, invalid JSON (or a cross-site before/after pair) set the
  // #error text but left the previous comparison's report showing in #report,
  // and `latest` still pointed at that stale comparison -- so Download report
  // would ship a report for traces that no longer match the textareas.
  const clickHandler = scriptSource.match(/addEventListener\('click', \(\) => \{ try \{([\s\S]*?)\n {4}\} \}\);/);
  assert.ok(clickHandler, 'the #compare click handler was not found');
  const body = clickHandler[1];
  const catchBlock = body.match(/\} catch \(error\) \{([\s\S]*)$/);
  assert.ok(catchBlock, 'catch block not found inside the click handler');
  const catchBody = catchBlock[1];
  assert.match(catchBody, /latest\s*=\s*null/, '`latest` is not reset, so Download could still ship a stale report');
  assert.match(catchBody, /report\.textContent\s*=\s*''/, '#report keeps its stale value instead of being cleared on a rejected input');
  assert.match(catchBody, /error\.message/, 'the error message is never shown');
});

test('the page still ships its disclaimer and no-warranty text', () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /id="error" class="error" role="alert"/);
});
