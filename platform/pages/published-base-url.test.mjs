import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_BASE_URL } from './build.mjs';
import { publishedBaseUrl, readServingCname, SERVING_BRANCH, REPO_ROOT } from './published-base-url.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'browser-checks-ci.yml');
const PUBLISH_SH = readFileSync(join(HERE, 'publish-branch.sh'), 'utf8');

/**
 * A fake `git` over a tiny description of a clone, so the ref-preference and
 * missing-branch paths can be exercised without writing real branches. The
 * shape mirrors what the real callback returns: stdout on success, throw on a
 * non-zero exit.
 */
function fakeGit({ refs = {}, cnames = {} } = {}) {
  return (args) => {
    if (args[0] === 'rev-parse') {
      const ref = args[args.length - 1];
      if (!refs[ref]) throw new Error(`no such ref ${ref}`);
      return `${refs[ref]}\n`;
    }
    if (args[0] === 'show') {
      const spec = args[1];
      if (!(spec in cnames)) throw new Error(`no such path ${spec}`);
      return cnames[spec];
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

test('a CNAME on the serving branch is the published origin', () => {
  const result = publishedBaseUrl({
    git: fakeGit({
      refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc123' },
      cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: 'tools.example.com\n' },
    }),
  });
  assert.equal(result.baseUrl, 'https://tools.example.com/');
  assert.equal(result.source, 'cname');
});

test('a local serving branch is preferred over the tracking ref', () => {
  // Same order `publish-branch.sh:131` uses. If these ever disagree, the
  // nightly would stamp a different origin than the publisher writes.
  const result = publishedBaseUrl({
    git: fakeGit({
      refs: {
        [`refs/heads/${SERVING_BRANCH}`]: 'aaa',
        [`refs/remotes/origin/${SERVING_BRANCH}`]: 'bbb',
      },
      cnames: {
        [`refs/heads/${SERVING_BRANCH}:CNAME`]: 'local.example.com\n',
        [`refs/remotes/origin/${SERVING_BRANCH}:CNAME`]: 'remote.example.com\n',
      },
    }),
  });
  assert.equal(result.baseUrl, 'https://local.example.com/');
});

test('the tracking ref answers when no local branch exists', () => {
  const result = publishedBaseUrl({
    git: fakeGit({
      refs: { [`refs/remotes/origin/${SERVING_BRANCH}`]: 'bbb' },
      cnames: { [`refs/remotes/origin/${SERVING_BRANCH}:CNAME`]: 'remote.example.com\n' },
    }),
  });
  assert.equal(result.baseUrl, 'https://remote.example.com/');
});

// The distinction this module exists to keep: "read the branch, there is no
// custom domain" is an answer; "the branch is not here" is not. Collapsing
// them is the only way this can hand back a confident wrong origin.
test('a serving branch with no CNAME reports a reading, not an assumption', () => {
  const result = publishedBaseUrl({
    git: fakeGit({ refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc' } }),
  });
  assert.equal(result.baseUrl, DEFAULT_BASE_URL);
  assert.equal(result.source, 'project-pages');
});

test('a missing serving branch reports the default as an assumption', () => {
  const result = publishedBaseUrl({ git: fakeGit({}) });
  assert.equal(result.baseUrl, DEFAULT_BASE_URL);
  assert.equal(result.source, 'assumed-default');
});

test('an empty or whitespace-only CNAME is no custom domain, not an empty host', () => {
  for (const contents of ['', '\n', '   \n']) {
    const result = publishedBaseUrl({
      git: fakeGit({
        refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc' },
        cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: contents },
      }),
    });
    assert.equal(result.baseUrl, DEFAULT_BASE_URL, `for ${JSON.stringify(contents)}`);
  }
});

test('a CNAME that is not a bare hostname refuses rather than stamping a guess', () => {
  for (const bad of ['https://tools.example.com/', 'not a host', 'localhost', '-lead.example.com', 'trail-.com']) {
    assert.throws(
      () =>
        publishedBaseUrl({
          git: fakeGit({
            refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc' },
            cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: `${bad}\n` },
          }),
        }),
      /bare, fully-qualified hostname/,
      `expected a refusal for ${JSON.stringify(bad)}`,
    );
  }
});

// The half that keeps this module honest: the fallback must be the value the
// builder uses, by import. CLAUDE.md records twice what a constant copied out
// of build.mjs costs -- most sharply "168 became 169", where seven finished
// pages were published nowhere because a copied list could not learn about
// ENTRY_OVERRIDES.
test('the fallback is build.mjs DEFAULT_BASE_URL, imported rather than restated', () => {
  const source = readFileSync(join(HERE, 'published-base-url.mjs'), 'utf8');
  assert.match(source, /import \{ DEFAULT_BASE_URL \} from '\.\/build\.mjs'/);
  const origins = source.match(/https:\/\/[a-z0-9.-]+\/[a-z0-9./-]*(?=['"`\s])/gi) ?? [];
  const inCode = origins.filter((u) => !/^https:\/\/(duncan-haywood\.github\.io|tools\.marisstella\.dev)/.test(u));
  assert.deepEqual(inCode, [], 'no origin literal belongs in this module; import the builder default');
});

// The regression this whole file exists for. The nightly stamped
// `https://tools.marisstella.dev/` -- an origin that has refused connections
// since 2026-09-04 and that no published artifact carries -- so journey.mjs's
// canonical, sitemap and share-link assertions were checked against a build
// nobody serves. A literal here cannot be kept current by anything, so the
// guard is that there must not be one.
test('the nightly browser sweep does not hard-code an origin to stamp', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  assert.match(workflow, /--stamp-base-url/, 'the sweep must still stamp an origin at all');
  assert.doesNotMatch(
    workflow,
    /--stamp-base-url\s+["']?https?:\/\//,
    'the origin must be derived from the published branch (published-base-url.mjs), never written in the workflow',
  );
  assert.match(
    workflow,
    /published-base-url\.mjs/,
    'the sweep must ask published-base-url.mjs which origin the site is served under',
  );
});

// Same rule, one implementation each side of a language boundary, so this
// pins the agreement rather than the wording: the publisher's own line is
// `PAGES_BASE_URL="${PAGES_BASE_URL:-https://$cname/}"`, and if that shape
// ever changes, the note above about whose rule this is has gone stale.
test('the publisher still derives its base URL from the serving branch CNAME', () => {
  assert.match(PUBLISH_SH, /PAGES_BASE_URL="\$\{PAGES_BASE_URL:-https:\/\/\$cname\/\}"/);
  // And that the branch this module reads is the branch that one publishes.
  assert.match(PUBLISH_SH, /BRANCH="\$\{BRANCH:-gh-pages\}"/);
  assert.equal(SERVING_BRANCH, 'gh-pages');
});

test('readServingCname reports branchSeen separately from the CNAME', () => {
  assert.deepEqual(readServingCname({ git: fakeGit({}) }), { cname: null, branchSeen: false });
  assert.deepEqual(readServingCname({ git: fakeGit({ refs: { [`refs/heads/${SERVING_BRANCH}`]: 'a' } }) }), {
    cname: null,
    branchSeen: true,
  });
});

test('a hostname whose later labels start with any digit is a valid CNAME', () => {
  for (const host of ['tools.9lives.example', 'a.5.example.com', 'x.2go.dev']) {
    const result = publishedBaseUrl({
      git: fakeGit({
        refs: { [`refs/heads/${SERVING_BRANCH}`]: 'a' },
        cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: `${host}\n` },
      }),
    });
    assert.equal(result.baseUrl, `https://${host}/`);
  }
});

test('the CLI prints the URL when run directly and nothing when imported', () => {
  const script = join(HERE, 'published-base-url.mjs');
  const direct = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(direct.status, 0);
  assert.match(direct.stdout, /^https:\/\/\S+\/\n$/);
  assert.match(direct.stderr, /^published base URL: /);

  const imported = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(script)})`],
    { encoding: 'utf8' },
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});

test('hostnames with any digit, at the start or inside a label, are accepted', () => {
  for (const host of ['9lives.example.com', 'a2b.example.com', 'tools9.example.com', 'x.example8.com']) {
    const result = publishedBaseUrl({
      git: fakeGit({
        refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc123' },
        cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: `${host}\n` },
      }),
    });
    assert.equal(result.baseUrl, `https://${host}/`);
  }
});

test('only the first line of the CNAME file is read', () => {
  const result = publishedBaseUrl({
    git: fakeGit({
      refs: { [`refs/heads/${SERVING_BRANCH}`]: 'abc123' },
      cnames: { [`refs/heads/${SERVING_BRANCH}:CNAME`]: 'a.example.com\nb.example.com\n' },
    }),
  });
  assert.equal(result.baseUrl, 'https://a.example.com/');
});
