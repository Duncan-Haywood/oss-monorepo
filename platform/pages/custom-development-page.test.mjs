// The open custom development page (`custom-development/`): how to ask, the
// licence term stated up front, and the request queue from
// portfolio/requests/requests.json with nothing in it unescaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCustomDevelopmentPage, renderCustomRequestPage, customRequestPath, REQUEST_KINDS, CUSTOM_DEV_PATH, renderHubSitemap } from './build.mjs';
import { FEEDBACK_TYPES } from '../edge/feedback.mjs';
import { injectChrome } from './build.mjs';
import { renderSiteFooterNav } from './site-nav.mjs';
import { loadRequests } from '../../portfolio/requests/requests.mjs';

const base = 'https://example.test/';

test('states the MIT term, links the issue form, and is indexable', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [] });
  assert.match(html, /MIT licen[cs]e/);
  assert.match(html, /held by the repository owner/);
  assert.match(html, /issues\/new\?template=custom-build\.yml/);
  assert.match(html, /No warranty/);
  assert.ok(!/content="noindex"/.test(html));
  assert.match(html, /No requests on file yet/);
});

test('lists the committed queue, escaped', () => {
  const requests = loadRequests();
  assert.ok(requests.length > 0);
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests });
  for (const r of requests) assert.ok(html.includes(r.id));
  const evil = renderCustomDevelopmentPage({ baseUrl: base, requests: [{ id: 'R-0099', title: '<script>x</script>', ask: 'a', source: 'issue', status: 'received', received: '2026-10-30', updated: '2026-10-30' }] });
  assert.ok(!evil.includes('<script>x</script>'));
});

