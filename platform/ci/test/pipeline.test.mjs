import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  VENTURE_CATALOG,
  getChangedFiles,
  resolveAffectedComponents,
} from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

test('CI Pipeline Catalog - Directory Integrity', () => {
  assert.ok(Array.isArray(VENTURE_CATALOG), 'Venture catalog should be an array');
  assert.ok(VENTURE_CATALOG.length >= 5, 'Venture catalog should contain at least 5 registered ventures');

  for (const component of VENTURE_CATALOG) {
    assert.ok(component.id, `Component missing ID: ${JSON.stringify(component)}`);
    assert.ok(component.dir, `Component ${component.id} missing dir`);
    assert.ok(component.type, `Component ${component.id} missing type`);

    const fullPath = path.join(REPO_ROOT, component.dir);
    assert.ok(
      fs.existsSync(fullPath),
      `Registered component directory does not exist on filesystem: ${component.dir}`
    );
  }
});

test('CI Pipeline Affected Path Resolver - Venture Path Matching', () => {
  const mockCatalog = [
    { id: 'app1', dir: 'ventures/app1', type: 'node' },
    { id: 'app2', dir: 'ventures/app2', type: 'python' },
  ];

  // Test single app change
  const singleApp = resolveAffectedComponents(['ventures/app1/src/index.ts'], mockCatalog);
  assert.deepEqual(singleApp, ['app1']);

  // Test multi-app changes
  const multiApp = resolveAffectedComponents(
    ['ventures/app1/package.json', 'ventures/app2/main.py'],
    mockCatalog
  );
  assert.deepEqual(multiApp.sort(), ['app1', 'app2'].sort());

  // Test unaffected changes
  const nonVenture = resolveAffectedComponents(['docs/guide.md'], mockCatalog);
  assert.deepEqual(nonVenture, []);
});

test('CI Pipeline Affected Path Resolver - Monorepo Infrastructure Global Trigger', () => {
  const mockCatalog = [
    { id: 'app1', dir: 'ventures/app1', type: 'node' },
    { id: 'app2', dir: 'ventures/app2', type: 'python' },
  ];

  // Global script changes force full run
  const scriptChange = resolveAffectedComponents(['scripts/verify-all.sh'], mockCatalog);
  assert.deepEqual(scriptChange, ['app1', 'app2']);

  // GitHub workflows force full run
  const workflowChange = resolveAffectedComponents(['.github/workflows/ci-cd.yml'], mockCatalog);
  assert.deepEqual(workflowChange, ['app1', 'app2']);

  // CI platform changes force full run
  const ciChange = resolveAffectedComponents(['platform/ci/src/pipeline.mjs'], mockCatalog);
  assert.deepEqual(ciChange, ['app1', 'app2']);
});

test('CI Pipeline Git Changed Files Function', () => {
  const files = getChangedFiles();
  // Should either return an array of strings or null (if no git diff base)
  if (files !== null) {
    assert.ok(Array.isArray(files));
  }
});
