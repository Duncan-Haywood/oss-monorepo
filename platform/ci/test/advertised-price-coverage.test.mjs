import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Where a package states a price *and* offers a way to pay, the amount it
 * advertises must be bound to the amount it charges.
 *
 * `local-site-studio` is the worked example. `src/lib/pricing/bundles.ts` is the
 * field the Stripe Checkout Session is built from and the field
 * `bootstrap-stripe-prices.ts` creates each Stripe Price at, so it decides what
 * a card is charged. Twenty-six places across that venture restated the sold
 * price as a typed string and only three read it — all three at or after the
 * checkout step. Everything a buyer reads *before* deciding to pay was
 * unbound: the pricing cards, the search-result meta description, the preview
 * CTA, six publicly reachable /docs pages, and the script the AI phone agent
 * reads to callers. Moving `monthlyPriceUsd` would have moved the charge while
 * every one of those went on advertising the old number, with nothing failing.
 *
 * That is one venture's fix, and a fix is not a control. Nothing held a second
 * venture to it, nothing noticed a package growing its first checkout route,
 * and nothing stopped the contract from being deleted or dropped from the run.
 * This is the control, in the shape of
 * platform/ci/test/route-auth-posture-coverage.test.mjs: scan for the
 * condition, require every package meeting it to hold a contract or a tracked,
 * expiring, counted gap.
 *
 * Two deliberate limits.
 *
 * It does not check what a contract *says*. Where the sold amount lives is a
 * venture-local judgement — a typed `BUNDLES` table here, a Stripe catalog
 * there — and a repository-wide test that modelled all of them would model none
 * correctly. It checks that a contract exists, reads its copy surface off disk
 * rather than asserting against a hard-coded list, and is actually collected by
 * the gate the venture runs.
 *
 * It scans for a price *plus* a payment path, so it does not fire on the
 * business-plan and market-research packages whose figures are projections
 * rather than offers. The separate defect of a price advertised with **no**
 * payment path — a plan nobody can buy — is real and is recorded against the
 * copy-versus-behaviour item in docs/ENGINEERING-ROADMAP.md; it is a product
 * decision per venture, not something this control can adjudicate.
 */

/** Directories that hold build output, dependencies, or generated artifacts. */
const NOT_SOURCE = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.vercel',
  'dist',
  'out',
  'build',
  'coverage',
  '.git',
  'output',
  'generated',
]);

/** Trees that can hold a venture package. */
const PACKAGE_TREES = ['ventures', 'portfolio'];

/**
 * A currency amount written as literal copy. A template hole — `${price}` — is
 * a `$` followed by `{`, and is deliberately not matched: that is the derived
 * form this control wants to see.
 */
