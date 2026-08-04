import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.gitea/workflows');

/**
 * A venture that can charge a card, and a venture that can be published, must
 * be the same venture before any of this earns money.
 *
 * On 2026-08-03 they were disjoint sets, and nothing in the repository could
 * say so. `local-site-studio` and `print-atelier` both call
 * `stripe.checkout.sessions.create` against the real SDK — rate limited,
 * signature-verifying, 501 when unconfigured, not stubs. Neither appears in any
 * workflow that publishes anything. The three components that *do* have a
 * release path — `quick-pick-survey`, `ai-first-markets` and the homepage —
 * have no payment code at all. Eleven ventures, two able to take money, three
 * able to reach a customer, zero in both sets.
 *
 * Every existing portfolio control measured this and missed it, because each
 * one asked a question the answer to which was locally fine.
 * `validate_ventures.py:195` requires `links.production` only at stage
 * `launched`/`revenue`/`scaling`; all eleven are `prototype`, so it never
 * fires. `VENTURE_CATALOG` runs local-site-studio's gates, so its verification
 * is green — verification is not release. `ALLOCATION_REPORT.md` ranks by
 * `monthly_cap` and decayed explore credit and is silent on whether a dollar
 * could arrive. The one venture with a complete Stripe integration declares
 * `links.production: null` and nothing objects.
 *
 * So this control does not check code quality, and it does not check that the
 * payment path works. It checks the single join no other control makes: for
 * every venture that can take money, whether anything can put it in front of a
 * customer — and when the answer is no, that the reason is written down as a
 * named next action rather than rediscovered by the next audit.
 *
 * It is deliberately two-directional, like `count` in
 * `platform/exception-register.yaml`. A venture growing its first payment path
 * fails here until someone registers it. A blocked venture *gaining* a release
 * path also fails here — that is the good failure, and the one this whole file
 * exists to catch, because it is the moment the portfolio can first be paid and
 * the moment everyone is least likely to notice.
 */

/** Build output and dependencies, never venture source. */
const NOT_SOURCE = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.vercel',
  '.open-next',
  'dist',
  'out',
  'build',
  'coverage',
  '.git',
  'generated',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * A call that creates a charge, a subscription, or a billing session against a
 * real payment processor.
 *
 * Deliberately narrower than "mentions Stripe". Pricing copy, a `payment_class`
 * field in a point-of-sale schema, and a doc page that names a price are not
 * the ability to be paid — five ventures match the word `stripe` or `checkout`
 * somewhere and can take exactly nothing. What distinguishes the two that can
 * is an SDK call that moves money.
 */
const CHARGE_CALL_PATTERN =
  /\b(?:stripe|Stripe)\s*\.\s*(?:checkout\s*\.\s*sessions|paymentIntents|subscriptions|billingPortal\s*\.\s*sessions)\s*\.\s*create\b|\blemonSqueezySetup\b|\bpaddle\s*\.\s*(?:Checkout|Transactions)\s*\./;

/**
 * A workflow step that publishes something a customer can reach.
 *
 * Covers both release shapes in this repository: the npm/Wrangler publishes
 * that `deploy-gate-contract.test.mjs` polices, and the container/GitOps chain
 * that pairwise and the homepage use through `platform/ci/deploy-*.sh` and
 * `promote-*.sh`. A detector that knew only the first would call pairwise
 * unreleasable and quietly make every `blocked` claim below trivially true.
 */
const PUBLISH_STEP_PATTERN =
  /npm\s+run\s+(?:deploy|upload|cf:deploy)\b|(?:wrangler|opennextjs-cloudflare)\s+(?:deploy|upload)\b|platform\/ci\/(?:deploy|promote)-[a-z0-9-]+\.sh/;

/**
 * Every venture that can charge a customer, and what stands between it and a
 * customer.
 *
 * `release.workflow` names the workflow that publishes it, and is checked
 * against disk. `release.blocked` records that nothing publishes it, and names
 * the action that would change that — an action a person takes, since neither
 * of these is waiting on code.
 */
const REVENUE_PATHS = {
  'local-site-studio': {
    processor: 'stripe',
    release: {
      blocked:
        'No workflow builds, publishes or hosts this venture. It is in VENTURE_CATALOG, so CI verifies it and nothing releases it. Needs a hosting target chosen and a deploy workflow written, then STRIPE_SECRET_KEY and the seven STRIPE_PRICE_ID_* values in .env.example set as protected secrets.',
    },
  },
  'print-atelier': {
    processor: 'stripe',
    release: {
      blocked:
        'Referenced by ci-cd.yml for verification only; no workflow publishes it. Needs a hosting target and a deploy workflow, then Stripe and Printful credentials as protected secrets.',
    },
  },
};

function listVentures() {
  return fs
    .readdirSync(VENTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NOT_SOURCE.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function* sourceFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (NOT_SOURCE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      // A test may name a charge call while asserting it is never made.
      if (/\.(?:test|spec)\.[a-z]+$/.test(entry.name)) continue;
      yield full;
    }
  }
}

