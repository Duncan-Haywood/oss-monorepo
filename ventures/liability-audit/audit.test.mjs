import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, auditFiles, codeView, mask, summarise } from './audit.mjs';

const LICENSE = { path: 'LICENSE', text: 'MIT License' };
const ids = (r) => r.findings.map((f) => f.id);
const status = (r, id) => r.checks.find((c) => c.id === id)?.status;
const run = (files, opts) => auditFiles([LICENSE, ...files], opts);

test('every rule has the fields a report needs', () => {
  const seen = new Set();
  for (const r of RULES) {
    assert.ok(!seen.has(r.id), r.id);
    seen.add(r.id);
    for (const k of ['id', 'category', 'severity', 'title', 'why', 'fix']) assert.ok(r[k], `${r.id}.${k}`);
    assert.equal(typeof r.run, 'function');
  }
});

test('an empty static site with a licence raises nothing', () => {
  const r = run([{ path: 'index.html', text: '<title>Tool</title><p>Hello</p>' }]);
  assert.deepEqual(ids(r), []);
  assert.equal(status(r, 'tracker-without-consent'), 'clear');
  assert.equal(status(r, 'subscription-no-renewal-terms'), 'not-applicable');
});

test('secret-in-tree: live keys are found and masked; placeholders, fakes and fixtures are not', () => {
  const key = `sk_live_${'4eC39HqLyjWDarjtT1zdp7dc'}`;
  const r = run([
    { path: 'src/pay.js', text: `const stripe = require('stripe')('${key}');` },
    { path: 'src/aws.py', text: 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"\nOTHER = "AKIAABCDEFGHIJKLMNOP"' },
    { path: '.env.example', text: `STRIPE_KEY=${key}` },
    { path: 'test/fixtures.js', text: `const k = '${key}';` },
  ]);
  const f = r.findings.find((x) => x.id === 'secret-in-tree');
  assert.equal(f.evidence.length, 1);
  assert.equal(f.evidence[0].file, 'src/pay.js');
  assert.ok(!f.evidence[0].match.includes(key), 'the key itself never appears in a report');
  assert.match(f.evidence[0].match, /Stripe live secret key: sk_l…dc/);
  assert.equal(mask('abc'), '****');
});

test('llm-endpoint-no-spend-control: server + env key + call, and no limit', () => {
  const server = { path: 'api/chat.js', text: `import OpenAI from 'openai';\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\nexport async function POST(req) {\n  const r = await client.chat.completions.create({ model: 'm', max_tokens: 200, messages: [] });\n  return Response.json(r);\n}` };
  assert.ok(ids(run([server])).includes('llm-endpoint-no-spend-control'));
  // The same endpoint with a rate limiter is clear.
  const limited = { ...server, text: `import { Ratelimit } from '@upstash/ratelimit';\n${server.text}` };
  assert.equal(status(run([limited]), 'llm-endpoint-no-spend-control'), 'clear');
  // A CLI that reads the user's own key and serves nothing is clear.
  const cli = { path: 'cli.mjs', text: "const key = process.env.ANTHROPIC_API_KEY;\nawait client.messages.create({ model: 'm', max_tokens: 10, messages });" };
  assert.equal(status(run([cli]), 'llm-endpoint-no-spend-control'), 'clear');
});

test('llm-call-no-output-cap: flags the uncapped call only; ignores calls in strings, comments and patterns', () => {
  const r = run([{ path: 'app.py', text: [
    'resp = client.chat.completions.create(',
    '    model="gpt-x",',
    '    messages=msgs,',
    ')',
    'ok = client.messages.create(model="c", max_tokens=300, messages=m)',
    '# client.messages.create( in a comment',
    'EXAMPLE = "client.messages.create("',
    "CALL = re.compile(r'\\.messages\\.create\\s*\\(')",
  ].join('\n') }]);
  const f = r.findings.find((x) => x.id === 'llm-call-no-output-cap');
  assert.deepEqual(f.evidence.map((e) => e.line), [1]);
});

test('tracker-without-consent and the privacy notice rule', () => {
  const page = { path: 'index.html', text: '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><form><input type="email" name="email"></form>' };
  const r = run([page]);
  assert.ok(ids(r).includes('tracker-without-consent'));
  assert.ok(ids(r).includes('personal-data-no-privacy-notice'));
  assert.deepEqual(r.facts.trackers, ['Google Analytics / Tag Manager']);
  // A consent manager and a privacy page clear both.
  const ok = run([{ ...page, text: `${page.text}<script src="https://consent.cookiebot.com/uc.js"></script>` }, { path: 'privacy.html', text: '<h1>Privacy policy</h1>' }]);
  assert.equal(status(ok, 'tracker-without-consent'), 'clear');
  assert.equal(status(ok, 'personal-data-no-privacy-notice'), 'clear');
});

test('subscription-no-renewal-terms and payments-no-terms', () => {
  const checkout = { path: 'server/checkout.js', text: "import Stripe from 'stripe';\nconst session = await stripe.checkout.sessions.create({ mode: 'subscription', line_items });" };
  const r = run([checkout, { path: 'index.html', text: '<button>Subscribe</button>' }]);
  assert.ok(ids(r).includes('subscription-no-renewal-terms'));
  assert.ok(ids(r).includes('payments-no-terms'));
  const ok = run([checkout,
    { path: 'pricing.html', text: '<p>$9/month. Renews automatically until you cancel. Cancel anytime in Settings.</p>' },
    { path: 'terms.html', text: '<h1>Terms of Service</h1>' }]);
  assert.equal(status(ok, 'subscription-no-renewal-terms'), 'clear');
  assert.equal(status(ok, 'payments-no-terms'), 'clear');
});

test('payment and subscription code shown as a sample in a page is documentation, not integration', () => {
  const r = run([{ path: 'docs.html', text: "<pre>const s = await stripe.checkout.sessions.create({\n  mode: \"subscription\",\n});</pre>" }]);
  assert.equal(status(r, 'subscription-no-renewal-terms'), 'not-applicable');
  assert.equal(r.facts.takesPayments, false);
});

test('an API-key password box is not an account system; a login password is', () => {
  assert.equal(run([{ path: 'index.html', text: '<input id="key" type="password">' }]).facts.takesPayments, false);
  assert.equal(status(run([{ path: 'index.html', text: '<input id="key" type="password">' }]), 'payments-no-terms'), 'not-applicable');
  assert.ok(ids(run([{ path: 'login.html', text: '<input type="password" name="password">' }])).includes('payments-no-terms'));
  assert.equal(status(run([{ path: 'index.html', text: '<input type="number" id="passHolders">' }]), 'payments-no-terms'), 'not-applicable');
});

test('affiliate-links-no-disclosure: disclosure must come before the first link', () => {
  const link = '<a href="https://amzn.to/3abc">buy</a>';
  assert.ok(ids(run([{ path: 'post.html', text: `<p>Great kettle ${link}</p><p>We may earn a commission.</p>` }])).includes('affiliate-links-no-disclosure'));
  assert.equal(status(run([{ path: 'post.html', text: `<p>As an Amazon Associate I earn from qualifying purchases.</p>${link}` }]), 'affiliate-links-no-disclosure'), 'clear');
});

test('ai-output-no-disclosure', () => {
  const call = { path: 'app.js', text: "const r = await anthropic.messages.create({ model: 'c', max_tokens: 500, messages });" };
  assert.ok(ids(run([call, { path: 'index.html', text: '<h1>Write my cover letter</h1>' }])).includes('ai-output-no-disclosure'));
  assert.equal(status(run([call, { path: 'index.html', text: '<p>Drafts are written by an AI model and can be wrong.</p>' }]), 'ai-output-no-disclosure'), 'clear');
});

test('advice-without-disclaimer: only tool pages on advice topics', () => {
  const tool = '<h1>Self-employment tax estimator</h1><input type="number">';
  assert.ok(ids(run([{ path: 'index.html', text: tool }])).includes('advice-without-disclaimer'));
  assert.equal(status(run([{ path: 'index.html', text: `${tool}<p>This is not tax advice.</p>` }]), 'advice-without-disclaimer'), 'clear');
  assert.equal(status(run([{ path: 'index.html', text: '<h1>Tax news</h1><p>No form here.</p>' }]), 'advice-without-disclaimer'), 'clear');
});

test('comparison-no-trademark-notice: brand-shaped names only', () => {
  const flagged = run([{ path: 'vs.html', text: '<title>Our app vs QuickBooks</title>' }]);
  assert.match(flagged.findings.find((f) => f.id === 'comparison-no-trademark-notice').evidence[0].match, /QuickBooks/);
  assert.ok(ids(run([{ path: 'vs.html', text: '<title>Our app vs Acme</title><a href="https://acme.com/pricing">their pricing</a>' }])).includes('comparison-no-trademark-notice'));
  for (const title of ['Pallet vs Carton vs Loose', 'This Checker vs. Reading the Workflow by Eye', 'Repair vs Replace']) {
    assert.equal(status(run([{ path: 'p.html', text: `<title>${title}</title>` }]), 'comparison-no-trademark-notice'), 'clear', title);
  }
  assert.equal(status(run([{ path: 'vs.html', text: '<title>Us vs QuickBooks</title><p>Not affiliated with Intuit.</p>' }]), 'comparison-no-trademark-notice'), 'clear');
});

test('cloud-no-budget-alarm per cloud', () => {
  const aws = { path: 'infra/main.tf', text: 'provider "aws" {\n  region = "us-east-1"\n}\nresource "aws_s3_bucket" "site" {}' };
  const r = run([aws]);
  assert.match(r.findings.find((f) => f.id === 'cloud-no-budget-alarm').evidence[0].match, /^AWS/);
  assert.equal(status(run([aws, { path: 'infra/budget.tf', text: 'resource "aws_budgets_budget" "monthly" {}' }]), 'cloud-no-budget-alarm'), 'clear');
  const gcp = run([{ path: 'main.tf', text: 'provider "google" {}\nresource "google_storage_bucket" "b" {}' }]);
  assert.match(gcp.findings.find((f) => f.id === 'cloud-no-budget-alarm').evidence[0].match, /^Google Cloud/);
});

test('copyleft-dependency reads package-lock licences; dev deps and OR-licences are skipped', () => {
  const lock = { lockfileVersion: 3, packages: {
    '': { name: 'app' },
    'node_modules/agpl-thing': { license: 'AGPL-3.0-only' },
    'node_modules/gpl-dev': { license: 'GPL-3.0', dev: true },
    'node_modules/dual': { license: '(GPL-2.0 OR MIT)' },
    'node_modules/lgpl': { license: 'LGPL-3.0' },
    'node_modules/ok': { license: 'MIT' },
  } };
  const r = run([{ path: 'package-lock.json', text: JSON.stringify(lock, null, 2) }]);
  const f = r.findings.find((x) => x.id === 'copyleft-dependency');
  assert.deepEqual(f.evidence.map((e) => e.match), ['agpl-thing: AGPL-3.0-only']);
});

test('no-license, and --only / --skip', () => {
  assert.ok(ids(auditFiles([{ path: 'index.html', text: '' }])).includes('no-license'));
  const r = auditFiles([{ path: 'index.html', text: '' }], { skip: ['no-license'] });
  assert.ok(!ids(r).includes('no-license'));
  assert.deepEqual(auditFiles([], { only: ['no-license'] }).checks.map((c) => c.id), ['no-license']);
});

test('findings are ordered by severity and summarised', () => {
  const r = auditFiles([
    { path: 'index.html', text: '<script src="https://static.hotjar.com/c/hotjar.js"></script><title>Us vs QuickBooks</title>' },
  ]);
  const sev = r.findings.map((f) => f.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
  const s = summarise(r);
  assert.equal(s.raised, r.findings.length);
  assert.equal(s.high + s.medium + s.low, s.raised);
});

test('codeView keeps line numbers while blanking samples', () => {
  const html = 'a\n<pre>x\ny</pre>\nb';
  const v = codeView({ path: 'p.html', text: html });
  assert.equal(v.length, html.length);
  assert.equal(v.split('\n').length, html.split('\n').length);
  assert.ok(!v.includes('x'));
});