const PRICE_LITERAL = /[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;

/** Path segments that name a step in taking money from a customer. */
const PURCHASE_PATH = /(^|\/)(checkout|pricing|subscribe|billing|buy|plans)(\/|\.)/i;

/** The longest number of days an unwritten contract may stay unwritten. */
const MAX_EXPIRY_DAYS = 180;

/**
 * Every package that states a price and offers a way to pay, and what covers it.
 *
 * `contract` is a path, relative to the package root, to the venture-local
 * claims contract. `gap` records a package that has none yet and follows the
 * exception register's shape for the same reason it does: an exception nobody
 * re-reads is a policy change made without review, and one whose size is not
 * recorded grows for free.
 *
 * `priceLiterals` on a gap is the exact number of typed currency amounts
 * accepted in that package. It fails high — the unbound surface grew and nobody
 * decided that — and low — the register is stale. Same contract as `count` in
 * platform/exception-register.yaml.
 */
const REGISTRY = {
  'ventures/local-site-studio': {
    contract: 'src/lib/pricing/advertised-price-claims.test.ts',
  },

  'ventures/print-atelier': {
    gap: {
      owner: 'duncan',
      issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
      expires: '2026-12-01',
      priceLiterals: 75,
      reason:
        'Has Stripe and a checkout route, so a stated price can become a charge. ' +
        'Most of the 75 literals are business-plan and investor-dashboard ' +
        'figures rather than offers, and the buyer-facing prices come from ' +
        '`retailPrice` in src/lib/marketplace.ts through ' +
        '`calculatePrintEconomics` — already derived, not typed, which is why ' +
        'this is sized rather than urgent. What is missing is the contract ' +
        'saying so, and separating the projection figures from the offer ' +
        'figures is the work.',
    },
  },

  'ventures/ai-first-markets': {
    gap: {
      owner: 'duncan',
      issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
      expires: '2026-12-01',
      priceLiterals: 96,
      reason:
        'Advertises a $29/month premium tier and ships a /subscribe route. Its ' +
        'own copy states the tier "has never been sold and there is no payment ' +
        'path", and src/lib/subscription.ts tells a subscriber they have not ' +
        'been charged — so the venture is currently honest about the gap and ' +
        'the risk is that it stops being so once a payment path lands. Most of ' +
        'the 96 literals are market-commentary figures in src/data/ideas.ts, ' +
        'not offers. The contract should be written with the payment path, not ' +
        'before it.',
    },
  },

  'ventures/real-estate-agent-photo-app/docs-site': {
    gap: {
      owner: 'duncan',
      issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
      expires: '2026-11-01',
      priceLiterals: 1,
      reason:
        'One literal — the $19 shoot price on /pricing, rendered from ' +
        'process/pricing-one-pager.tsx. Payment is Zelle or PayPal by hand, so ' +
        'there is no charged amount in code to bind it to and a claims contract ' +
        'would have nothing to compare against. The blocker is that this ' +
        "package declares no `test` script at all, so it has no gate to hold a " +
        'contract; that has to be fixed first. Smallest surface here and the ' +
        'earliest expiry for that reason.',
    },
  },
};

function walkSource(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (NOT_SOURCE.has(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(entryPath, acc);
    else if (/\.(tsx?|jsx?|mjs|html)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      acc.push(entryPath);
    }
  }
  return acc;
}

/** Comments are not copy — a file may explain a price without advertising one. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/** Every directory under the package trees holding a package.json. */
function packageRoots() {
  const roots = [];
  const scan = (dir, depth = 0) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) roots.push(dir);
    for (const entry of entries) {
      if (entry.isDirectory() && !NOT_SOURCE.has(entry.name)) {
        scan(path.join(dir, entry.name), depth + 1);
      }
    }
  };
  for (const tree of PACKAGE_TREES) scan(path.join(REPO_ROOT, tree));
  return roots;
}

/**
 * Packages that state a price and offer a way to pay, as key -> literal count.
 *
 * Files under a nested package belong to that package, not to its parent, so a
 * workspace root does not absorb its children's prices.
 */
function pricedPackagesWithPaymentPath() {
  const roots = packageRoots();
  const found = new Map();

  for (const root of roots) {
    const nested = roots.filter((other) => other !== root && other.startsWith(root + path.sep));
    const files = walkSource(root).filter(
      (file) => !nested.some((other) => file.startsWith(other + path.sep))
    );

    let literals = 0;
    for (const file of files) {
      literals += [...stripComments(fs.readFileSync(file, 'utf8')).matchAll(PRICE_LITERAL)].length;
    }
    if (literals === 0) continue;

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const takesPayment =
      Object.keys(dependencies).some((name) => /stripe/i.test(name)) ||
      files.some((file) => PURCHASE_PATH.test(path.relative(root, file)));
    if (!takesPayment) continue;

    found.set(path.relative(REPO_ROOT, root), literals);
  }
  return found;
}

