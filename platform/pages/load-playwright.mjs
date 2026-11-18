// One way to find Playwright for every browser script and test in platform/pages.
//
// Playwright is not a dependency of this repository. CI names it with
// PLAYWRIGHT (an entry file or package dir in a scratch install); cloud
// sessions keep a global copy on NODE_PATH. ESM `import('playwright')` ignores
// NODE_PATH, so before this module the browser tests here SKIPPED in cloud
// sessions ("playwright not installed") although `require('playwright')`
// worked: 7 of bar-align.test.mjs's 8 tests on 2026-11-16, and the polish
// prompt's contrast.mjs failed outright (run-record doc_friction, 2026-11-15).
//
// Order: PLAYWRIGHT if set (and nothing else, so a wrong path is reported, not
// papered over), then the bare specifier, then require() (honours NODE_PATH),
// then the cloud image's /opt/node-tools install.

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

export const OPT_NODE_TOOLS = '/opt/node-tools/node_modules/playwright/index.js';

// Playwright ships CommonJS: a path import puts the exports under `.default`,
// a bare specifier gives them directly. Accept either.
const unwrap = (mod) => (mod?.chromium ? mod : mod?.default?.chromium ? mod.default : null);

/** Returns the playwright module, or null with `reason` set on loadPlaywright.lastError. */
export async function loadPlaywright(env = process.env, { optPath = OPT_NODE_TOOLS } = {}) {
  const errors = [];
  const attempts = env.PLAYWRIGHT
    ? [() => import(env.PLAYWRIGHT)]
    : [
        () => import('playwright'),
        () => createRequire(import.meta.url)('playwright'),
        () => (existsSync(optPath) ? import(optPath) : Promise.reject(new Error(`${optPath} absent`))),
      ];
  for (const attempt of attempts) {
    try {
      const pw = unwrap(await attempt());
      if (pw) { loadPlaywright.lastError = null; return pw; }
      errors.push('loaded, but exports no chromium');
    } catch (err) {
      errors.push(String(err.message).split('\n')[0]);
    }
  }
  loadPlaywright.lastError = (env.PLAYWRIGHT ? `PLAYWRIGHT=${env.PLAYWRIGHT}: ` : '') + errors.join('; ');
  return null;
}
loadPlaywright.lastError = null;

/** The playwright module, or exit 2 with a message naming what was tried (for CLI scripts). */
export async function requirePlaywright(env = process.env) {
  const pw = await loadPlaywright(env);
  if (pw) return pw;
  console.error('Could not load Playwright (' + loadPlaywright.lastError + '). Set PLAYWRIGHT to its entry ' +
    'point, e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}
