import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('an invalid input clears every stale metric instead of leaving it next to the callout', () => {
  // Before this fix, render()'s catch block only overwrote the #message
  // callout with the error sentence. Unused seats, utilization, avoidable
  // per month, and avoidable through renewal (plus their labels, which
  // swap wording between "unused" and "over purchased") all kept showing
  // the last valid review. A visitor who missed the one-line message in
  // #message could easily read those stale figures as the answer for the
  // invalid inputs now on screen.
  const catchMatch = scriptSource.match(/\} catch \(error\) \{([\s\S]*?)\n {4}\}\n {2}\}/);
  assert.ok(catchMatch, 'render() catch block not found');
  const body = catchMatch[1];
  assert.match(body, /document\.querySelector\('#message'\)\.textContent = error\.message/, 'the error message is never shown');
  for (const id of ['unused', 'unusedLabel', 'utilization', 'monthly', 'monthlyLabel', 'remaining', 'remainingLabel']) {
    assert.match(
      body,
      new RegExp(`document\\.querySelector\\('#${id}'\\)\\.textContent = ''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
});