/** Turns a shell path glob into an anchored regular expression. */
function globToRegExp(glob) {
  const pattern = glob
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      if (part === '?') return '[^/]';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${pattern}$`);
}

/** The `include` patterns a vitest config declares, if it declares any. */
function vitestIncludes(packageRoot) {
  for (const name of ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js']) {
    const configPath = path.join(packageRoot, name);
    if (!fs.existsSync(configPath)) continue;
    const match = fs.readFileSync(configPath, 'utf8').match(/\binclude:\s*\[([^\]]*)\]/);
    if (!match) return null;
    return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
  }
  return null;
}

/**
 * Whether the venture's `test` script collects `contract`.
 *
 * Both script shapes in this repository are modelled — an explicit list of
 * paths or globs, and a bare runner using its own include patterns. Anything
 * else fails as unrecognized rather than passing: a script this cannot read is
 * a script whose coverage it cannot vouch for, and guessing is how a gate stops
 * binding.
 */
function collects(packageRoot, contract, script) {
  if (!script) return { ok: false, why: 'the package.json declares no `test` script' };

  const tokens = script.split(/\s+/).filter(Boolean);
  const paths = tokens.filter((token) => !token.startsWith('-') && /[/*]/.test(token));

  if (paths.length > 0) {
    const matched = paths.some((glob) => globToRegExp(glob.replace(/^['"]|['"]$/g, '')).test(contract));
    return matched
      ? { ok: true }
      : { ok: false, why: `\`${script}\` names paths, and none of them match it` };
  }

  const runner = tokens.find((token) => /^(vitest|jest|mocha)$/.test(path.basename(token)));
  if (runner && path.basename(runner) === 'vitest') {
    const includes = vitestIncludes(path.join(REPO_ROOT, packageRoot)) ?? [
      '**/*.test.ts',
      '**/*.test.tsx',
    ];
    const matched = includes.some((glob) => globToRegExp(glob).test(contract));
    return matched
      ? { ok: true }
      : { ok: false, why: `vitest's include patterns (${includes.join(', ')}) do not match it` };
  }

  return {
    ok: false,
    why:
      `this check cannot read the test script \`${script}\`. Add its shape to ` +
      '`collects()` in platform/ci/test/advertised-price-coverage.test.mjs ' +
      'rather than assuming the contract runs',
  };
}

function testScriptFor(packageRoot) {
  const manifest = path.join(REPO_ROOT, packageRoot, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts?.test ?? null;
}

function catalogEntryFor(packageRoot) {
  return VENTURE_CATALOG.find(
    (component) => (component.packageDir || component.dir) === packageRoot
  );
}

test('Advertised Price Coverage - the scan finds priced packages at all', () => {
  // A scan that silently returns nothing makes every check below vacuous, which
  // is the exact failure this repository builds these controls to prevent.
  const packages = pricedPackagesWithPaymentPath();
  assert.ok(
    packages.size > 0,
    'No package under ' +
      PACKAGE_TREES.join('/ or ') +
      '/ states a price alongside a payment path. Either every venture moved or ' +
      'the scan broke; this control verifies nothing until that is fixed.'
  );
});

test('Advertised Price Coverage - every priced package with a payment path is registered', () => {
  const unregistered = [...pricedPackagesWithPaymentPath()]
    .filter(([packageRoot]) => !(packageRoot in REGISTRY))
    .map(([packageRoot, literals]) => `${packageRoot} (${literals} price literals)`);

  assert.deepEqual(
    unregistered,
    [],
    'These packages state a price and offer a way to pay, and nothing binds the ' +
      'advertised amount to the charged one. Advertising one price and charging ' +
      'another is not a cosmetic defect.\n' +
      'Write the contract and register its path, or register a gap with an ' +
      'owner, an issue, a reason, an expiry and an exact count, in ' +
      'platform/ci/test/advertised-price-coverage.test.mjs:\n  ' +
      unregistered.join('\n  ')
  );
});

test('Advertised Price Coverage - no registry entry outlives its package', () => {
  const live = pricedPackagesWithPaymentPath();
  const stale = Object.keys(REGISTRY).filter((packageRoot) => !live.has(packageRoot));

  assert.deepEqual(
    stale,
    [],
    'These registry entries name packages that no longer state a price beside a ' +
      'payment path. A stale entry reads as coverage and covers nothing:\n  ' +
      stale.join('\n  ')
  );
});

test('Advertised Price Coverage - every registered contract exists and runs', () => {
  const broken = [];

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.contract) continue;

    const contractPath = path.join(REPO_ROOT, packageRoot, entry.contract);
    if (!fs.existsSync(contractPath)) {
      broken.push(`${packageRoot}: ${entry.contract} does not exist`);
      continue;
    }

    // A contract that hard-codes its copy surface stops covering the venture the
    // moment a page is added, which is precisely when it is needed. This is a
    // source check, not a behavioural one: it cannot prove the scan is used,
    // only that the file does not simply assert against a literal list.
    const source = fs.readFileSync(contractPath, 'utf8');
    if (!/\breaddir(Sync)?\b/.test(source)) {
      broken.push(
        `${packageRoot}: ${entry.contract} never reads its copy surface off ` +
          'disk, so a new page carrying a new price would not be covered'
      );
    }

    if (!catalogEntryFor(packageRoot)) {
      broken.push(
        `${packageRoot}: no VENTURE_CATALOG entry runs this package, so the ` +
          'contract is never executed in CI'
      );
      continue;
    }

    const verdict = collects(packageRoot, entry.contract, testScriptFor(packageRoot));
    if (!verdict.ok) broken.push(`${packageRoot}: ${entry.contract} is not collected — ${verdict.why}`);
  }

  assert.deepEqual(broken, [], 'Registered contracts that do not hold:\n  ' + broken.join('\n  '));
});

