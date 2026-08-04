import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  runSecuritySuite,
  verifyNodeHost,
  verifyPnpmHost,
  verifyPythonHost,
  verifySwiftHost,
  verifyTerraformHost,
} from '../src/pipeline.mjs';

function fixtureRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `pipeline-host-test-${name}-`));
  test.after?.(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function quietly(fn) {
  const { log, warn, error } = console;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

test('Host Verifier - verifyNodeHost succeeds for valid node component with scripts', () => {
  const root = fixtureRoot('node-success');
  const ventureDir = path.join(root, 'ventures/test-node');
  fs.mkdirSync(ventureDir, { recursive: true });

  const pkgJson = {
    name: 'test-node',
    scripts: {
      typecheck: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
  };
  fs.writeFileSync(path.join(ventureDir, 'package.json'), JSON.stringify(pkgJson));

  // Also simulate .next dir to test cleanup path
  fs.mkdirSync(path.join(ventureDir, '.next'), { recursive: true });

  const component = {
    id: 'test-node',
    name: 'Test Node Component',
    dir: 'ventures/test-node',
    type: 'node',
    scripts: ['typecheck', 'test'],
  };

  const result = quietly(() => verifyNodeHost(component, root));
  assert.equal(result, true);
  assert.equal(fs.existsSync(path.join(ventureDir, '.next')), false);
});

test('Host Verifier - verifyNodeHost fails when a script fails', () => {
  const root = fixtureRoot('node-fail');
  const ventureDir = path.join(root, 'ventures/test-node-failing');
  fs.mkdirSync(ventureDir, { recursive: true });

  const pkgJson = {
    name: 'test-node-failing',
    scripts: {
      test: 'sh -c "exit 1"',
    },
  };
  fs.writeFileSync(path.join(ventureDir, 'package.json'), JSON.stringify(pkgJson));

  const component = {
    id: 'test-node-failing',
    name: 'Test Node Failing',
    dir: 'ventures/test-node-failing',
    type: 'node',
    scripts: ['test'],
  };

  const result = quietly(() => verifyNodeHost(component, root));
  assert.equal(result, false);
});

test('Host Verifier - verifyPnpmHost executes ciScript and handles failure', () => {
  const root = fixtureRoot('pnpm-exec');
  const ventureDir = path.join(root, 'ventures/test-pnpm');
  fs.mkdirSync(path.join(ventureDir, 'node_modules'), { recursive: true });

  const pkgJson = {
    name: 'test-pnpm',
    scripts: {
      ci: 'node -e "process.exit(0)"',
      failingCi: 'sh -c "exit 1"',
    },
  };
  fs.writeFileSync(path.join(ventureDir, 'package.json'), JSON.stringify(pkgJson));

  const componentSuccess = {
    id: 'test-pnpm',
    name: 'Test Pnpm',
    dir: 'ventures/test-pnpm',
    type: 'pnpm',
    ciScript: 'ci',
  };

  assert.equal(quietly(() => verifyPnpmHost(componentSuccess, root)), true);

  const componentFailing = {
    id: 'test-pnpm',
    name: 'Test Pnpm Failing',
    dir: 'ventures/test-pnpm',
    type: 'pnpm',
    ciScript: 'failingCi',
  };

  assert.equal(quietly(() => verifyPnpmHost(componentFailing, root)), false);
});

test('Host Verifier - verifyPythonHost runs python tests when present', () => {
  const root = fixtureRoot('py-exec');
  const ventureDir = path.join(root, 'ventures/test-py');
  const testsDir = path.join(ventureDir, 'tests');
  fs.mkdirSync(testsDir, { recursive: true });

  // Create a minimal passing test file
  fs.writeFileSync(
    path.join(testsDir, 'test_sample.py'),
    'def test_pass():\n    assert True\n'
  );

  const component = {
    id: 'test-py',
    name: 'Test Python',
    dir: 'ventures/test-py',
    type: 'python',
    testDir: 'tests',
  };

  assert.equal(quietly(() => verifyPythonHost(component, root)), true);
});

test('Host Verifier - verifyPythonHost test_router.py branch', () => {
  const root = fixtureRoot('py-router');
  const ventureDir = path.join(root, 'ventures/test-router');
  fs.mkdirSync(ventureDir, { recursive: true });

  fs.writeFileSync(
    path.join(ventureDir, 'test_router.py'),
    'import sys\nsys.exit(0)\n'
  );

  const component = {
    id: 'test-router',
    name: 'Test Router Python',
    dir: 'ventures/test-router',
    type: 'python',
    testDir: '.',
  };

  assert.equal(quietly(() => verifyPythonHost(component, root)), true);
});

test('Host Verifier - verifyTerraformHost handles uninitialized or missing terraform', () => {
  const root = fixtureRoot('tf-exec');
  const tfDir = path.join(root, 'platform/terraform');
  fs.mkdirSync(tfDir, { recursive: true });

  fs.writeFileSync(path.join(tfDir, 'main.tf'), '# Terraform config\n');

  const component = {
    id: 'platform-terraform',
    name: 'Platform Terraform',
    dir: 'platform/terraform',
    type: 'terraform',
  };

  assert.equal(quietly(() => verifyTerraformHost(component, root)), true);
});

test('Host Verifier - runSecuritySuite executes scanner scripts when present', () => {
  const root = fixtureRoot('sec-exec');
  const secDir = path.join(root, 'scripts/security');
  fs.mkdirSync(secDir, { recursive: true });

  // Mock scan-repository.sh
  const policyScript = path.join(secDir, 'scan-repository.sh');
  fs.writeFileSync(policyScript, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

  // Mock security-scan.sh
  const auditScript = path.join(root, 'scripts/security-scan.sh');
  fs.writeFileSync(auditScript, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

  assert.equal(quietly(() => runSecuritySuite(root)), true);
});

test('Host Verifier - runSecuritySuite fails when scan-repository fails', () => {
  const root = fixtureRoot('sec-fail');
  const secDir = path.join(root, 'scripts/security');
  fs.mkdirSync(secDir, { recursive: true });

  // Mock failing scan-repository.sh
  const policyScript = path.join(secDir, 'scan-repository.sh');
  fs.writeFileSync(policyScript, '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });

  // Mock passing security-scan.sh
  const auditScript = path.join(root, 'scripts/security-scan.sh');
  fs.writeFileSync(auditScript, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

  assert.equal(quietly(() => runSecuritySuite(root)), false);
});

test('Host Verifier - verifyNodeHost missing package.json', () => {
  const root = fixtureRoot('node-missing-pkg');
  const component = {
    id: 'test-missing',
    name: 'Missing Pkg',
    dir: 'ventures/missing-pkg',
    type: 'node',
    scripts: ['test'],
  };
  assert.equal(quietly(() => verifyNodeHost(component, root)), false);
});

test('Host Verifier - verifyNodeHost installs dependencies when missing (with/without lockfile)', () => {
  const root = fixtureRoot('node-install');
  const ventureDir = path.join(root, 'ventures/test-install');
  const subpkgDir = path.join(ventureDir, 'subpkg');
  fs.mkdirSync(subpkgDir, { recursive: true });
  fs.writeFileSync(path.join(subpkgDir, 'package.json'), JSON.stringify({ name: 'subpkg', version: '1.0.0' }));

  const pkgJson = {
    name: 'test-install',
    version: '1.0.0',
    dependencies: { subpkg: 'file:./subpkg' },
    scripts: {
      test: 'node -e "process.exit(0)"',
    },
  };
  fs.writeFileSync(path.join(ventureDir, 'package.json'), JSON.stringify(pkgJson));

  const component = {
    id: 'test-install',
    name: 'Test Install Node',
    dir: 'ventures/test-install',
    type: 'node',
    scripts: ['test'],
  };

  // Without package-lock.json: verifyNodeHost runs npm install and creates package-lock.json & node_modules
  assert.equal(quietly(() => verifyNodeHost(component, root)), true);

  // Clean node_modules and test with the created package-lock.json (which triggers npm ci)
  fs.rmSync(path.join(ventureDir, 'node_modules'), { recursive: true, force: true });
  assert.equal(quietly(() => verifyNodeHost(component, root)), true);
});

test('Host Verifier - verifyNodeHost fails on undefined script in catalog', () => {
  const root = fixtureRoot('node-undef-script');
  const ventureDir = path.join(root, 'ventures/test-undef');
  fs.mkdirSync(ventureDir, { recursive: true });

  const pkgJson = {
    name: 'test-undef',
    scripts: {
      test: 'node -e "process.exit(0)"',
    },
  };
  fs.writeFileSync(path.join(ventureDir, 'package.json'), JSON.stringify(pkgJson));

  const component = {
    id: 'test-undef',
    name: 'Test Undef Script',
    dir: 'ventures/test-undef',
    type: 'node',
    scripts: ['test', 'nonexistent-script'],
  };

  assert.equal(quietly(() => verifyNodeHost(component, root)), false);
});

test('Host Verifier - verifyPnpmHost handles missing package.json and missing node_modules', () => {
  const root = fixtureRoot('pnpm-branches');
  const componentMissing = {
    id: 'test-pnpm-missing',
    name: 'Missing Pnpm',
    dir: 'ventures/missing-pnpm',
    type: 'pnpm',
    ciScript: 'ci',
  };
  assert.equal(quietly(() => verifyPnpmHost(componentMissing, root)), false);

  const ventureDir = path.join(root, 'ventures/pnpm-no-modules');
  fs.mkdirSync(ventureDir, { recursive: true });
  fs.writeFileSync(
    path.join(ventureDir, 'package.json'),
    JSON.stringify({ name: 'pnpm-no-modules', scripts: { ci: 'node -e "process.exit(0)"' } })
  );

  const componentInstall = {
    id: 'pnpm-no-modules',
    name: 'Pnpm No Modules',
    dir: 'ventures/pnpm-no-modules',
    type: 'pnpm',
    ciScript: 'ci',
  };
  assert.equal(quietly(() => verifyPnpmHost(componentInstall, root)), true);
});

test('Host Verifier - verifyPythonHost missing directory or failing test', () => {
  const root = fixtureRoot('py-branches');
  const componentMissingDir = {
    id: 'missing-py',
    name: 'Missing Python',
    dir: 'ventures/missing-py',
    type: 'python',
    testDir: 'tests',
  };
  assert.equal(quietly(() => verifyPythonHost(componentMissingDir, root)), false);

  const ventureDir = path.join(root, 'ventures/py-failing');
  const testsDir = path.join(ventureDir, 'tests');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, 'test_fail.py'), 'def test_fail():\n    assert False\n');

  const componentFailing = {
    id: 'py-failing',
    name: 'Py Failing',
    dir: 'ventures/py-failing',
    type: 'python',
    testDir: 'tests',
  };
  assert.equal(quietly(() => verifyPythonHost(componentFailing, root)), false);
});

test('Host Verifier - verifySwiftHost missing Package.swift or invalid directory', () => {
  const root = fixtureRoot('swift-missing');
  const componentMissing = {
    id: 'missing-swift',
    name: 'Missing Swift',
    dir: 'ventures/missing-swift',
    type: 'swift',
  };
  assert.equal(quietly(() => verifySwiftHost(componentMissing, root)), false);
});

test('Host Verifier - verifySwiftHost succeeds for valid swift package', () => {
  const root = fixtureRoot('swift-success');
  const ventureDir = path.join(root, 'ventures/test-swift');
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(ventureDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(path.join(ventureDir, 'Package.swift'), '// swift-tools-version:5.9');
  fs.writeFileSync(path.join(binDir, 'swift'), '#!/bin/sh\nexit 0', { mode: 0o755 });

  const component = {
    id: 'test-swift',
    name: 'Test Swift',
    dir: 'ventures/test-swift',
    type: 'swift',
  };

  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }
});

test('Host Verifier - verifySwiftHost handles missing swift CLI or SDK mismatch', () => {
  const root = fixtureRoot('swift-branches');
  const ventureDir = path.join(root, 'ventures/test-swift-branch');
  const binDirNoSwift = path.join(root, 'bin-noswift');
  const binDirMismatch = path.join(root, 'bin-mismatch');
  fs.mkdirSync(ventureDir, { recursive: true });
  fs.mkdirSync(binDirNoSwift, { recursive: true });
  fs.mkdirSync(binDirMismatch, { recursive: true });

  fs.writeFileSync(path.join(ventureDir, 'Package.swift'), '// swift-tools-version:5.9');
  fs.writeFileSync(
    path.join(binDirMismatch, 'swift'),
    '#!/bin/sh\necho "error: SDK is not supported" >&2\nexit 1',
    { mode: 0o755 }
  );

  const component = {
    id: 'test-swift-branch',
    name: 'Test Swift Branch',
    dir: 'ventures/test-swift-branch',
    type: 'swift',
  };

  const origPath = process.env.PATH;
  process.env.PATH = `${binDirNoSwift}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }

  process.env.PATH = `${binDirMismatch}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }
});

test('Host Verifier - verifySwiftHost handles swift test failure, module redefinition, invalid manifest, and generic errors', () => {
  const root = fixtureRoot('swift-err-branches');
  const ventureDir = path.join(root, 'ventures/test-swift-err');
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(ventureDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(path.join(ventureDir, 'Package.swift'), '// swift-tools-version:5.9');

  // Create mock swift CLI script that supports dump-package but fails swift test in various ways
  const mockSwiftPath = path.join(binDir, 'swift');

  const component = {
    id: 'test-swift-err',
    name: 'Test Swift Err',
    dir: 'ventures/test-swift-err',
    type: 'swift',
  };

  const origPath = process.env.PATH;

  // 1. swift test fails with "redefinition of module"
  fs.writeFileSync(
    mockSwiftPath,
    '#!/bin/sh\nif [ "$1" = "package" ]; then exit 0; fi\necho "redefinition of module Foo" >&2\nexit 1',
    { mode: 0o755 }
  );
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }

  // 2. swift test fails with "Invalid manifest"
  fs.writeFileSync(
    mockSwiftPath,
    '#!/bin/sh\nif [ "$1" = "package" ]; then exit 0; fi\necho "Invalid manifest" >&2\nexit 1',
    { mode: 0o755 }
  );
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }

  // 3. swift test fails with "Operation not permitted"
  fs.writeFileSync(
    mockSwiftPath,
    '#!/bin/sh\nif [ "$1" = "package" ]; then exit 0; fi\necho "Operation not permitted" >&2\nexit 1',
    { mode: 0o755 }
  );
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }

  // 4. swift test fails with generic test failure (returns false)
  fs.writeFileSync(
    mockSwiftPath,
    '#!/bin/sh\nif [ "$1" = "package" ]; then exit 0; fi\necho "Test Suite Failed" >&2\nexit 1',
    { mode: 0o755 }
  );
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), false);
  } finally {
    process.env.PATH = origPath;
  }

  // 5. dump-package fails with unhandled error status (not SDK/sandbox), proceeding to swift test
  fs.writeFileSync(
    mockSwiftPath,
    '#!/bin/sh\nif [ "$1" = "package" ]; then echo "unknown dump error" >&2; exit 1; fi\nexit 0',
    { mode: 0o755 }
  );
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifySwiftHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }
});

