import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'platform/ci/deploy-homepage.sh');
const SITE_ROOT = path.join(REPO_ROOT, 'portfolio/marisstella-homepage');

/**
 * What the production homepage serves is the ConfigMap this script builds, not
 * the container image's web root.
 *
 * `web-portal-web-service` mounts `marisstella-homepage-files` at
 * /usr/share/nginx/html with no `items:` selector, so the mount shadows the
 * image's web root entirely and *every key in the ConfigMap is a file on the
 * public site*. That makes this script — not the Dockerfile and not
 * `.dockerignore` — the thing that decides the public file set.
 *
 * SEC-021 was recorded as fixed by adding nginx.conf, package.json and friends
 * to `.dockerignore`, and `portfolio/marisstella-homepage/test/markup-contract.test.mjs`
 * still holds that. Both are correct for anyone running the image directly, and
 * neither binds on production: the deployed web root is overwritten by this
 * mount. Confirmed 2026-08-02 against the live cluster — the ConfigMap held
 * exactly `Dockerfile`, `app.js`, `index.html`, `style.css`, and
 * https://marisstella.dev/Dockerfile returned the repository's Dockerfile
 * byte-for-byte (SEC-022). nginx.conf and package.json were 404 there not
 * because `.dockerignore` excluded them but because this script never published
 * them.
 *
 * So this test reads the artifact production actually serves. It is an
 * allow-list: a key has to be a file type the site is meant to serve, and
 * anything unrecognized fails rather than being assumed harmless. That is the
 * opposite of the deny-list in `.dockerignore`, whose recorded residual risk
 * was exactly that a new config file ships public until someone remembers to
 * add it.
 */

const SERVABLE_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.txt',
  '.webmanifest',
  '.xml',
]);

/** Keys the site must keep serving; losing one is an outage, not a hardening. */
const REQUIRED_KEYS = ['index.html', 'style.css', 'app.js'];

function script() {
  return fs.readFileSync(DEPLOY_SCRIPT, 'utf8');
}

/**
 * Every `--from-file` the script passes to `kubectl create configmap`, as
 * `{ key, source }`. A bare `--from-file=<path>` has no `key=` and is returned
 * with `key: null`; that form is a directory-or-basename publish and is
 * rejected below rather than parsed, because it decides the public file set at
 * runtime from whatever happens to be on disk.
 */
function publishedEntries() {
  const entries = [];
  const pattern = /--from-file=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  for (const match of script().matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3];
    const separator = raw.indexOf('=');
    if (separator === -1) {
      entries.push({ key: null, source: raw, raw });
      continue;
    }
    entries.push({
      key: raw.slice(0, separator),
      source: raw.slice(separator + 1),
      raw,
    });
  }
  return entries;
}

test('Homepage release surface - the parser sees the real publish list', () => {
  // A matcher that silently matches nothing would pass this file forever while
  // enforcing nothing, which is the defect class this test exists to catch one
  // level up. Anchor it to the script's actual shape first.
  const entries = publishedEntries();
  assert.ok(
    entries.length > 0,
    'no --from-file entries parsed from deploy-homepage.sh; the ConfigMap is built some other way now and this test no longer reads the release surface'
  );
  assert.match(
    script(),
    /kubectl[^\n]*create configmap/,
    'deploy-homepage.sh no longer creates the ConfigMap; revisit what production serves before trusting this test'
  );
});

test('Homepage release surface - every published key is a servable asset', () => {
  const offenders = [];
  for (const { key, raw } of publishedEntries()) {
    if (key === null) continue; // covered by its own test below
    const extension = path.extname(key).toLowerCase();
    if (!SERVABLE_EXTENSIONS.has(extension)) {
      offenders.push(`${raw} (key "${key}" has no servable extension)`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `deploy-homepage.sh publishes ${offenders.length} key(s) to the public web root that the site does not serve. ` +
      'The ConfigMap is mounted whole, so each one is fetchable from https://marisstella.dev/. ' +
      'Build recipes, server config, manifests and lockfiles do not belong in the release set: ' +
      offenders.join(', ')
  );
});

test('Homepage release surface - no key is published from an unresolved path', () => {
  const bare = publishedEntries().filter((entry) => entry.key === null);
  assert.deepEqual(
    bare.map((entry) => entry.raw),
    [],
    'a --from-file without an explicit key=path publishes a directory or a basename, ' +
      'which lets the public file set be decided by whatever is on disk at deploy time ' +
      'rather than by this script. Name each file.'
  );
});

test('Homepage release surface - every published source exists in the repository', () => {
  const missing = [];
  for (const { key, source } of publishedEntries()) {
    if (key === null) continue;
    // The script resolves sources against $source_dir, defaulting to the site.
    const resolved = source.replace('$source_dir', 'portfolio/marisstella-homepage');
    if (resolved.includes('$')) continue; // some other variable; not resolvable here
    if (!fs.existsSync(path.join(REPO_ROOT, resolved))) {
      missing.push(resolved);
    }
  }
  assert.deepEqual(
    missing,
    [],
    'deploy-homepage.sh publishes a file that does not exist; the deploy would fail at rollout'
  );
});

test('Homepage release surface - the site still ships the files it needs', () => {
  const keys = publishedEntries()
    .map((entry) => entry.key)
    .filter((key) => key !== null);

  for (const required of REQUIRED_KEYS) {
    assert.ok(
      keys.includes(required),
      `deploy-homepage.sh no longer publishes ${required}; the site cannot render without it`
    );
    assert.ok(
      fs.existsSync(path.join(SITE_ROOT, required)),
      `${required} is published but absent from ${path.relative(REPO_ROOT, SITE_ROOT)}`
    );
  }
});

test('Homepage release surface - the preflight check matches what is published', () => {
  // The script refuses to deploy unless each release file is present. If that
  // list and the publish list drift, it either guards a file it never ships or
  // ships one it never checked — the second is how Dockerfile stayed in the
  // release set without anyone choosing it.
  const loop = script().match(/for file in ([^;]+); do/);
  assert.ok(loop, 'deploy-homepage.sh no longer preflights its release files by name');

  const checked = loop[1].trim().split(/\s+/).sort();
  const published = publishedEntries()
    .map((entry) => entry.key)
    .filter((key) => key !== null)
    .sort();

  assert.deepEqual(
    checked,
    published,
    'the preflight file list and the published ConfigMap keys have drifted apart'
  );
});
