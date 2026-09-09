import test from 'node:test';
import assert from 'node:assert/strict';
import { detectApiUsage, parseManifest, buildReport, PERMISSION_SIGNATURES, UNCHECKABLE_PERMISSIONS, BROAD_HOST_PATTERNS } from './scan.mjs';

test('detects chrome.storage usage with file and line', () => {
  const files = [{ path: 'bg.js', content: 'import x from "y";\n\nchrome.storage.local.set({a:1});\n' }];
  const detected = detectApiUsage(files);
  const bucket = detected.get('storage');
  assert.equal(bucket.count, 1);
  assert.equal(bucket.examples[0].path, 'bg.js');
  assert.equal(bucket.examples[0].line, 3);
});

test('detects chrome.tabs usage distinctly from chrome.tabCapture', () => {
  const files = [{ path: 'a.js', content: 'chrome.tabs.query({}, () => {});\nchrome.tabCapture.capture({}, () => {});\n' }];
  const detected = detectApiUsage(files);
  assert.equal(detected.get('tabs').count, 1);
  assert.equal(detected.get('tabCapture').count, 1);
});

test('detects clipboard read/write via web APIs, not just chrome.*', () => {
  const files = [
    { path: 'a.js', content: 'await navigator.clipboard.writeText("x");' },
    { path: 'b.js', content: "document.execCommand('paste');" },
  ];
  const detected = detectApiUsage(files);
  assert.equal(detected.get('clipboardWrite').count, 1);
  assert.equal(detected.get('clipboardRead').count, 1);
});

test('caps examples per permission but keeps the true count', () => {
  const lines = Array.from({ length: 20 }, () => 'chrome.storage.local.get();').join('\n');
  const detected = detectApiUsage([{ path: 'many.js', content: lines }]);
  const bucket = detected.get('storage');
  assert.equal(bucket.count, 20);
  assert.ok(bucket.examples.length <= 8);
});

test('non-string content is ignored rather than throwing', () => {
  const detected = detectApiUsage([{ path: 'weird', content: undefined }]);
  assert.equal(detected.get('storage').count, 0);
});

test('every permission signature has at least one pattern', () => {
  for (const perm of PERMISSION_SIGNATURES) {
    assert.ok(perm.patterns.length > 0, `${perm.id} has no patterns`);
  }
});

test('parseManifest reads permissions, optional_permissions, and host_permissions', () => {
  const manifest = parseManifest(JSON.stringify({
    manifest_version: 3,
    permissions: ['storage', 'tabs'],
    optional_permissions: ['geolocation'],
    host_permissions: ['https://example.com/*'],
  }));
  assert.deepEqual(manifest.permissions.sort(), ['storage', 'tabs']);
  assert.deepEqual(manifest.optionalPermissions, ['geolocation']);
  assert.deepEqual(manifest.hostPermissions, ['https://example.com/*']);
  assert.equal(manifest.manifestVersion, 3);
  assert.equal(manifest.parseNote, null);
});

test('parseManifest splits a host pattern that landed in permissions[] (MV2-style)', () => {
  const manifest = parseManifest(JSON.stringify({ permissions: ['storage', '<all_urls>', 'https://foo.com/*'] }));
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.hostPermissions.sort(), ['<all_urls>', 'https://foo.com/*']);
});

test('parseManifest reports a parse note for invalid JSON and non-object JSON', () => {
  assert.equal(parseManifest('{not json').parseNote, 'could not parse as JSON');
  assert.equal(parseManifest('"just a string"').parseNote, 'not a JSON object');
  assert.equal(parseManifest('').parseNote, 'empty file');
});

test('buildReport: declared and used is declared-and-detected', () => {
  const files = [{ path: 'a.js', content: 'chrome.storage.local.set({});' }];
  const manifest = parseManifest(JSON.stringify({ permissions: ['storage'] }));
  const report = buildReport(detectApiUsage(files), manifest);
  const storage = report.permissions.find((p) => p.id === 'storage');
  assert.equal(storage.status, 'declared-and-detected');
  assert.equal(report.declaredUnusedCount, 0);
  assert.equal(report.detectedUndeclaredCount, 0);
});

