// Static contract over the three files the container serves, plus the image it
// is built from. These are the failures a behavioural suite cannot see: a
// renamed id, an anchor pointing at a section that was deleted, a claim in the
// copy that stopped matching the portfolio, a config file published to the web
// root because the Dockerfile copies the whole directory.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SITE_ROOT, attributeValues, modalKeysInMarkup, readSiteFile } from './fixture.mjs';

const html = readSiteFile('index.html');
const js = readSiteFile('app.js');
const dockerfile = readSiteFile('Dockerfile');

/** `<a ...>` open tags, with their attribute text. */
function anchorTags() {
  return [...html.matchAll(/<a\s([^>]*)>/g)].map((m) => m[1]);
}

test('every brief button has a brief, and every brief has a button', () => {
  const inMarkup = new Set(modalKeysInMarkup(html));
  const inScript = new Set(
    [...js.matchAll(/^\s{2}([a-z][a-zA-Z0-9]*):\s*\{$/gm)].map((m) => m[1])
  );

  assert.ok(inMarkup.size > 0, 'no openModal() call found in index.html');
  assert.ok(inScript.size > 0, 'no venture brief found in specsData');
  assert.deepEqual(
    [...inMarkup].sort(),
    [...inScript].sort(),
    'a brief button with no entry opens an empty modal; an entry with no button is unreachable'
  );
});

test('venture briefs do not draw their own list bullets', () => {
  // The brief bodies are <ul><li>, so the browser draws a marker. Repeating it
  // as a literal character inside the <li> renders "• • Customer:" and reads
  // the bullet out twice. Caught in a browser; only visible once rendered.
  const items = [...js.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  assert.ok(items.length > 0, 'no list items found in the venture briefs');

  const doubled = items.filter((item) => /^[•·▪▫◦*-]\s/.test(item));
  assert.deepEqual(doubled, [], 'list item repeats the marker the browser already draws');
});

test('every element app.js looks up by id exists exactly once', () => {
  const ids = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);

  for (const id of new Set(ids)) {
    const occurrences = [...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length;
    assert.equal(occurrences, 1, `app.js reads #${id}, which index.html declares ${occurrences} times`);
  }
});

test('every class app.js selects exists in the markup', () => {
  const classes = [...js.matchAll(/querySelector(?:All)?\('\.([a-z-]+)'\)/g)].map((m) => m[1]);
  assert.ok(classes.length > 0);

  for (const className of new Set(classes)) {
    assert.match(
      html,
      new RegExp(`class="[^"]*\\b${className}\\b`),
      `app.js selects .${className}, which appears nowhere in index.html`
    );
  }
});

test('no id is declared twice', () => {
  const ids = attributeValues(html, 'id');
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], 'duplicate ids make getElementById pick an arbitrary element');
});

test('every in-page link points at a section that exists', () => {
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set(attributeValues(html, 'id'));

  for (const target of new Set(targets)) {
    assert.ok(ids.has(target), `nav link "#${target}" scrolls to a section index.html does not contain`);
  }
});

test('every filter matches at least one venture, and every venture is reachable by a filter', () => {
  const filters = attributeValues(html, 'data-filter').filter((f) => f !== 'all');
  const categories = attributeValues(html, 'data-category').map((c) => c.split(/\s+/).filter(Boolean));

  assert.ok(filters.length > 0 && categories.length > 0);

  for (const filter of filters) {
    assert.ok(
      categories.some((tokens) => tokens.includes(filter)),
      `filter "${filter}" empties the grid — no venture card carries that category`
    );
  }
  for (const [index, tokens] of categories.entries()) {
    assert.ok(tokens.length > 0, `venture card ${index} has no category, so only "All" can show it`);
    assert.ok(
      tokens.some((token) => filters.includes(token)),
      `venture card ${index} (${tokens.join(' ')}) is not offered by any filter button`
    );
  }
});

