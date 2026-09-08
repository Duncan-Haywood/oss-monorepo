import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, runCheck } from './check.mjs';

// mkdtempSync(os.tmpdir()) is unusable in some sandboxes that block writes
// outside the repository -- fixtures live under this venture's own
// directory instead, and every test removes its fixture in a `finally`.
const FIXTURE_PARENT = join(dirname(fileURLToPath(import.meta.url)), '.test-fixtures');
mkdirSync(FIXTURE_PARENT, { recursive: true });

function makeFixture(files) {
  const root = mkdtempSync(join(FIXTURE_PARENT, 'fixture-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const MANIFEST_DECLARING_USER_DEFAULTS = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

test('collectFiles finds Swift/ObjC sources and the manifest, and skips vendored directories', () => {
  const root = makeFixture({
    'App/AppDelegate.swift': 'import UIKit',
    'App/PrivacyInfo.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS,
    'Pods/SomeSDK/Thing.swift': 'let x = UserDefaults.standard',
    '.build/checkouts/dep/Dep.swift': 'let y = 1',
    'App/Legacy.m': '#import <Foundation/Foundation.h>',
    'App/notes.txt': 'not a source file',
  });
  try {
    const { sourceFiles, manifestPaths } = collectFiles(root);
    assert.equal(sourceFiles.length, 2); // AppDelegate.swift, Legacy.m -- not the Pods or .build ones
    assert.ok(sourceFiles.every((p) => !p.includes('Pods') && !p.includes('.build')));
    assert.equal(manifestPaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: UserDefaults used and declared with a valid code reports ok', () => {
  const root = makeFixture({
    'App/Settings.swift': 'let prefs = UserDefaults.standard',
    'App/PrivacyInfo.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS,
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.scannedFileCount, 1);
    assert.equal(result.manifestPath, 'App/PrivacyInfo.xcprivacy');
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: UserDefaults used but no manifest anywhere fails and says so', () => {
  const root = makeFixture({ 'App/Settings.swift': 'let prefs = UserDefaults.standard' });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.manifestPath, null);
    assert.equal(result.report.manifestFound, false);
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: usage in a category the manifest never mentions is undeclared', () => {
  const root = makeFixture({
    'App/Cache.swift': 'let up = ProcessInfo.processInfo.systemUptime',
    'App/PrivacyInfo.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS, // declares UserDefaults, not boot time
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    const bootTime = result.report.categories.find((c) => c.id === 'NSPrivacyAccessedAPICategorySystemBootTime');
    assert.equal(bootTime.status, 'undeclared');
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: --manifest override is read instead of an auto-discovered one', () => {
  const root = makeFixture({
    'App/Settings.swift': 'let prefs = UserDefaults.standard',
    'App/PrivacyInfo.xcprivacy': '<plist><dict><key>NSPrivacyAccessedAPITypes</key><array></array></dict></plist>',
    'other/Manifest.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS,
  });
  try {
    const result = runCheck({ root, manifestOverride: join(root, 'other/Manifest.xcprivacy') });
    assert.equal(result.report.ok, true); // the override declares UserDefaults; the auto one would not
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectFiles reports additional manifests beyond the first so nothing is silently dropped', () => {
  const root = makeFixture({
    'App/PrivacyInfo.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS,
    'Widget/PrivacyInfo.xcprivacy': MANIFEST_DECLARING_USER_DEFAULTS,
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.additionalManifestPaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
