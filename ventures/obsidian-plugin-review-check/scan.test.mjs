import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseManifest,
  parseVersions,
  detectSamplePluginDefaults,
  checkVersionsEntry,
  detectUnsafeDom,
  detectGlobalListeners,
  detectConsoleLog,
  buildReport,
  MANIFEST_REQUIRED_FIELDS,
  SAMPLE_PLUGIN_DEFAULTS,
} from './scan.mjs';

test('parseManifest: absent text reports every required field missing', () => {
  const result = parseManifest(null);
  assert.equal(result.found, false);
  assert.deepEqual(result.missingRequired, MANIFEST_REQUIRED_FIELDS);
});

test('parseManifest: invalid JSON is reported as a parse error, not silently empty', () => {
  const result = parseManifest('{ not json');
  assert.equal(result.found, true);
  assert.equal(result.parseError, true);
  assert.equal(result.data, null);
});

test('parseManifest: a complete manifest has no missing fields', () => {
  const manifest = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    minAppVersion: '0.15.0',
    description: 'Does a thing.',
    author: 'Real Author',
  };
  const result = parseManifest(JSON.stringify(manifest));
  assert.equal(result.found, true);
  assert.equal(result.parseError, false);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.missingRecommended, ['authorUrl', 'fundingUrl', 'isDesktopOnly']);
});

test('parseManifest: a blank required field counts as missing, not merely absent', () => {
  const manifest = { id: '', name: 'My Plugin', version: '1.0.0', minAppVersion: '0.15.0', description: 'x', author: 'A' };
  const result = parseManifest(JSON.stringify(manifest));
  assert.ok(result.missingRequired.includes('id'));
});

test('parseVersions: absent text reports not found', () => {
  const result = parseVersions(null);
  assert.equal(result.found, false);
});

test('parseVersions: an array or non-object is a parse error', () => {
  assert.equal(parseVersions('[]').parseError, true);
  assert.equal(parseVersions('"x"').parseError, true);
  assert.equal(parseVersions('null').parseError, true);
});

test('parseVersions: a valid map parses cleanly', () => {
  const result = parseVersions(JSON.stringify({ '1.0.0': '0.15.0', '1.1.0': '0.15.0' }));
  assert.equal(result.found, true);
  assert.equal(result.parseError, false);
  assert.equal(result.data['1.1.0'], '0.15.0');
});

test('detectSamplePluginDefaults: flags every leftover placeholder value', () => {
  const found = detectSamplePluginDefaults({ id: 'sample-plugin', name: 'Sample Plugin', author: 'Your Name' });
  assert.equal(found.length, 3);
  assert.deepEqual(found.map((f) => f.field).sort(), ['author', 'id', 'name']);
});

test('detectSamplePluginDefaults: a customized manifest flags nothing', () => {
  const found = detectSamplePluginDefaults({ id: 'my-real-plugin', name: 'My Real Plugin', author: 'Jane Dev' });
  assert.deepEqual(found, []);
});

test('detectSamplePluginDefaults: no manifest data is not an error', () => {
  assert.deepEqual(detectSamplePluginDefaults(null), []);
});

test('SAMPLE_PLUGIN_DEFAULTS matches the documented obsidian-sample-plugin template values', () => {
  assert.deepEqual(SAMPLE_PLUGIN_DEFAULTS, { id: 'sample-plugin', name: 'Sample Plugin', author: 'Your Name' });
});

test('checkVersionsEntry: present when the manifest version has a matching key', () => {
  const result = checkVersionsEntry({ version: '1.2.0' }, { '1.2.0': '0.15.0' });
  assert.equal(result.status, 'present');
  assert.equal(result.minAppVersion, '0.15.0');
});

test('checkVersionsEntry: missing when the current version has no key', () => {
  const result = checkVersionsEntry({ version: '1.3.0' }, { '1.2.0': '0.15.0' });
  assert.equal(result.status, 'missing');
  assert.equal(result.version, '1.3.0');
});

test('checkVersionsEntry: not-checked when either file is absent', () => {
  assert.equal(checkVersionsEntry(null, { '1.0.0': '0.15.0' }).status, 'not-checked');
  assert.equal(checkVersionsEntry({ version: '1.0.0' }, null).status, 'not-checked');
});

test('detectUnsafeDom: flags innerHTML and outerHTML assignment', () => {
  const files = [{ path: 'main.js', content: 'el.innerHTML = x;\nother.outerHTML = y;' }];
  const found = detectUnsafeDom(files);
  assert.equal(found.length, 2);
  assert.equal(found[0].line, 1);
  assert.equal(found[1].line, 2);
});

