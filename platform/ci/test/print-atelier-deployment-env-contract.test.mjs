// `platform/k8s/apps/print-atelier/deployment.yaml` declared zero env vars and
// referenced no Secret, while the venture reads twenty settable variables from
// the environment. ArgoCD syncs that directory with `automated: {prune, selfHeal}`,
// so the manifest set was complete, healthy, and produced a pod that could not
// take a payment or submit a print. A complete manifest set looks exactly like
// a working service.
//
// This control binds the Deployment's env list to the venture's actual reads,
// in both directions:
//
//   * a variable the source reads and the Deployment does not supply fails,
//     unless it is in EXCLUDED with a reason that this file re-checks;
//   * a variable the Deployment supplies and no source file reads fails, so
//     dead configuration cannot accumulate.
//
// Three further properties, each guarding a defect this repository has already
// shipped:
//
//   * No `value:` literal. `?? "123 Market St"` in
//     `ventures/print-atelier/src/lib/fulfillment-order-inputs.ts` was every
//     paid order's real delivery address. A plausible-looking credential
//     default in a manifest is the same defect with a larger blast radius, and
//     unlike the source version it would be applied to a live cluster.
//   * No committed Secret. Values are provisioned out of band, which is the
//     convention `quick-pick-survey` already follows.
//   * The money path is not `optional:`. `optional: true` on a secretKeyRef
//     means a missing key silently leaves the variable unset. For Stripe and
//     the two fulfillment vendors that produces the worst reachable state —
//     see MONEY_PATH below — so those must fail the pod, not degrade it.
//
// Every parser below is asserted non-vacuous before anything is asserted with
// it. A regex that quietly matches nothing would leave this file green forever
// while enforcing nothing, which is this repository's most common defect and
// the reason the file exists.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const APP_DIR = path.join(REPO_ROOT, 'platform/k8s/apps/print-atelier');
const DEPLOYMENT = path.join(APP_DIR, 'deployment.yaml');
const VENTURE_DIR = path.join(REPO_ROOT, 'ventures/print-atelier');
const SRC_DIR = path.join(VENTURE_DIR, 'src');
const ENV_EXAMPLE = path.join(VENTURE_DIR, '.env.example');

/** The one Secret every credential must come from. */
const SECRET_NAME = 'print-atelier-secrets';

/**
 * Variables whose absence must stop the pod rather than degrade a feature.
 *
 * `src/app/api/stripe/webhook/route.ts:111` and `:124` hand the vendor adapter
 * `fetch` only when that vendor's key pair is set, and `undefined` otherwise.
 * With Stripe configured and a vendor not, the charge succeeds, the order is
 * recorded, and the fulfillment submission goes to a process-local array that
 * nothing drains: money in, nothing printed, no error raised anywhere. Both
 * vendors are here because both branches are reachable — the handler routes on
 * `fulfillmentPartnerId === "gelato"` and falls through to Printful.
 *
 * The operator token is here for a different reason: `src/lib/api-auth.ts`
 * already fails closed without it, so absence is safe, but every operator route
 * answers 503 and the deployment is inert.
 */
const MONEY_PATH = new Set([
  'PRINT_ATELIER_OPS_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_CLIENT_ID',
  'PRINTFUL_API_KEY',
  'PRINTFUL_STORE_ID',
  'GELATO_API_KEY',
  'GELATO_STORE_ID',
]);

/**
 * Variables the source reads that must NOT appear as container env, each with
 * the reason it is exempt and — where the reason is checkable — a predicate
 * that re-reads the source to confirm the reason still holds.
 *
 * A blanket exemption is a region where the claim may quietly stop being true.
 * These are per-variable, and the two that can rot carry a check.
 */
