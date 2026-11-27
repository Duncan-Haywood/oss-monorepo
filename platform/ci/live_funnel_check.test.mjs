import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUNNELS, judgeAppPage, judgeFrontDoor } from './live_funnel_check.mjs';

const good = {
  status: 200,
  title: 'PayApps · Pay applications for specialty subcontractors',
  description: 'Schedule of values, change orders, retainage.',
  hasEmail: true,
  hasPassword: true,
  submitText: 'Sign up',
  scrollWidth: 390,
  viewportWidth: 390,
  pageErrors: [],
  badResponses: [{ status: 401, url: 'https://payapps.marisstella.app/api/me' }],
  legal: [
    { href: 'https://payapps.marisstella.app/legal/terms', status: 200 },
    { href: 'https://payapps.marisstella.app/legal/privacy', status: 200 },
  ],
};

test('a healthy sign-up page passes, the signed-out 401 on /api/me included', () => {
  assert.deepEqual(judgeAppPage(good), []);
});

test('a stale title and a missing description are named', () => {
  const p = judgeAppPage({ ...good, title: 'PayApps (in development)', description: '' });
  assert.deepEqual(p, ['title reads "PayApps (in development)"', 'no meta description']);
});

test('a form that opens on sign-in, not sign-up, fails', () => {
  assert.match(judgeAppPage({ ...good, submitText: 'Sign in' }).join(), /opens on "Sign in"/);
  assert.match(judgeAppPage({ ...good, submitText: null }).join(), /no submit button/);
  assert.deepEqual(judgeAppPage({ ...good, submitText: 'Create account' }), []);
});

test('missing fields, sideways scroll, script errors and unexpected 4xx/5xx are named', () => {
  const p = judgeAppPage({
    ...good,
    hasEmail: false,
    hasPassword: false,
    scrollWidth: 420,
    pageErrors: ['x is not defined'],
    badResponses: [{ status: 500, url: 'https://payapps.marisstella.app/api/plans' }],
  });
  assert.equal(p.length, 5);
  assert.ok(p.includes('scrolls sideways at 390px (420px wide)'));
  assert.ok(p.includes('500 https://payapps.marisstella.app/api/plans'));
});

test('one pixel of rounding is not overflow', () => {
  assert.deepEqual(judgeAppPage({ ...good, scrollWidth: 391 }), []);
});

test('legal pages must exist and answer 200', () => {
  assert.match(judgeAppPage({ ...good, legal: [good.legal[0]] }).join(), /fewer than two legal links/);
  const broken = [good.legal[0], { ...good.legal[1], status: 404 }];
  assert.match(judgeAppPage({ ...good, legal: broken }).join(), /legal\/privacy answered 404/);
});

test('a non-200 page is named', () => {
  assert.ok(judgeAppPage({ ...good, status: 503 }).includes('answered 503'));
});

const payapps = FUNNELS.find((f) => f.app === 'payapps');
const sellerBooks = FUNNELS.find((f) => f.app === 'seller-books');

test('a front door linking to ?signup passes; one linking only to the sign-in page fails', () => {
  const url = 'https://marisstella.app/pay-app-guides/';
  const ok = { url, status: 200, links: ['https://payapps.marisstella.app/?signup&from=pay-app-guides'] };
  assert.deepEqual(judgeFrontDoor(ok, payapps), []);
  const signIn = { url, status: 200, links: ['https://payapps.marisstella.app/'] };
  assert.match(judgeFrontDoor(signIn, payapps).join(), /not to its sign-up/);
  assert.match(judgeFrontDoor({ url, status: 200, links: ['/other/'] }, payapps).join(), /no link to/);
  assert.match(judgeFrontDoor({ url, status: 404, links: [] }, payapps).join(), /answered 404/);
});

test('a path-style sign-up (Seller Books /signup) is matched by path', () => {
  const url = 'https://marisstella.app/industries/online-sellers/';
  const ok = { url, status: 200, links: ['https://seller-books.marisstella.app/signup?from=x'] };
  assert.deepEqual(judgeFrontDoor(ok, sellerBooks), []);
  const home = { url, status: 200, links: ['https://seller-books.marisstella.app/'] };
  assert.match(judgeFrontDoor(home, sellerBooks).join(), /not to its sign-up/);
});

test('every funnel names an https app and a sign-up path', () => {
  for (const f of FUNNELS) {
    assert.match(f.base, /^https:\/\/[a-z-]+\.marisstella\.app$/);
    assert.match(f.signupPath, /^\//);
  }
});
