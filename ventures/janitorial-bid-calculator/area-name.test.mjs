import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayAreaName, escapeHtml, nameForRow } from './area-name.mjs';

test('a custom Other-space name beats the Area N fallback', () => {
  assert.equal(displayAreaName('', 'Server room', 3), 'Server room');
  assert.equal(displayAreaName('', '  Gym  ', 0), 'Gym');
});

test('a preset label is used when the contractor did not name the row', () => {
  assert.equal(displayAreaName('Restrooms (full clean)', '', 1), 'Restrooms (full clean)');
  assert.equal(displayAreaName('Open office / cubicles', '   ', 0), 'Open office / cubicles');
});

test('a custom name overrides the preset so two restrooms can be told apart', () => {
  assert.equal(displayAreaName('Restrooms (full clean)', '2nd floor restrooms', 1), '2nd floor restrooms');
});

test('nameless rows stay uniquely labelled', () => {
  assert.equal(displayAreaName('', '', 0), 'Area 1');
  assert.equal(displayAreaName(null, undefined, 4), 'Area 5');
});

test('nameForRow prefers a typed proposal name over the catalog label', () => {
  assert.equal(nameForRow('Restrooms (full clean)', '2nd floor restrooms', 2), '2nd floor restrooms');
  assert.equal(nameForRow('Restrooms (full clean)', '', 2), 'Restrooms (full clean)');
  assert.equal(nameForRow('', 'Server room', 2), 'Server room');
  assert.equal(nameForRow('', '  ', 2), 'Area 3');
});

test('escapeHtml keeps a typed name from becoming markup', () => {
  assert.equal(escapeHtml('Hall <west> & "east"'), 'Hall &lt;west&gt; &amp; &quot;east&quot;');
  assert.equal(escapeHtml("O'Brien suite"), 'O&#39;Brien suite');
});