test('detectUnsafeDom: flags insertAdjacentHTML calls', () => {
  const files = [{ path: 'main.js', content: "el.insertAdjacentHTML('beforeend', x);" }];
  assert.equal(detectUnsafeDom(files).length, 1);
});

test('detectUnsafeDom: does not flag a strict-equality comparison of innerHTML', () => {
  // A comparison (`===`) is not an assignment; the negative-lookahead in the
  // pattern exists specifically so this does not false-positive.
  const files = [{ path: 'main.js', content: "if (el.innerHTML === '') return;" }];
  assert.equal(detectUnsafeDom(files).length, 0);
});

test('detectUnsafeDom: ignores a mention inside a comment or a string literal', () => {
  const files = [{
    path: 'main.js',
    content: [
      "// avoid el.innerHTML = x here",
      "const msg = 'do not use .innerHTML = value';",
      "const safe = createEl('div');",
    ].join('\n'),
  }];
  assert.equal(detectUnsafeDom(files).length, 0);
});

test('detectUnsafeDom: safe DOM APIs are never flagged', () => {
  const files = [{ path: 'main.js', content: "const el = createEl('div', { text: value });" }];
  assert.equal(detectUnsafeDom(files).length, 0);
});

test('detectGlobalListeners: flags direct document/window.addEventListener calls', () => {
  const files = [{ path: 'main.js', content: "document.addEventListener('keydown', fn);\nwindow.addEventListener('resize', fn);" }];
  assert.equal(detectGlobalListeners(files).length, 2);
});

test('detectGlobalListeners: registerDomEvent usage alone is not flagged', () => {
  const files = [{ path: 'main.js', content: "this.registerDomEvent(document, 'keydown', fn);" }];
  assert.equal(detectGlobalListeners(files).length, 0);
});

test('detectConsoleLog: flags console.log calls', () => {
  const files = [{ path: 'main.js', content: "console.log('debug');\nconsole.error('kept');" }];
  const found = detectConsoleLog(files);
  assert.equal(found.length, 1);
  assert.match(found[0].snippet, /console\.log/);
});

test('buildReport: ok is true only when every blocking check is clean', () => {
  const manifest = parseManifest(JSON.stringify({
    id: 'my-plugin', name: 'My Plugin', version: '1.0.0', minAppVersion: '0.15.0', description: 'x', author: 'Jane',
  }));
  const versions = parseVersions(JSON.stringify({ '1.0.0': '0.15.0' }));
  const samplePluginDefaults = detectSamplePluginDefaults(manifest.data);
  const versionsEntry = checkVersionsEntry(manifest.data, versions.data);
  const files = [{ path: 'main.js', content: "console.log('hi');" }];
  const report = buildReport({
    manifest, versions, samplePluginDefaults, versionsEntry,
    unsafeDom: detectUnsafeDom(files),
    globalListeners: detectGlobalListeners(files),
    consoleLog: detectConsoleLog(files),
  });
  // console.log is informational only -- it must not affect ok.
  assert.equal(report.ok, true);
});

test('buildReport: a sample-plugin placeholder blocks ok even if everything else is clean', () => {
  const manifest = parseManifest(JSON.stringify({
    id: 'sample-plugin', name: 'My Plugin', version: '1.0.0', minAppVersion: '0.15.0', description: 'x', author: 'Jane',
  }));
  const versions = parseVersions(JSON.stringify({ '1.0.0': '0.15.0' }));
  const report = buildReport({
    manifest,
    versions,
    samplePluginDefaults: detectSamplePluginDefaults(manifest.data),
    versionsEntry: checkVersionsEntry(manifest.data, versions.data),
    unsafeDom: [],
    globalListeners: [],
    consoleLog: [],
  });
  assert.equal(report.ok, false);
});

test('buildReport: a missing versions.json entry blocks ok', () => {
  const manifest = parseManifest(JSON.stringify({
    id: 'my-plugin', name: 'My Plugin', version: '2.0.0', minAppVersion: '0.15.0', description: 'x', author: 'Jane',
  }));
  const versions = parseVersions(JSON.stringify({ '1.0.0': '0.15.0' }));
  const report = buildReport({
    manifest,
    versions,
    samplePluginDefaults: detectSamplePluginDefaults(manifest.data),
    versionsEntry: checkVersionsEntry(manifest.data, versions.data),
    unsafeDom: [],
    globalListeners: [],
    consoleLog: [],
  });
  assert.equal(report.ok, false);
  assert.equal(report.versionsEntry.status, 'missing');
});
