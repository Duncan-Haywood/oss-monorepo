import test from 'node:test';
import assert from 'node:assert/strict';
import { askFailures, FROM_PAGE, NOTHING_FOUND, replyProblems } from './ask-examples.mjs';
import { ASK_SUGGESTIONS } from './assistant.mjs';

// The three real replies ask-check.mjs read on the 2026-11-19 build.
const ROOF = { text: 'These tools match what you asked:', links: ['/c/for-roofers/', '/roofing-bid-calculator/how-to-price-a-roof-by-the-square.html'], dead: [] };
const PRIVACY = { text: `${FROM_PAGE} Not unless you choose a provider that runs elsewhere.`, links: [], dead: [] };

test('the replies the built site gave pass', () => {
  assert.deepEqual(askFailures([
    { question: 'Which tool prices a roofing job?', reply: ROOF },
    { question: 'Does what I type leave my device?', reply: PRIVACY },
  ]), []);
});

test('"I found nothing" fails, and so does no reply at all', () => {
  const nothing = { text: `${NOTHING_FOUND} for that. Try fewer, plainer words.`, links: [], dead: [] };
  assert.deepEqual(replyProblems('zxqv?', nothing), ['"zxqv?": answered "I found nothing"']);
  assert.deepEqual(replyProblems('zxqv?', null), ['"zxqv?": no reply appeared']);
});

test('a reply with neither a passage nor a tool fails', () => {
  assert.equal(replyProblems('How are fees set?', { text: 'Hmm.', links: [], dead: [] }).length, 1);
});

test('a question asking for a tool must get one, even when a passage answers', () => {
  const [problem] = replyProblems('Which calculator prices a deck?', PRIVACY);
  assert.match(problem, /asks for a tool but the reply lists none/);
  assert.deepEqual(replyProblems('Does what I type leave my device?', PRIVACY), []);
});

test('every dead tool link is named', () => {
  const reply = { ...ROOF, dead: ['/roofing-bid-calculator/gone.html', '/c/for-roofers/'] };
  const problems = replyProblems('Which tool prices a roofing job?', reply);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /gone\.html, which does not load/);
});

test('the page has example questions for the check to tap', () => {
  assert.ok(ASK_SUGGESTIONS.length >= 1);
  for (const q of ASK_SUGGESTIONS) assert.ok(q.trim().endsWith('?'), `${q} reads as a question`);
});