/** Venture name -> repo-relative files that create a charge. */
function venturesThatCanCharge() {
  const found = new Map();
  for (const venture of listVentures()) {
    const hits = [];
    for (const file of sourceFiles(path.join(VENTURES_DIR, venture))) {
      if (CHARGE_CALL_PATTERN.test(fs.readFileSync(file, 'utf8'))) {
        hits.push(path.relative(REPO_ROOT, file));
      }
    }
    if (hits.length > 0) found.set(venture, hits.sort());
  }
  return found;
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

/** Component path -> workflows that publish it. */
function publishedComponents() {
  const byComponent = new Map();
  for (const name of workflowFiles()) {
    const source = fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8');
    if (!PUBLISH_STEP_PATTERN.test(source)) continue;
    for (const match of source.matchAll(/(?:ventures|portfolio)\/([a-z0-9-]+)/g)) {
      const component = match[1];
      if (!byComponent.has(component)) byComponent.set(component, new Set());
      byComponent.get(component).add(name);
    }
  }
  return byComponent;
}

test('Revenue path - the charge-call detector still detects charge calls', () => {
  // Without this, a regex that stopped matching would empty every set below and
  // report the whole file as passing. `gate-substance.test.mjs` exists because
  // that failure mode had already happened once elsewhere in this repository.
  const chargeable = venturesThatCanCharge();
  assert.ok(
    chargeable.size > 0,
    'no venture matched CHARGE_CALL_PATTERN; the detector is broken, not the portfolio',
  );

  const publishers = publishedComponents();
  assert.ok(
    publishers.size > 0,
    'no workflow matched PUBLISH_STEP_PATTERN; the detector is broken, and every `blocked` claim below would pass for free',
  );
});

test('Revenue path - every venture that can charge a customer is registered', () => {
  const chargeable = venturesThatCanCharge();
  const unregistered = [...chargeable.entries()]
    .filter(([venture]) => !(venture in REVENUE_PATHS))
    .map(([venture, files]) => `${venture}: charges at ${files[0]} and is not in REVENUE_PATHS`);

  assert.deepEqual(
    unregistered,
    [],
    'a venture grew a payment path; register it and record what stands between it and a customer',
  );
});

test('Revenue path - no registered venture has lost its payment path', () => {
  const chargeable = venturesThatCanCharge();
  const stale = Object.keys(REVENUE_PATHS)
    .filter((venture) => !chargeable.has(venture))
    .map((venture) => `${venture}: registered as charging via ${REVENUE_PATHS[venture].processor}, but no source file creates a charge`);

  assert.deepEqual(stale, [], 'REVENUE_PATHS is stale; remove the entry or restore the path');
});

test('Revenue path - every registered venture exists', () => {
  const ventures = new Set(listVentures());
  const missing = Object.keys(REVENUE_PATHS).filter((venture) => !ventures.has(venture));
  assert.deepEqual(missing, [], 'REVENUE_PATHS names a venture directory that does not exist');
});

test('Revenue path - a claimed release workflow exists and publishes the venture', () => {
  const publishers = publishedComponents();
  const wrong = [];

  for (const [venture, entry] of Object.entries(REVENUE_PATHS)) {
    const declared = entry.release.workflow;
    if (!declared) continue;

    if (!fs.existsSync(path.join(WORKFLOWS_DIR, declared))) {
      wrong.push(`${venture}: declares release workflow ${declared}, which does not exist`);
      continue;
    }
    if (!publishers.get(venture)?.has(declared)) {
      wrong.push(`${venture}: ${declared} exists but does not publish ventures/${venture}`);
    }
  }

  assert.deepEqual(wrong, [], 'a declared release path does not release');
});

test('Revenue path - a venture recorded as blocked is still blocked, and says by what', () => {
  const publishers = publishedComponents();
  const problems = [];

  for (const [venture, entry] of Object.entries(REVENUE_PATHS)) {
    const { blocked, workflow } = entry.release;
    if (workflow) continue;

    if (typeof blocked !== 'string' || blocked.trim().length < 40) {
      problems.push(`${venture}: release.blocked must name the action that would unblock it`);
      continue;
    }

    const releasing = publishers.get(venture);
    if (releasing) {
      // The good failure. Something now publishes a venture that can charge a
      // card, which is the first moment in this portfolio's history that a
      // customer could pay it. Move the entry to `workflow` deliberately.
      problems.push(
        `${venture}: recorded as blocked, but ${[...releasing].sort().join(', ')} now publishes it — this venture can now be paid; replace release.blocked with release.workflow and say so in docs/ENGINEERING-ROADMAP.md`,
      );
    }
  }

  assert.deepEqual(problems, [], 'a blocked revenue path claim no longer matches the workflows');
});

test('Revenue path - the portfolio records how many ventures can actually be paid', () => {
  const publishers = publishedComponents();
  const payable = Object.keys(REVENUE_PATHS)
    .filter((venture) => publishers.has(venture))
    .sort();

  // Two-directional on purpose. It fails when the number rises, so the first
  // payable venture is a decision someone makes rather than a fact discovered
  // later; and it would fail if it fell, so a deleted deploy workflow cannot
  // silently take the portfolio back to zero.
  assert.deepEqual(
    payable,
    [],
    'the set of ventures that can both charge a customer and be published has changed; update this expectation and the roadmap',
  );
});
