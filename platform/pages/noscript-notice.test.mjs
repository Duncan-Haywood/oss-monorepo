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

test('the merged walk writes the same bytes and lists as the two passes in turn', async () => {
  const { promises: fs } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { addNoscriptNoticesIn, markSponsorLinksIn, markSponsorsAndNoscriptIn, SPONSORS_URL } = await import('./build.mjs');
  const sponsor = `<a href="${SPONSORS_URL}">Sponsor</a>`;
  const pages = {
    'both.html': page(`<input>${sponsor}<script>1</script>`),
    'sponsor-only.html': page(`<p>${sponsor}</p>`),
    'notice-only.html': page('<button>b</button><script>1</script>'),
    'neither.html': page('<p>plain</p>'),
    'deep/a/b.html': page(`${sponsor}<select></select><script src="x.js"></script>`),
    'not-html.txt': `<body>${sponsor}<input><script>1</script>`,
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-merged-walk-'));
  const write = async (dir) => {
    for (const [name, html] of Object.entries(pages)) {
      await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await fs.writeFile(path.join(dir, name), html);
    }
  };
  const [a, b] = [path.join(root, 'a'), path.join(root, 'b')];
  await write(a);
  await write(b);
  const sponsored = await markSponsorLinksIn(a);
  const noscripted = await addNoscriptNoticesIn(a);
  const merged = await markSponsorsAndNoscriptIn(b);
  assert.deepEqual(merged, { sponsored, noscripted });
  assert.equal(sponsored.length, 3);
  assert.equal(noscripted.length, 3);
  for (const name of Object.keys(pages)) {
    assert.equal(await fs.readFile(path.join(b, name), 'utf8'), await fs.readFile(path.join(a, name), 'utf8'), name);
  }
  await fs.rm(root, { recursive: true, force: true });
});