test('the portfolio size the page claims matches the portfolio it shows', () => {
  // The hero states a venture count and the featured panel indexes into it.
  // Adding or retiring a venture without updating both leaves the homepage
  // making a false claim about the studio to every visitor.
  const ventureCount = attributeValues(html, 'data-category').length;
  const claimed = html.match(/<div class="metric-value">(\d+)<\/div>\s*<div class="metric-label">Ventures/);
  const featureIndex = html.match(/class="feature-index">(\d+)\s*\/\s*(\d+)</);

  assert.ok(claimed, 'the hero no longer states a venture count; update this test with the copy');
  assert.equal(
    Number(claimed[1]),
    ventureCount,
    `the hero claims ${claimed[1]} ventures, the grid shows ${ventureCount}`
  );

  assert.ok(featureIndex, 'the featured panel no longer carries an index; update this test with the copy');
  assert.equal(
    Number(featureIndex[2]),
    ventureCount,
    `the featured panel counts out of ${featureIndex[2]}, the grid shows ${ventureCount}`
  );
  assert.ok(
    Number(featureIndex[1]) >= 1 && Number(featureIndex[1]) <= ventureCount,
    'the featured panel indexes a venture outside the portfolio'
  );
});

test('every link that opens a new tab severs the opener reference', () => {
  // Without rel="noopener" the destination gets window.opener and can navigate
  // this tab somewhere else — reverse tabnabbing on the studio's front door.
  const offenders = anchorTags()
    .filter((attrs) => /target="_blank"/.test(attrs))
    .filter((attrs) => !/rel="[^"]*\bnoopener\b[^"]*"/.test(attrs));

  assert.deepEqual(offenders, [], 'target="_blank" without rel="noopener"');
});

test('every external link is https', () => {
  const external = [...html.matchAll(/href="(http:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(external, [], 'plaintext http link on a page served over https');
});

test('every interactive control has an accessible name', () => {
  const buttons = [...html.matchAll(/<button\s([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length > 0, 'no buttons found; update this test if the page changed shape');

  for (const [, attrs, body] of buttons) {
    const text = body.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '').trim();
    const labelled = /aria-label="[^"]+"/.test(attrs);
    assert.ok(text || labelled, `a button has neither text nor aria-label: <button ${attrs}>`);
  }
});

test('every local asset the page requests is in the repository', () => {
  const refs = [
    ...[...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]),
  ].filter((ref) => !ref.startsWith('//') && !ref.startsWith('data:'));

  assert.ok(refs.length > 0);
  for (const ref of new Set(refs)) {
    assert.ok(
      fs.existsSync(path.join(SITE_ROOT, ref)),
      `index.html requests ${ref}, which does not exist — the container would serve a 404`
    );
  }
});

test('the container does not publish its own build and config files', () => {
  // The Dockerfile copies the build context into the web root, so anything not
  // excluded is fetchable: nginx.conf discloses the server configuration and
  // the CSP, and package.json/Dockerfile disclose the toolchain. nginx only
  // denies dotfiles, so the exclusion has to happen at build time.
  assert.match(dockerfile, /^COPY \. /m, 'this test models a whole-context COPY; revisit it if that changed');

  const ignorePath = path.join(SITE_ROOT, '.dockerignore');
  assert.ok(fs.existsSync(ignorePath), 'no .dockerignore, so the whole build context is served publicly');

  const ignored = fs
    .readFileSync(ignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  for (const required of ['Dockerfile', '.dockerignore', 'nginx.conf', 'package.json', 'test', '*.png']) {
    assert.ok(
      ignored.includes(required),
      `.dockerignore must exclude ${required} from the public web root`
    );
  }
});

test('the served origin still sets its security headers', () => {
  const nginx = readSiteFile('nginx.conf');
  for (const header of [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy',
  ]) {
    assert.match(nginx, new RegExp(`add_header ${header} `), `${header} was dropped from nginx.conf`);
  }
  assert.match(nginx, /server_tokens off/, 'nginx would advertise its version');
});

test('the page declares a language and a description', () => {
  assert.match(html, /<html lang="[a-z]{2}(-[A-Z]{2})?"/, 'no lang attribute for assistive technology');
  assert.match(html, /<meta name="description" content="[^"]{40,}"/, 'no usable meta description');
  assert.equal(
    [...html.matchAll(/<h1[\s>]/g)].length,
    1,
    'a page should have exactly one h1'
  );
});