test('speaks to businesses: the headline, two ways in, and FAQ data that matches the page', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [] });
  assert.match(html, /<h1>Describe your problem and it gets built\.<\/h1>/);
  assert.match(html, /<title>Free custom software for your business/);
  assert.match(html, /href="\.\.\/feedback\/"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 4);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<dt>${q.name}</dt>`), q.name);
});

test('in the footer and the hub sitemap', () => {
  assert.match(renderSiteFooterNav({ toRoot: '../' }), new RegExp(`href="\\.\\./${CUSTOM_DEV_PATH}"`));
  assert.match(renderHubSitemap(base), new RegExp(`${base}${CUSTOM_DEV_PATH}`));
});

const surfaces = [{ slug: 'ai-bookkeeper', title: 'AI bookkeeper' }, { slug: 'roof-pitch', title: 'Roof pitch' }];
const one = { id: 'R-0001', title: 'Books', ask: 'make books', source: 'owner', status: 'building', received: '2026-10-21', updated: '2026-10-30', project: 'ventures/ai-bookkeeper', next: 'a real export' };

test('the request form offers every kind, needs the licence box, and posts to the feedback endpoint', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [one], surfaces, feedbackUrl: 'https://edge.example' });
  assert.match(html, /id="cdf"/);
  for (const k of REQUEST_KINDS) assert.ok(html.includes(`value="${k.id}"`), k.id);
  assert.match(html, /https:\/\/edge\.example\/feedback/);
  assert.match(html, /name="licence"/);
  assert.match(html, /<option value="roof-pitch">Roof pitch<\/option>/);
  assert.match(html, /<option value="R-0001">R-0001: Books<\/option>/);
  // Every kind maps to a type the edge accepts, so nothing is refused server side.
  for (const k of REQUEST_KINDS) assert.ok(FEEDBACK_TYPES.includes(k.type), k.id);
});

test('without the endpoint there is no form that goes nowhere, and the issue form is the call to action', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [one], surfaces, feedbackUrl: '' });
  assert.ok(!html.includes('id="cdf"'));
  assert.match(html, /class="cd-go" href="https:\/\/github\.com\/[^"]+custom-build\.yml"/);
});

test('the queue is filterable and each row links its own page and the published tool', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [one], surfaces, feedbackUrl: '' });
  assert.match(html, /id="cd-filter"/);
  assert.match(html, /data-status="building"/);
  assert.match(html, /href="R-0001\/"/);
  assert.match(html, /href="\.\.\/ai-bookkeeper\/">try it/);
});

test('a request page shows its stage, links what to try, and presets preview feedback', () => {
  const html = renderCustomRequestPage({ request: one, baseUrl: base, requests: [one], surfaces, feedbackUrl: 'https://edge.example' });
  assert.match(html, new RegExp(`rel="canonical" href="${base}${customRequestPath('R-0001')}"`));
  assert.match(html, /class="cd-step cd-now" aria-current="step"><span class="cd-dot" aria-hidden="true"><\/span><span class="cd-step-name">building/);
  assert.match(html, /href="\.\.\/\.\.\/ai-bookkeeper\/"><strong>Try it/);
  assert.match(html, /value="preview" checked/);
  assert.match(html, /<option value="R-0001" selected>/);
  assert.match(html, /No warranty/);
  const declined = renderCustomRequestPage({ request: { ...one, status: 'declined', reason: 'needs a paid account' }, baseUrl: base, surfaces, feedbackUrl: 'https://edge.example' });
  assert.match(declined, /needs a paid account/);
  assert.ok(!declined.includes('id="cdf"'), 'no feedback form on a declined request');
  const evil = renderCustomRequestPage({ request: { ...one, ask: '<img src=x onerror=alert(1)>' }, baseUrl: base, surfaces });
  assert.ok(!evil.includes('<img src=x'));
});

test('request pages are in the hub sitemap', () => {
  for (const r of loadRequests()) assert.match(renderHubSitemap(base), new RegExp(`${base}${customRequestPath(r.id)}`));
});

test('every tool footer offers a feature request for that tool, once, below the tool itself', () => {
  const page = '<!doctype html><html><head><title>t</title></head><body><main>tool</main></body></html>';
  const out = injectChrome(page, { slug: 'roof-pitch', toRoot: '../', total: 3, isEntry: true, baseUrl: base });
  assert.equal(out.match(/class="pf-ask"/g).length, 1);
  assert.match(out, /href="\.\.\/custom-development\/\?kind=feature&amp;tool=roof-pitch#request">Request a feature/);
  assert.ok(out.indexOf('<main>tool</main>') < out.indexOf('pf-ask'));
});

test('offers every request kind and explains the injection screen', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [] });
  for (const t of ['idea', 'research', 'topic']) assert.ok(html.includes(`feedback/?type=${t}`), t);
  assert.match(html, /template=idea\.yml&amp;title=%5Bresearch%5D/);
  assert.match(html, /id="screening"/);
  assert.match(html, /portfolio\/requests\/screen\.mjs/);
});

test('the request form offers dictation, hidden until the browser can do it', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [one], surfaces, feedbackUrl: 'https://edge.example' });
  assert.match(html, /data-mic="cdf-job"/);
  assert.match(html, /data-mic="cdf-done"/);
  assert.match(html, /<p class="cd-mic-row" hidden>/);
  assert.match(html, /webkitSpeechRecognition/);
  assert.match(html, /nothing is sent to this site until you press Send/);
  // The inline script still parses after the template literal's escaping.
  const script = html.match(/<script>\s*(\(function\(\)\{[\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
});

test('a research request can name any existing research direction, grouped and escaped', async () => {
  const { researchDirections } = await import('./build.mjs');
  const directions = researchDirections();
  assert.ok(directions.programmes.length > 0, 'open programmes parsed from research/PROGRAMMES.md');
  assert.ok(directions.themes.length > 0);
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [], surfaces, feedbackUrl: 'https://edge.example', directions });
  assert.match(html, /id="cdf-dir"/);
  assert.match(html, /<optgroup label="Open research programmes">/);
  for (const p of directions.programmes) assert.ok(html.includes(`<option value="${p.slug}">`), p.slug);
  for (const t of directions.themes) for (const p of t.projects) assert.ok(html.includes(`<option value="${p.slug}">`), p.slug);
  assert.ok(REQUEST_KINDS.find((k) => k.id === 'research').direction);
  const evil = renderCustomDevelopmentPage({ baseUrl: base, requests: [], surfaces, feedbackUrl: 'https://edge.example', directions: { programmes: [], themes: [{ name: '<b>t</b>', projects: [{ slug: 'x', title: '<script>y</script>' }] }] } });
  assert.ok(!evil.includes('<script>y</script>') && !evil.includes('<b>t</b>'));
  // With no directions there is no empty picker.
  assert.ok(!renderCustomDevelopmentPage({ baseUrl: base, requests: [], surfaces, feedbackUrl: 'https://edge.example' }).includes('cdf-dir'));
});