test('buildReport: declared but not used is declared-unused and fails ok', () => {
  const manifest = parseManifest(JSON.stringify({ permissions: ['notifications'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  const perm = report.permissions.find((p) => p.id === 'notifications');
  assert.equal(perm.status, 'declared-unused');
  assert.equal(report.declaredUnusedCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport: declared unused in optional_permissions does not count toward declaredUnusedCount', () => {
  const manifest = parseManifest(JSON.stringify({ optional_permissions: ['geolocation'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  const perm = report.permissions.find((p) => p.id === 'geolocation');
  assert.equal(perm.status, 'declared-unused');
  assert.equal(perm.optionalOnly, true);
  assert.equal(report.declaredUnusedCount, 0, 'optional-only unused permissions are not counted as a required-permission problem');
});

test('buildReport: used but not declared anywhere is detected-undeclared', () => {
  const files = [{ path: 'a.js', content: 'chrome.tabs.query({}, () => {});' }];
  const manifest = parseManifest(JSON.stringify({ permissions: [] }));
  const report = buildReport(detectApiUsage(files), manifest);
  const perm = report.permissions.find((p) => p.id === 'tabs');
  assert.equal(perm.status, 'detected-undeclared');
  assert.equal(report.detectedUndeclaredCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport: permission neither declared nor detected is omitted entirely', () => {
  const manifest = parseManifest(JSON.stringify({ permissions: ['storage'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  assert.ok(!report.permissions.some((p) => p.id === 'tabs'), 'irrelevant permissions must not clutter the report');
});

test('buildReport: uncheckable declared permissions are listed separately and never flagged as unused', () => {
  const manifest = parseManifest(JSON.stringify({ permissions: ['activeTab', 'background', 'unlimitedStorage'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  assert.equal(report.uncheckable.length, 3);
  assert.ok(report.permissions.every((p) => p.id !== 'activeTab'));
  assert.equal(report.declaredUnusedCount, 0);
  for (const [id] of UNCHECKABLE_PERMISSIONS) {
    if (['activeTab', 'background', 'unlimitedStorage'].includes(id)) {
      assert.ok(report.uncheckable.some((u) => u.id === id));
    }
  }
});

test('buildReport: an unmapped declared permission is named, not silently dropped or wrongly flagged', () => {
  const manifest = parseManifest(JSON.stringify({ permissions: ['certificateProvider'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  assert.deepEqual(report.unmappedDeclared, ['certificateProvider']);
  assert.equal(report.declaredUnusedCount, 0);
});

test('buildReport: broad host permission patterns are flagged, scoped ones are not', () => {
  const manifest = parseManifest(JSON.stringify({ host_permissions: ['<all_urls>', 'https://example.com/*'] }));
  const report = buildReport(detectApiUsage([]), manifest);
  const byPattern = new Map(report.hostPermissions.map((h) => [h.pattern, h.broad]));
  assert.equal(byPattern.get('<all_urls>'), true);
  assert.equal(byPattern.get('https://example.com/*'), false);
  assert.equal(report.broadHostCount, 1);
  assert.equal(report.ok, false);
});

test('every documented broad host pattern is actually flagged', () => {
  for (const pattern of BROAD_HOST_PATTERNS) {
    const manifest = parseManifest(JSON.stringify({ host_permissions: [pattern] }));
    const report = buildReport(detectApiUsage([]), manifest);
    assert.equal(report.hostPermissions[0].broad, true, `${pattern} should be flagged as broad`);
  }
});

test('buildReport: no manifest found means not ok, and detected usage is still reported as undeclared', () => {
  const report = buildReport(detectApiUsage([{ path: 'a.js', content: 'chrome.tabs.query({});' }]), null);
  assert.equal(report.manifestFound, false);
  assert.equal(report.ok, false);
  // Nothing can be "declared" with no manifest at all, but the API usage
  // that was actually found in source is still real evidence worth surfacing
  // rather than discarding.
  assert.equal(report.permissions.length, 1);
  assert.equal(report.permissions[0].id, 'tabs');
  assert.equal(report.permissions[0].status, 'detected-undeclared');
});

test('buildReport: no manifest and no detected usage reports an empty permissions list', () => {
  const report = buildReport(detectApiUsage([]), null);
  assert.deepEqual(report.permissions, []);
});

test('buildReport: a fully clean manifest (everything declared and used, nothing broad) is ok', () => {
  const files = [{ path: 'a.js', content: 'chrome.storage.local.get();\nchrome.tabs.query({});' }];
  const manifest = parseManifest(JSON.stringify({ permissions: ['storage', 'tabs'], host_permissions: ['https://example.com/*'] }));
  const report = buildReport(detectApiUsage(files), manifest);
  assert.equal(report.ok, true);
});
