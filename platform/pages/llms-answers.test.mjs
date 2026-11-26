import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { plainText, extractFaq, answersSection, questionsSection, answersDoc, withAnswers, baseUrl, renderFor, optedIn, INLINE_LIMIT, ANSWERS_FILE } from './llms-answers.mjs';

const VENTURES = fileURLToPath(new URL('../../ventures/', import.meta.url));

test('plainText strips tags, decodes entities and collapses space', () => {
  assert.equal(plainText('<a href="x">SSP</a> &amp; POA&amp;M\n  costs &#36;5 &mdash; &#x2264;3'), 'SSP & POA&M costs $5 — ≤3');
  assert.equal(plainText('bad &#99999999; ref'), 'bad &#99999999; ref');
  // Nested fragments leave no tag behind.
  const nested = plainText('a <scr<b>ipt>alert(1)</scr</b>ipt> b <<i>i>');
  assert.equal(nested, 'a ipt>alert(1)ipt> b i>');
  assert.ok(!/<[^>]*>/.test(nested));
});

test('extractFaq reads h3/answer pairs from the faq section only', () => {
  const html = '<h3>Not this</h3><p>no</p><section class="card" id="faq"><h2>Common questions</h2><h3>Q1?</h3><p>A <strong>one</strong>.</p><h3>Q2?</h3><p>Two</p><p>parts.</p></section>';
  assert.deepEqual(extractFaq(html), [{ q: 'Q1?', a: 'A one.' }, { q: 'Q2?', a: 'Two parts.' }]);
  assert.deepEqual(extractFaq('<main>no faq</main>'), []);
});

test('answersSection links each question to its page section', () => {
  const s = answersSection([{ file: 'index.html', faq: [{ q: 'What [is] it?', a: 'A.' }] }, { file: 'b.html', faq: [{ q: 'B?', a: 'B.' }] }], 'https://h/x/');
  assert.match(s, /^## Answers\n/);
  assert.match(s, /- \[What \\\[is\\\] it\?\]\(https:\/\/h\/x\/#faq\): A\.\n/);
  assert.match(s, /- \[B\?\]\(https:\/\/h\/x\/b\.html#faq\): B\.\n$/);
});

test('questionsSection links the questions and points at the answers file', () => {
  const pages = [{ file: 'a.html', faq: [{ q: 'A?', a: 'Yes.' }, { q: 'B?', a: 'No.' }] }];
  const s = questionsSection(pages, 'https://h/x/');
  assert.match(s, /^## Answers\n/);
  assert.ok(s.includes('(https://h/x/llms-answers.txt)'));
  assert.match(s, /- \[a\]\(https:\/\/h\/x\/a\.html#faq\): A\? B\?\n$/);
  assert.ok(!s.includes('Yes.'));
  assert.equal(answersDoc('T', pages, 'https://h/x/'), '# T: answers\n\nThe questions each page answers in its "Common questions" section, with the answer as the page states it. Each link opens that section; the page has the sources.\n\n- [A?](https://h/x/a.html#faq): Yes.\n- [B?](https://h/x/a.html#faq): No.\n');
});

test('withAnswers inserts before Source, and replaces an existing section in place', () => {
  const sec = '## Answers\n\n- [Q](u): A\n';
  const once = withAnswers('# T\n\n## Tools\n\n- t\n\n## Source\n\n- s\n', sec);
  assert.equal(once, '# T\n\n## Tools\n\n- t\n\n## Answers\n\n- [Q](u): A\n\n## Source\n\n- s\n');
  assert.equal(withAnswers(once, sec), once, 'idempotent');
  assert.equal(withAnswers(once, '## Answers\n\n- [R](u): B\n'), once.replace('- [Q](u): A', '- [R](u): B'));
  assert.equal(withAnswers('# T\n', sec), '# T\n\n## Answers\n\n- [Q](u): A\n');
  assert.equal(withAnswers(withAnswers('# T\n', sec), sec), '# T\n\n## Answers\n\n- [Q](u): A\n', 'idempotent at the end');
});

test('baseUrl keeps the address the llms.txt already uses', () => {
  assert.equal(baseUrl('- [a](https://marisstella.app/x-guides/a.html)', 'x-guides'), 'https://marisstella.app/x-guides/');
  assert.equal(baseUrl('# none', 'y'), 'https://marisstella.app/y/');
  // A slug is matched literally: '.' is not a wildcard and '(' does not throw.
  assert.equal(baseUrl('- [a](https://marisstella.app/axb/a.html)', 'a.b'), 'https://marisstella.app/a.b/');
  assert.equal(baseUrl('- [a](https://marisstella.app/a(b/a.html)', 'a(b'), 'https://marisstella.app/a(b/');
});

// The ratchet: every product whose llms.txt has an Answers section keeps it in
// step with its pages' visible FAQs.
test('every opted-in llms.txt Answers section matches its pages', () => {
  const dirs = optedIn(VENTURES);
  assert.ok(dirs.length >= 2, 'machine-shop-guides and pay-app-guides carry the section');
  for (const dir of dirs) {
    const { llms, next, answers, nextAnswers } = renderFor(dir);
    const rel = relative(fileURLToPath(new URL('../../', import.meta.url)), dir);
    const fix = `run node platform/pages/llms-answers.mjs ${rel}`;
    assert.equal(llms, next, `${rel}/llms.txt Answers out of date: ${fix}`);
    assert.equal(answers, nextAnswers, `${rel}/${ANSWERS_FILE} out of date: ${fix}`);
    assert.ok(Buffer.byteLength(llms) <= INLINE_LIMIT * 1.5, `${rel}/llms.txt is ${Buffer.byteLength(llms)} bytes; too big for one fetch`);
  }
});