const EXCLUDED = [
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    reason:
      'Next.js substitutes NEXT_PUBLIC_* at build time, so a runtime env entry would look like configuration and change nothing. It has to become a Docker build arg; ventures/print-atelier/Dockerfile passes none today.',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    reason: 'build-time substitution, as NEXT_PUBLIC_SITE_URL',
  },
  {
    name: 'NEXT_PUBLIC_CONVEX_URL',
    reason: 'build-time substitution, as NEXT_PUBLIC_SITE_URL',
  },
  {
    name: 'NODE_ENV',
    reason: 'set to production by the image (ventures/print-atelier/Dockerfile)',
    stillTrue: () => /^ENV NODE_ENV=production$/m.test(read(path.join(VENTURE_DIR, 'Dockerfile'))),
    stillTrueMessage:
      'ventures/print-atelier/Dockerfile no longer sets NODE_ENV=production, so the Deployment must set it',
  },
  {
    name: 'VERCEL',
    reason: 'Vercel platform variable; never set on this cluster and absence is how the code detects "not on Vercel"',
  },
  { name: 'VERCEL_ENV', reason: 'Vercel platform variable, as VERCEL' },
  { name: 'VERCEL_URL', reason: 'Vercel platform variable, as VERCEL' },
  { name: 'VERCEL_PROJECT_ID', reason: 'Vercel platform variable, as VERCEL' },
  {
    name: 'CONVEX_URL',
    reason:
      'its only consumer is convex-sync-status.ts, where the configured and unconfigured branches are the same literal, so setting it changes no behaviour',
    stillTrue: () =>
      /isConvexConfigured\s*\?\s*"synced"\s*:\s*"synced"/.test(
        read(path.join(SRC_DIR, 'lib/convex-sync-status.ts'))
      ),
    stillTrueMessage:
      'convex-sync-status.ts no longer collapses both branches to "synced", so CONVEX_URL now changes behaviour and must be supplied to the pod',
  },
];

const EXCLUDED_NAMES = new Set(EXCLUDED.map((entry) => entry.name));

/**
 * Variables the Deployment supplies that `ventures/print-atelier/.env.example`
 * does not declare. Named one at a time, never as a directory or prefix: an
 * exemption covering a region is a region where the claim may quietly stop
 * being true.
 *
 * Each entry is asserted to still be a genuine gap, so the exception clears
 * itself the moment someone adds the variable to `.env.example` — it cannot
 * outlive the thing it excuses.
 *
 * Empty, and it has already earned that. `STRIPE_AUTOMATIC_TAX` was listed here
 * for exactly as long as `.env.example` omitted it; the moment the declaration
 * landed the entry failed this suite and had to be removed. Add to this list
 * only when the variable is genuinely undeclared, and expect it to be temporary.
 */
const ENV_EXAMPLE_GAPS = [];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

/** Tracked source files, so build output and node_modules cannot reach the scan. */
function trackedSourceFiles() {
  const out = execFileSync('git', ['ls-files', '--', 'ventures/print-atelier/src'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: GIT_ENV,
  });
  return out
    .split('\n')
    .filter((line) => /\.(ts|tsx|mjs|js|jsx)$/.test(line))
    .map((line) => path.join(REPO_ROOT, line));
}

/**
 * Every environment variable the venture reads.
 *
 * Four shapes, because the venture uses all four. Only the first is a literal
 * `process.env.X`; `PRINT_ATELIER_OPS_TOKEN`, `META_CATALOG_ID` and
 * `GOOGLE_MERCHANT_CENTER_ID` are reachable through none of it — they are read
 * as `env[key]` against a registry of key names, with the whole of
 * `process.env` passed in by `getPartnerCredentialEnvFromProcess()`. A control
 * that scanned only for `process.env.X` would have declared the contract
 * complete while missing the operator token that guards every internal route.
 */
function sourceEnvReads() {
  const found = new Map(); // name -> Set of shapes that found it
  const record = (name, shape) => {
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(shape);
  };

  const shapes = [
    // process.env.STRIPE_SECRET_KEY
    { id: 'process.env.X', pattern: /process\.env\.([A-Z][A-Z0-9_]*)/g, group: 1 },
    // env.VERCEL_ENV — an EnvSource threaded through a helper
    { id: 'env.X', pattern: /\benv\.([A-Z][A-Z0-9_]{2,})\b/g, group: 1 },
    // export const OPS_TOKEN_ENV = "PRINT_ATELIER_OPS_TOKEN";
    { id: 'NAME_ENV constant', pattern: /_ENV\s*=\s*"([A-Z][A-Z0-9_]*)"/g, group: 1 },
    // { key: "PRINTFUL_API_KEY", label: "API key" }
    { id: 'credential registry', pattern: /\bkey:\s*"([A-Z][A-Z0-9_]*)"/g, group: 1 },
    // credentialKeys: ["META_CATALOG_ID", "META_ACCESS_TOKEN"]
    { id: 'credentialKeys list', pattern: /credentialKeys:\s*\[([^\]]*)\]/g, group: null },
  ];

  const perShape = new Map(shapes.map((shape) => [shape.id, 0]));

  for (const file of trackedSourceFiles()) {
    const text = read(file);
    for (const shape of shapes) {
      for (const match of text.matchAll(shape.pattern)) {
        if (shape.group === null) {
          for (const literal of match[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)) {
            record(literal[1], shape.id);
            perShape.set(shape.id, perShape.get(shape.id) + 1);
          }
          continue;
        }
        record(match[shape.group], shape.id);
        perShape.set(shape.id, perShape.get(shape.id) + 1);
      }
    }
  }

  return { names: found, perShape };
}

