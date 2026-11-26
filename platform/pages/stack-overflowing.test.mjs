import test from 'node:test';
import assert from 'node:assert/strict';
import { headKey, sourceTables, withStack, stackTables } from './stack-overflowing.mjs';

const STATIC = '<table>\n<thead><tr><th>Job</th><th class="num">Net yd&sup2;</th></tr></thead>\n<tbody><tr><td>A</td><td>1</td></tr></tbody>\n</table>';

test('headKey compares source entities and rendered characters equal', () => {
  assert.equal(headKey('<tr><th>Job</th><th class="num">Net yd&sup2;</th></tr>'), headKey('<tr><th>Job</th><th class="num">Net yd²</th></tr>'));
  assert.equal(headKey('Break<br>even'), headKey('Break even'));
});

test('withStack adds to an existing class or writes one', () => {
  assert.equal(withStack('<table>'), '<table class="stack">');
  assert.equal(withStack('<table class="wide">'), '<table class="stack wide">');
  assert.equal(withStack("<table class='wide'>"), "<table class='stack wide'>");
});

test('a static table matched by its header is stacked', () => {
  const { html, changed, notes } = stackTables(`<p>x</p>${STATIC}`, ['<tr><th>Job</th><th class="num">Net yd²</th></tr>']);
  assert.equal(changed, 1);
  assert.deepEqual(notes, ['stacked']);
  assert.match(html, /<p>x<\/p><table class="stack">/);
});

test('script-filled, nested, ambiguous, headless and already-stacked tables are left alone', () => {
  const head = '<tr><th>Job</th><th>Net yd²</th></tr>';
  const cases = [
    STATIC.replace('<tbody>', '<tbody id="rows">'),
    STATIC.replace('<table>', '<table id="out">'),
    STATIC.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>'),
    STATIC.replace('<td>1</td>', '<td><table><tr><td>1</td></tr></table></td>'),
    STATIC + STATIC,
    STATIC.replace('<table>', '<table class="stack">'),
  ];
  for (const c of cases) {
    const r = stackTables(c, [head]);
    assert.equal(r.changed, 0, c);
    assert.equal(r.html, c);
  }
  assert.equal(stackTables(STATIC, [null]).changed, 0);
});

test('tables inside scripts and comments are not source tables', () => {
  const html = `<script>const t = '<table><thead><tr><th>Job</th></tr></thead>';</script><!-- <table> -->${STATIC}`;
  const t = sourceTables(html);
  assert.equal(t.length, 1);
  assert.equal(t[0].head, headKey('JobNet yd'));
});

test('end tags with spaces or attributes, and --!> comments, still close the block', () => {
  const inner = '<table><thead><tr><th>Hidden</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>';
  const html = `<script>const t = '${inner}';</script >${STATIC}<style>/* ${inner} */</style\n>`
    + `<!-- ${inner} --!>${STATIC.replace('Job', 'Two')}`;
  const heads = sourceTables(html).map((x) => x.head);
  assert.deepEqual(heads, [headKey('JobNet yd'), headKey('TwoNet yd')]);
});
