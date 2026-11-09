import test from 'node:test';
import assert from 'node:assert/strict';
import { addNoscriptNotice, NOSCRIPT_NOTICE } from './build.mjs';

const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body class="x">${body}</body></html>`;

test('a scripted page with controls gets the notice right after <body>', () => {
  const out = addNoscriptNotice(page('<input><button>Go</button><script>1</script>'));
  assert.ok(out.includes(`<body class="x">${NOSCRIPT_NOTICE}<input>`));
});

test('JSON-LD alone is not a script that needs running', () => {
  const html = page('<input>', '<script type="application/ld+json">{}</script>');
  assert.equal(addNoscriptNotice(html), html);
});

test('pages without controls, without a body, or with their own noscript are untouched', () => {
  for (const html of [
    page('<p>hi</p><script>1</script>'),
    '<input><script>1</script>',
    page('<noscript>mine</noscript><input><script>1</script>'),
  ]) assert.equal(addNoscriptNotice(html), html);
});

test('idempotent', () => {
  const once = addNoscriptNotice(page('<button>b</button><script>1</script>'));
  assert.equal(addNoscriptNotice(once), once);
});