/**
 * The container's env entries, as
 * `{ name, hasLiteralValue, secretName, secretKey, optional }`.
 *
 * Hand-rolled because `platform/ci` has no dependencies and Node ships no YAML
 * parser. It is indentation-aware and refuses anything it does not understand
 * rather than skipping it, so an entry written in a shape this parser cannot
 * read fails the suite instead of vanishing from the contract.
 */
function deploymentEnvEntries() {
  const lines = read(DEPLOYMENT).split('\n');
  const isSkippable = (line) => line.trim() === '' || line.trimStart().startsWith('#');
  const indentOf = (line) => line.length - line.trimStart().length;

  const envLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*env:\s*$/.test(line));
  assert.equal(
    envLines.length,
    1,
    `expected exactly one env: block in ${path.relative(REPO_ROOT, DEPLOYMENT)}, found ${envLines.length}; ` +
      'this parser reads the first one and would police the wrong container'
  );

  const start = envLines[0].index;
  const entries = [];
  let current = null;

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSkippable(line)) continue;
    const indent = indentOf(line);

    if (current === null) {
      if (!line.trimStart().startsWith('- ')) break; // env: block was empty
    } else if (indent <= current.indent && !line.trimStart().startsWith('- ')) {
      break; // dedented out of the list
    }

    if (line.trimStart().startsWith('- ')) {
      if (current !== null && indent < current.indent) break;
      const name = line.match(/^\s*-\s+name:\s*(\S+)\s*$/);
      assert.ok(
        name,
        `env list item at ${path.relative(REPO_ROOT, DEPLOYMENT)}:${i + 1} does not start with "- name: X"; ` +
          'this parser cannot read it, so the contract below would silently skip it'
      );
      current = {
        indent,
        name: name[1],
        hasLiteralValue: false,
        secretName: null,
        secretKey: null,
        optional: false,
        line: i + 1,
      };
      entries.push(current);
      continue;
    }

    if (/^\s*value:\s*\S/.test(line)) current.hasLiteralValue = true;
    if (/^\s*optional:\s*true\s*$/.test(line)) current.optional = true;
    const secret = line.match(/^\s*name:\s*(\S+)\s*$/);
    if (secret) current.secretName = secret[1];
    const key = line.match(/^\s*key:\s*(\S+)\s*$/);
    if (key) current.secretKey = key[1];
  }

  return entries;
}

// ---------------------------------------------------------------------------
// The parsers see something. Everything below is worthless if these fail.
// ---------------------------------------------------------------------------

test('print-atelier deployment env - the source scanner sees every read shape', () => {
  const { names, perShape } = sourceEnvReads();

  assert.ok(
    names.size >= 20,
    `only ${names.size} environment variables found in ventures/print-atelier/src; ` +
      'the scanner has stopped seeing the source and every assertion below is vacuous'
  );

  for (const [shape, count] of perShape) {
    assert.ok(
      count > 0,
      `the "${shape}" read shape matched nothing. Either the venture stopped using it — in which case ` +
        'delete the pattern deliberately — or the pattern has rotted and is silently enforcing nothing.'
    );
  }

  // Named anchors for the two shapes a naive scanner misses. If these ever stop
  // being found the contract has a hole exactly where the audit found one.
  assert.ok(
    names.get('PRINT_ATELIER_OPS_TOKEN')?.has('NAME_ENV constant'),
    'PRINT_ATELIER_OPS_TOKEN is no longer reachable through the OPS_TOKEN_ENV constant; it is read nowhere as process.env.X, so the scanner would lose it'
  );
  assert.ok(
    names.get('META_CATALOG_ID')?.size,
    'META_CATALOG_ID is no longer found; it is read only through a credential registry, never as process.env.X'
  );
});