test('Host Verifier - verifyNodeHost handles Prisma schema generation and .next build cleanup', () => {
  const root = fixtureRoot('node-prisma-next');
  const ventureDir = path.join(root, 'ventures/test-prisma');
  fs.mkdirSync(path.join(ventureDir, 'prisma'), { recursive: true });
  fs.mkdirSync(path.join(ventureDir, '.next'), { recursive: true });

  fs.writeFileSync(path.join(ventureDir, 'prisma/schema.prisma'), '// prisma schema');
  fs.writeFileSync(
    path.join(ventureDir, 'package.json'),
    JSON.stringify({
      name: 'test-prisma',
      scripts: {
        build: 'node -e "process.exit(0)"',
      },
    })
  );

  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'npx'), '#!/bin/sh\nexit 0', { mode: 0o755 });

  const component = {
    id: 'test-prisma',
    name: 'Test Prisma Component',
    dir: 'ventures/test-prisma',
    type: 'node',
    hasPrisma: true,
    scripts: ['build'],
  };

  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifyNodeHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }
});

test('Host Verifier - verifyTerraformHost validates when .terraform dir exists or when terraform CLI missing', () => {
  const root = fixtureRoot('tf-validate');
  const tfDir = path.join(root, 'platform/terraform');
  fs.mkdirSync(path.join(tfDir, '.terraform'), { recursive: true });

  fs.writeFileSync(path.join(tfDir, 'main.tf'), '# terraform\n');

  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'terraform'), '#!/bin/sh\nexit 0', { mode: 0o755 });

  const component = {
    id: 'platform-terraform',
    name: 'Platform Terraform',
    dir: 'platform/terraform',
    type: 'terraform',
  };

  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    assert.equal(quietly(() => verifyTerraformHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }

  // Also test missing terraform CLI path
  process.env.PATH = '/nonexistent-bin-dir';
  try {
    assert.equal(quietly(() => verifyTerraformHost(component, root)), true);
  } finally {
    process.env.PATH = origPath;
  }
});

test('Host Verifier - runSecuritySuite handles missing scanner scripts and failing audit script', () => {
  const root = fixtureRoot('sec-missing');

  // Missing scan-repository.sh
  assert.equal(quietly(() => runSecuritySuite(root)), false);

  // Present scan-repository.sh but missing security-scan.sh
  const secDir = path.join(root, 'scripts/security');
  fs.mkdirSync(secDir, { recursive: true });
  fs.writeFileSync(path.join(secDir, 'scan-repository.sh'), '#!/bin/sh\nexit 0', { mode: 0o755 });
  assert.equal(quietly(() => runSecuritySuite(root)), false);

  // Present security-scan.sh but failing
  fs.writeFileSync(path.join(root, 'scripts/security-scan.sh'), '#!/bin/sh\nexit 1', { mode: 0o755 });
  assert.equal(quietly(() => runSecuritySuite(root)), false);
});






