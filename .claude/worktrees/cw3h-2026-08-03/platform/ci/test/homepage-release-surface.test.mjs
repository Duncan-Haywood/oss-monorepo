import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEPLOY_SCRIPT = 'platform/ci/deploy-homepage.sh';

// SEC-021 recorded that the homepage container published its own configuration
// and was fixed in `portfolio/marisstella-homepage/.dockerignore`, with a
// mutation-checked test asserting each excluded entry. Production does not
// serve that image. `deploy-homepage.sh` builds a ConfigMap from an explicit
// `--from-file` list and nginx mounts it as the web root, so **this list is the
// public surface of marisstella.dev** and the `.dockerignore` cannot narrow it.
//
// Probed 2026-08-02 with no credentials: `/nginx.conf` and `/package.json`,
// the two files SEC-021 named, both answered 404 — they were never live. But
// `/Dockerfile` answered 200 with the full build recipe, because the deploy
// list published it. The remediation was mutation-checked against the artifact
// production does not use, so the one file that was actually exposed is the one
// `.dockerignore` could not reach.
//
// This is the contract over the thing that actually leaves the product. Adding
// a file to the ConfigMap is adding it to the public web root, and that has to
// be a deliberate act rather than a side effect of listing it for some other
// reason.
const PUBLISHED_TO_THE_PUBLIC_WEB_ROOT = ['index.html', 'style.css', 'app.js'];

// Anything whose presence in a web root discloses how the service is built or
// run. Matched against the ConfigMap keys, not against the repository.
const NEVER_PUBLISHABLE = [
  /^Dockerfile/i,
  /^\.dockerignore$/i,
  /^nginx\.conf$/i,
  /^package(-lock)?\.json$/i,
  /^\.env/i,
  /^docker-compose/i,
  /^Makefile$/i,
  /\.(ya?ml|tf|sh|pem|key|crt)$/i,
];

function configMapKeys(source) {
  // `--from-file="<key>=<path>"`, the form the deploy script uses. A bare
  // `--from-file=<path>` would also be valid kubectl, so it is captured too and
  // reduced to its basename, which is the key kubectl would derive.
  return [...source.matchAll(/--from-file="?([^"=\s]+)(?:=([^"\s]+))?"?/g)].map((match) =>
    match[2] ? match[1] : path.basename(match[1]),
  );
}

test('Homepage release surface - the ConfigMap publishes exactly the served assets', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, DEPLOY_SCRIPT), 'utf8');
  const keys = configMapKeys(source);

  assert.ok(keys.length > 0, `${DEPLOY_SCRIPT} must build the release ConfigMap with --from-file`);
  assert.deepEqual(
    [...keys].sort(),
    [...PUBLISHED_TO_THE_PUBLIC_WEB_ROOT].sort(),
    `${DEPLOY_SCRIPT} decides what marisstella.dev serves. Every --from-file entry becomes a ` +
      'publicly fetchable path. Add one here only if the public should be able to GET it.',
  );
});

test('Homepage release surface - no build or configuration file is published', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, DEPLOY_SCRIPT), 'utf8');

  for (const key of configMapKeys(source)) {
    for (const forbidden of NEVER_PUBLISHABLE) {
      assert.ok(
        !forbidden.test(key),
        `${DEPLOY_SCRIPT} publishes ${key} to the public web root. This is how ` +
          'https://marisstella.dev/Dockerfile served the build recipe while SEC-021 was ' +
          'recorded as fixed: the fix narrowed the container image, which production does ' +
          'not serve.',
      );
    }
  }
});

test('Homepage release surface - the preflight check matches what is published', () => {
  // The script refuses to deploy when a release file is missing. If that list
  // and the --from-file list drift apart, one of them is wrong: a file checked
  // but not published is dead weight, and a file published but not checked can
  // reach production absent.
  const source = fs.readFileSync(path.join(REPO_ROOT, DEPLOY_SCRIPT), 'utf8');
  const preflight = source.match(/for file in ([^;]+); do/);

  assert.ok(preflight, `${DEPLOY_SCRIPT} must preflight the release files before deploying`);
  assert.deepEqual(
    preflight[1].trim().split(/\s+/).sort(),
    [...configMapKeys(source)].sort(),
    'the preflight list and the published list must name the same files',
  );
});

test('Homepage release surface - every published asset exists in the source directory', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, DEPLOY_SCRIPT), 'utf8');
  const sourceDir = source.match(/source_dir="\$\{HOMEPAGE_SOURCE_DIR:-([^}]+)\}"/);

  assert.ok(sourceDir, `${DEPLOY_SCRIPT} must define a default source directory`);
  for (const key of configMapKeys(source)) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, sourceDir[1], key)),
      `${sourceDir[1]}/${key} is published by the deploy script but does not exist`,
    );
  }
});