test('print-atelier deployment env - the manifest parser sees the env list', () => {
  const entries = deploymentEnvEntries();
  assert.ok(
    entries.length > 0,
    `no env entries parsed from ${path.relative(REPO_ROOT, DEPLOYMENT)}. The Deployment declaring zero env ` +
      'vars is the original finding; if that is the state again, this is the failure that says so.'
  );
  const names = entries.map((entry) => entry.name);
  assert.equal(
    new Set(names).size,
    names.length,
    `duplicate env names in ${path.relative(REPO_ROOT, DEPLOYMENT)}: the later entry wins silently in Kubernetes`
  );
});

// ---------------------------------------------------------------------------
// The contract itself.
// ---------------------------------------------------------------------------

test('print-atelier deployment env - every variable the venture reads is supplied or exempt', () => {
  const { names } = sourceEnvReads();
  const supplied = new Set(deploymentEnvEntries().map((entry) => entry.name));

  const missing = [];
  for (const [name, shapes] of names) {
    if (supplied.has(name) || EXCLUDED_NAMES.has(name)) continue;
    missing.push(`${name} (read as ${[...shapes].join(', ')})`);
  }

  assert.deepEqual(
    missing.sort(),
    [],
    `ventures/print-atelier reads ${missing.length} environment variable(s) that the Deployment does not supply. ` +
      'The pod starts, the manifest set looks complete, and the feature behind each one is dead or refusing. ' +
      `Add a secretKeyRef to ${path.relative(REPO_ROOT, DEPLOYMENT)}, or add the variable to EXCLUDED in this ` +
      'file with the reason it does not belong in container env: ' +
      missing.join(', ')
  );
});

test('print-atelier deployment env - nothing is supplied that nothing reads', () => {
  const { names } = sourceEnvReads();
  const dead = deploymentEnvEntries()
    .map((entry) => entry.name)
    .filter((name) => !names.has(name));

  assert.deepEqual(
    dead,
    [],
    'the Deployment supplies environment variables that no source file in ventures/print-atelier/src reads. ' +
      'Each one is a key an operator is asked to populate for nothing, and — because they are required by ' +
      'default — a key whose absence blocks a rollout for nothing: ' +
      dead.join(', ')
  );
});

test('print-atelier deployment env - every exemption still names a variable, and its reason still holds', () => {
  const { names } = sourceEnvReads();

  const stale = EXCLUDED.filter((entry) => !names.has(entry.name)).map((entry) => entry.name);
  assert.deepEqual(
    stale,
    [],
    'EXCLUDED names variables that ventures/print-atelier no longer reads. An exemption for a variable that ' +
      'does not exist is a place a future variable can hide: ' +
      stale.join(', ')
  );

  for (const entry of EXCLUDED) {
    if (!entry.stillTrue) continue;
    assert.ok(entry.stillTrue(), entry.stillTrueMessage);
  }
});

// ---------------------------------------------------------------------------
// How the values arrive, which is where the placeholder defect would land.
// ---------------------------------------------------------------------------

test('print-atelier deployment env - no credential carries a literal value', () => {
  const literals = deploymentEnvEntries()
    .filter((entry) => entry.hasLiteralValue)
    .map((entry) => `${entry.name} (line ${entry.line})`);

  assert.deepEqual(
    literals,
    [],
    'an env entry in the Deployment carries a literal value:. Whatever is written there is applied to the ' +
      'cluster and becomes the running configuration — a placeholder Stripe key means charges do not settle, ' +
      'a placeholder Printful key means prints are never made, and neither raises an error. This venture has ' +
      'already shipped the source-level version of this defect (`?? "123 Market St"` as every order\'s ' +
      'delivery address). Use a secretKeyRef: ' +
      literals.join(', ')
  );
});

