// The feedback page (`feedback/`) offers a form only when the build knows the
// platform/edge endpoint, so a visitor is never shown a form that goes nowhere,
// and every tool's footer links to it with the tool named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFeedbackPage, FEEDBACK_PATH } from './build.mjs';
import { renderSiteFooterNav } from './site-nav.mjs';

const base = 'https://duncan-haywood.github.io/oss-monorepo/';

test('without an endpoint: GitHub issue links only, no form, no request', () => {
  const html = renderFeedbackPage({ surfaces: [], baseUrl: base, feedbackUrl: '' });
  assert.ok(!html.includes('<form id="fb"'));
  assert.ok(!html.includes('fetch('));
  assert.match(html, /issues\/new\?template=bug\.yml/);
  assert.match(html, /issues\/new\?template=feature\.yml/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('with an endpoint: the form posts to it and says the message is public', () => {
  const html = renderFeedbackPage({ surfaces: [], baseUrl: base, feedbackUrl: 'https://edge.example' });
  assert.match(html, /<form id="fb"/);
  assert.match(html, /fetch\("https:\/\/edge\.example\/feedback"/);
  assert.match(html, /public GitHub repository/);
  assert.match(html, /name="website"/, 'honeypot field');
  assert.match(html, /MIT\s+licence with the repository owner's copyright notice/, 'feature requests carry the IP terms');
  assert.match(html, /href="\.\.\/custom-development\/"/);
});

test('the shared footer links the feedback page', () => {
  assert.equal(FEEDBACK_PATH, 'feedback/');
  assert.match(renderSiteFooterNav({ toRoot: '../' }), /href="\.\.\/feedback\/"/);
});

test('the form offers research questions and topics, each accepted by the edge worker', async () => {
  const { FEEDBACK_TYPES } = await import('../edge/feedback.mjs');
  const html = renderFeedbackPage({ surfaces: [], baseUrl: base, feedbackUrl: 'https://edge.example' });
  const offered = [...html.matchAll(/name="type" value="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered, ['problem', 'idea', 'research', 'topic', 'other']);
  for (const t of offered) assert.ok(FEEDBACK_TYPES.includes(t), t);
  assert.match(html, /q\.get\('type'\)/, 'a ?type= link preselects the kind');
});
