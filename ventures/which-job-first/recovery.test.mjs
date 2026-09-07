import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as engine from './rank.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/import\s*\{[\s\S]*?\}\s*from '\.\/rank\.mjs';/, '');

function openPage(saved) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, value: '', checked: false,
      firstElementChild: { style: {} }, firstChild: {},
    });
    return elements.get(id);
  };
  const storage = new Map([['which-job-first-state', JSON.stringify(saved)]]);
  runInNewContext(script, {
    ...engine, URLSearchParams,
    document: {
      getElementById: element,
      querySelectorAll: () => [element('left'), element('right')],
      addEventListener() {},
    },
    location: { hash: '' }, navigator: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  return { element, storage };
}

test('a damaged saved comparison recovers to setup and allows a new ranking', () => {
  const saved = engine.createRanking(['Kitchen', 'Deck']);
  saved.merge.left = [];
  const { element, storage } = openPage(saved);
  assert.equal(element('setup').hidden, false);
  assert.equal(element('compare').hidden, true);
  assert.equal(storage.has('which-job-first-state'), false);
  element('list').value = 'Fence\nGarage';
  element('start').onclick();
  assert.equal(element('setup').hidden, true);
  assert.equal(element('left').firstChild.nodeValue, 'Fence');
  assert.equal(element('right').firstChild.nodeValue, 'Garage');
});

test('a valid saved comparison still resumes', () => {
  const saved = engine.choose(engine.createRanking(['Kitchen', 'Deck', 'Fence']), 'right');
  const { element, storage } = openPage(saved);
  assert.equal(element('setup').hidden, true);
  assert.equal(element('compare').hidden, false);
  assert.equal(element('left').firstChild.nodeValue, engine.nextPair(saved).left.label);
  assert.deepEqual(JSON.parse(storage.get('which-job-first-state')), saved);
});
