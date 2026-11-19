// /ask/'s example questions: the judge (ask-suggestions.mjs; browser half
// ask-suggestions-check.mjs) and the question ranking the answers use
// (rankForQuestion in assistant/fill.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { ASK_EXPECTATIONS, coverage, judgeReply, splitReply } from './ask-suggestions.mjs';
import { ASK_SUGGESTIONS } from './assistant.mjs';
import { QUESTION_WORDS, rankForQuestion } from './assistant/fill.mjs';

test('every example question on /ask/ has an expectation, and none is stale', () => {
  assert.deepEqual(coverage(ASK_SUGGESTIONS), { unchecked: [], stale: [] });
});

test('"I found nothing" fails, as does a reply with no passage and no links', () => {
  const q = 'Which tool prices a roofing job?';
  const nothing = { text: 'I found nothing on this page or in the catalogue for that.', passage: null, links: [] };
  const out = judgeReply(q, nothing);
  assert.ok(out.some((p) => /I found nothing/.test(p)));
  assert.ok(out.some((p) => /neither a passage/.test(p)));
  assert.deepEqual(judgeReply(q, null).slice(-1), ['no reply appeared']);
});

test('a link expectation passes on the title or the href', () => {
  const q = 'Which tool prices a roofing job?';
  assert.deepEqual(judgeReply(q, { text: '', passage: null, links: [{ title: 'Bid tools', href: '/roofing-bid-calculator/' }] }), []);
  assert.equal(judgeReply(q, { text: '', passage: null, links: [{ title: 'Lawn Care Bid Calculator', href: '/lawn/' }] }).length, 1);
});

test('the 2026-11-19 privacy reply on main fails: right passage, unrelated tools under it', () => {
  const q = 'Does what I type leave my device?';
  const passage = 'Not unless you choose a provider that runs elsewhere. With no model (the default) nothing is sent.';
  const links = ['Where does the sleeve end on my arm?', 'Why does my semver range skip prereleases?']
    .map((title) => ({ title, href: '/x/' }));
  const out = judgeReply(q, { text: `From this page: ${passage}`, passage, links });
  assert.equal(out.length, 1);
  assert.match(out[0], /2 tool link\(s\) under the answer, at most 0/);
  assert.deepEqual(judgeReply(q, { text: `From this page: ${passage}`, passage, links: [] }), []);
});

test('a question the page shows without an expectation fails', () => {
  assert.match(judgeReply('Something new?', { text: 'x', passage: 'x', links: [] })[0], /no expectation/);
  assert.deepEqual(coverage(['A?', 'B?'], { 'B?': {}, 'C?': {} }), { unchecked: ['A?'], stale: ['C?'] });
});

test('splitReply takes the passage up to the tools line', () => {
  assert.deepEqual(splitReply('From this page: It runs here.\nRelated tools:'), { text: 'From this page: It runs here.\nRelated tools:', passage: 'It runs here.' });
  assert.equal(splitReply('These tools match what you asked:').passage, null);
  assert.ok(Object.keys(ASK_EXPECTATIONS).length >= ASK_SUGGESTIONS.length);
});

// The same weights as searchScore in build.mjs (4 for a word in the name, 1 in
// the text), on plain words so the test needs no build.
const score = (name, text, forms) => {
  let s = 0;
  for (const v of forms) {
    if (v.some((w) => (` ${name}`).includes(` ${w}`))) s += 4;
    else if (v.some((w) => (` ${text}`).includes(` ${w}`))) s += 1;
  }
  return s + 1 / (2 + name.split(' ').length);
};
const variants = (w) => [w];
const index = (items) => ({ stop: new Set(['what', 'the', 'to', 'a']), items: items.map(([t, n, x]) => ({ t, n, x })) });

test('question words do not rank: "does my" no longer finds "Does my job qualify"', () => {
  const data = index([
    ['Does my job qualify for no tax on tips?', 'does my job qualify no tax tips', 'tips overtime'],
    ['Where does the sleeve end on my arm?', 'does sleeve end my arm', 'knit'],
  ]);
  for (const w of ['does', 'my', 'can', 'much']) assert.ok(QUESTION_WORDS.has(w));
  assert.deepEqual(rankForQuestion(data, 'Does my what', { variants, score }), []);
});

test('two words found only in the text are weak; a name hit plus another word is strong', () => {
  const data = index([
    ['Chimney Sweep Bid Calculator', 'chimney sweep bid calculator', 'type of flue leave a note'],
    ['Lawn Care Bid Calculator', 'lawn care bid calculator', 'mow price'],
  ]);
  // "type" + "leave" both only in the chimney text: weak, so with the page answering nothing is listed.
  assert.deepEqual(rankForQuestion(data, 'type leave device', { variants, score, strongOnly: true }), []);
  // Without a page answer the weak ranking is the fallback, as before.
  assert.deepEqual(rankForQuestion(data, 'type leave device', { variants, score }).map((i) => i.t), ['Chimney Sweep Bid Calculator']);
  // "lawn" in the name and "mow" in the text: strong, and it leads.
  assert.deepEqual(rankForQuestion(data, 'how much to mow a lawn', { variants, score, strongOnly: true }).map((i) => i.t), ['Lawn Care Bid Calculator']);
});

test('a one-word question needs only a name hit', () => {
  const data = index([['Poshmark Fee Calculator', 'poshmark fee calculator', ''], ['Resale notes', 'resale notes', 'poshmark']]);
  assert.deepEqual(rankForQuestion(data, 'How much does Poshmark take?', { variants, score, strongOnly: true, limit: 5 }).map((i) => i.t), []);
  assert.deepEqual(rankForQuestion(data, 'Poshmark?', { variants, score, strongOnly: true }).map((i) => i.t), ['Poshmark Fee Calculator']);
});

test('a reply that links a page that does not load fails, naming the page', () => {
  const reply = {
    text: 'These tools match what you asked:',
    passage: null,
    links: [{ title: 'Roofing Bid Calculator', href: '../roofing-bid-calculator/' }],
    dead: ['/roofing-bid-calculator/'],
  };
  assert.deepEqual(judgeReply('Which tool prices a roofing job?', reply), ['links /roofing-bid-calculator/, which does not load']);
  assert.deepEqual(judgeReply('Which tool prices a roofing job?', { ...reply, dead: [] }), []);
});
