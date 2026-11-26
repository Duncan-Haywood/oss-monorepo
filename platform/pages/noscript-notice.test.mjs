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

test('the one-walk finish writes the same bytes and reports as the title, sponsor/notice and share passes in turn', async () => {
  const { promises: fs } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { finishPagesInOneWalk, markSponsorsAndNoscriptIn, SPONSORS_URL, SOCIAL_CARD_FILE } = await import('./build.mjs');
  const { fixPostTitleClashes } = await import('./page-identity.mjs');
  const { addShareCards } = await import('./share.mjs');
  const sponsor = `<a href="${SPONSORS_URL}">Sponsor</a>`;
  const own = (title, extra = '') => `<title>${title}</title><meta property="og:title" content="${title}"><meta property="og:image" content="https://x.test/own.png">${extra}`;
  const pages = {
    // A tool page and a post that reuses its title: the post is retitled.
    'tool/index.html': page(`<h1>Same</h1><input>${sponsor}<script>1</script>`, own('Same')),
    'engineering/post/index.html': page(`<h1>A post of its own</h1><p>${sponsor}</p>`, own('Same', '<meta name="description" content="Same">')),
    'engineering/other/index.html': page('<h1>Other</h1><button>b</button><script>1</script>', own('Other')),
    // On the site-wide card, so it plans a card of its own.
    'guides/one/index.html': page('<h1>Guide one</h1>', `<title>Guide one</title><meta property="og:image" content="https://x.test/${SOCIAL_CARD_FILE}">`),
    'plain.html': page('<p>plain</p>'),
    'not-html.txt': `<body>${sponsor}<input><script>1</script>`,
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-one-walk-'));
  const saved = process.env.PAGES_CARD_CACHE;
  process.env.PAGES_CARD_CACHE = path.join(root, 'cards');
  try {
    const write = async (dir) => {
      for (const [name, html] of Object.entries(pages)) {
        await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
        await fs.writeFile(path.join(dir, name), html);
      }
    };
    const [a, b] = [path.join(root, 'a'), path.join(root, 'b')];
    await write(a);
    await write(b);
    const opts = { baseUrl: 'https://x.test/', siteName: 'S', siteCard: SOCIAL_CARD_FILE };
    const logA = [], logB = [];
    const { sponsored, noscripted } = await markSponsorsAndNoscriptIn(a);
    const retitled = await fixPostTitleClashes(a, { log: (l) => logA.push(l) });
    const shareCards = await addShareCards({ outDir: a, ...opts });
    const one = await finishPagesInOneWalk(b, { ...opts, log: (l) => logB.push(l) });
    assert.deepEqual(one, { sponsored, noscripted, retitled, shareCards });
    assert.deepEqual(logB, logA);
    assert.equal(retitled.length, 1);
    assert.equal(shareCards.cards.length, 1);
    for (const name of [...Object.keys(pages), 'guides/one/share-card.png']) {
      assert.deepEqual(await fs.readFile(path.join(b, name)), await fs.readFile(path.join(a, name)), name);
    }
  } finally {
    if (saved === undefined) delete process.env.PAGES_CARD_CACHE; else process.env.PAGES_CARD_CACHE = saved;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the site\'s own embed box and search form are not the page\'s controls', () => {
  const embed = '<details class="pf-chrome pf-embed-offer"><summary>Embed</summary><textarea readonly></textarea><button type="button">Copy</button></details>';
  const search = '<form class="pfs-search" action="../" method="get" role="search"><input name="q"><button type="submit">Search</button></form>';
  const plain = page(`<p>An info page.</p>${search}${embed}<script>chrome()</script>`);
  assert.equal(addNoscriptNotice(plain), plain);
  const tool = page(`<input id="hours">${search}${embed}<script>calc()</script>`);
  assert.ok(addNoscriptNotice(tool).includes(NOSCRIPT_NOTICE));
});