test('Advertised Price Coverage - every gap is owned, reasoned and expiring', () => {
  const defects = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.gap) continue;
    const { owner, issue, expires, reason, priceLiterals } = entry.gap;

    if (!owner) defects.push(`${packageRoot}: gap has no owner`);
    if (!issue) defects.push(`${packageRoot}: gap has no issue`);
    if (!reason || reason.trim().length < 60) {
      defects.push(`${packageRoot}: gap needs a reason saying why it is not done yet`);
    }
    if (!Number.isInteger(priceLiterals) || priceLiterals < 0) {
      defects.push(`${packageRoot}: gap must record an exact priceLiterals count`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires ?? '')) {
      defects.push(`${packageRoot}: gap needs an expiry as YYYY-MM-DD`);
      continue;
    }
    if (expires <= today) {
      defects.push(`${packageRoot}: gap expired on ${expires} — write the contract or re-decide`);
    }
    const days = (Date.parse(expires) - Date.parse(today)) / 86_400_000;
    if (days > MAX_EXPIRY_DAYS) {
      defects.push(
        `${packageRoot}: gap expires in ${Math.round(days)} days, over the ` +
          `${MAX_EXPIRY_DAYS}-day maximum. An expiry far enough out is not an expiry`
      );
    }
  }

  assert.deepEqual(defects, [], 'Gap register defects:\n  ' + defects.join('\n  '));
});

test('Advertised Price Coverage - no gap grows, and none goes stale', () => {
  const live = pricedPackagesWithPaymentPath();
  const drifted = [];

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.gap) continue;
    const actual = live.get(packageRoot);
    const declared = entry.gap.priceLiterals;
    if (actual === declared) continue;

    drifted.push(
      actual > declared
        ? `${packageRoot}: ${actual} price literals, register says ${declared}. The ` +
          'unbound surface grew. Bind the new amounts, or raise the count ' +
          'deliberately and say why in the reason.'
        : `${packageRoot}: ${actual} price literals, register says ${declared}. Work ` +
          'landed and the register went stale — lower the count so it keeps ' +
          'measuring something.'
    );
  }

  assert.deepEqual(drifted, [], 'Gap counts no longer match the repository:\n  ' + drifted.join('\n  '));
});