test('print-atelier deployment env - every value comes from the one out-of-band Secret', () => {
  const problems = [];
  for (const entry of deploymentEnvEntries()) {
    if (entry.secretName === null || entry.secretKey === null) {
      problems.push(`${entry.name}: no secretKeyRef (line ${entry.line})`);
      continue;
    }
    if (entry.secretName !== SECRET_NAME) {
      problems.push(`${entry.name}: reads Secret "${entry.secretName}", expected "${SECRET_NAME}"`);
    }
    if (entry.secretKey !== entry.name) {
      problems.push(
        `${entry.name}: reads key "${entry.secretKey}"; key and variable name must match so the Secret can be ` +
          'read against SECRETS.md without a translation table'
      );
    }
  }

  assert.deepEqual(problems, [], problems.join('; '));
});

test('print-atelier deployment env - the money path cannot be silently unset', () => {
  const entries = new Map(deploymentEnvEntries().map((entry) => [entry.name, entry]));

  const problems = [];
  for (const name of MONEY_PATH) {
    const entry = entries.get(name);
    if (!entry) {
      problems.push(`${name} is not supplied at all`);
      continue;
    }
    if (entry.optional) {
      problems.push(
        `${name} is marked optional: true, so a Secret missing that key starts the pod with the variable unset`
      );
    }
  }

  assert.deepEqual(
    problems,
    [],
    'the money path must fail the pod, not degrade. With Stripe configured and a fulfillment vendor not, ' +
      'the charge succeeds and the print is queued to a process-local array that never reaches the vendor: ' +
      problems.join('; ')
  );
});

test('print-atelier deployment env - no Secret values are committed', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'platform/k8s/apps/print-atelier'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: GIT_ENV,
  })
    .split('\n')
    .filter(Boolean);

  const offenders = tracked.filter((file) => {
    if (!/\.(yaml|yml)$/.test(file)) return false;
    return /^kind:\s*Secret\s*$/m.test(read(path.join(REPO_ROOT, file)));
  });

  assert.deepEqual(
    offenders,
    [],
    'a Secret manifest is committed under platform/k8s/apps/print-atelier. ArgoCD syncs this directory, so ' +
      'whatever is in it becomes the live credential set, and the values sit in git history. The repository ' +
      'convention is out-of-band provisioning (quick-pick-secrets, ventures/quick-pick-survey/docs/DEPLOYMENT.md:48): ' +
      offenders.join(', ')
  );

  const kustomization = read(path.join(APP_DIR, 'kustomization.yaml'));
  assert.ok(
    !/secretGenerator:/.test(kustomization),
    'kustomization.yaml uses secretGenerator, which materializes credential values from files in the repository'
  );
});

test('print-atelier deployment env - the operator has a written source for every required key', () => {
  const secretsDoc = path.join(APP_DIR, 'SECRETS.md');
  assert.ok(
    fs.existsSync(secretsDoc),
    'platform/k8s/apps/print-atelier/SECRETS.md is gone. The Secret is provisioned out of band, so this file ' +
      'is the only thing that tells a human which keys to put in it; without it the Deployment references a ' +
      'Secret nobody knows how to build.'
  );
  const doc = read(secretsDoc);
  const example = read(ENV_EXAMPLE);

  const declaredInExample = (name) => new RegExp(`^${name}=`, 'm').test(example);
  const excused = new Set(ENV_EXAMPLE_GAPS.map((gap) => gap.name));

  const undocumented = [];
  const unexampled = [];
  for (const entry of deploymentEnvEntries()) {
    if (!doc.includes(entry.name)) undocumented.push(entry.name);
    if (!declaredInExample(entry.name) && !excused.has(entry.name)) unexampled.push(entry.name);
  }

  assert.deepEqual(
    undocumented,
    [],
    `SECRETS.md does not say where to get: ${undocumented.join(', ')}`
  );
  assert.deepEqual(
    unexampled,
    [],
    'the Deployment supplies keys that ventures/print-atelier/.env.example does not declare, so a developer ' +
      'running locally and the deployed pod disagree about the contract: ' +
      unexampled.join(', ')
  );

  // The excuse expires on its own. If .env.example now declares the variable,
  // this fails until the entry is deleted, so the list cannot silently become
  // a permanent hole.
  const settled = ENV_EXAMPLE_GAPS.filter((gap) => declaredInExample(gap.name)).map(
    (gap) => gap.name
  );
  assert.deepEqual(
    settled,
    [],
    'ventures/print-atelier/.env.example now declares these, so their entries in ENV_EXAMPLE_GAPS are ' +
      'obsolete and must be deleted rather than left standing as an unearned exemption: ' +
      settled.join(', ')
  );
});
