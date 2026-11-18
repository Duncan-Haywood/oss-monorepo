import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf } from './example_coverage.mjs';

test('kindOf sorts example answers into kinds', () => {
  assert.equal(kindOf(0, '{"module":"calc.mjs","function":"compute","input":{}}'), 'input');
  assert.equal(kindOf(0, '{"module":"calc.mjs","function":"analyze","text":""}'), 'text');
  assert.equal(kindOf(0, '{"module":"calc.mjs","function":"analyze","args":[[1]]}'), 'args');
  assert.equal(kindOf(0, '{"module":"calc.mjs","steps":[{},{}]}'), 'steps');
  assert.equal(kindOf(0, 'null\n'), 'null');
  assert.equal(kindOf(1, ''), 'failed');
  assert.equal(kindOf(0, 'not json'), 'failed');
});
