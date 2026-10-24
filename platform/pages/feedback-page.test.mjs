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
});

test('the shared footer links the feedback page', () => {
  assert.equal(FEEDBACK_PATH, 'feedback/');
  assert.match(renderSiteFooterNav({ toRoot: '../' }), /href="\.\.\/feedback\/"/);
});
