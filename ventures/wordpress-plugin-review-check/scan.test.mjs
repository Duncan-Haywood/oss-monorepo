import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReadme,
  findPluginHeaderFile,
  parsePluginHeader,
  detectUnescapedOutput,
  detectMissingNonceChecks,
  buildReport,
  normalizeLicense,
  checkLicenses,
  REQUIRED_README_FIELDS,
  RECOMMENDED_README_FIELDS,
  REQUIRED_PLUGIN_HEADER_FIELDS,
} from './scan.mjs';

const GOOD_README = `=== Example ===
Contributors: dev
Tags: demo
Requires at least: 6.0
Tested up to: 6.6
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

== Description ==
Example.
`;

const GOOD_HEADER = `<?php
/**
 * Plugin Name: Example
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: example
 */
`;

test('parseReadme reads required and recommended fields', () => {
  const r = parseReadme(GOOD_README);
  assert.equal(r.found, true);
  assert.equal(r.headers.stableTag, '1.0.0');
  assert.equal(r.headers.license, 'GPLv2 or later');
  assert.equal(r.headers.licenseUri, 'https://www.gnu.org/licenses/gpl-2.0.html');
  assert.equal(r.headers.contributors, 'dev');
  assert.deepEqual(r.missingRequired, []);
  assert.deepEqual(r.missingRecommended, []);
});

test('parseReadme reports missing required and recommended fields separately', () => {
  const r = parseReadme('=== Bare ===\nStable tag: 1.0.0\n');
  assert.equal(r.found, true);
  assert.ok(r.missingRequired.includes('license'));
  // License URI is optional in the readme docs and Plugin Check does not
  // check it (audit 2026-11-26, defect 4): recommended, not required.
  assert.ok(!r.missingRequired.includes('licenseUri'));
  assert.ok(r.missingRecommended.includes('licenseUri'));
  assert.ok(!r.missingRequired.includes('stableTag'));
  assert.ok(r.missingRecommended.includes('contributors'));
});

test('parseReadme with no text reports not found and everything missing', () => {
  const r = parseReadme(null);
  assert.equal(r.found, false);
  assert.equal(r.missingRequired.length, REQUIRED_README_FIELDS.length);
  assert.equal(r.missingRecommended.length, RECOMMENDED_README_FIELDS.length);
});

test('findPluginHeaderFile finds the file carrying "Plugin Name:" and ignores others', () => {
  const files = [
    { path: 'includes/helpers.php', content: '<?php function helper() {}' },
    { path: 'example.php', content: GOOD_HEADER },
  ];
  const found = findPluginHeaderFile(files);
  assert.equal(found.path, 'example.php');
});

test('findPluginHeaderFile returns null when no file has a header', () => {
  const files = [{ path: 'includes/helpers.php', content: '<?php function helper() {}' }];
  assert.equal(findPluginHeaderFile(files), null);
});

test('parsePluginHeader reads required and recommended fields', () => {
  const h = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  assert.equal(h.found, true);
  assert.equal(h.headers.pluginName, 'Example');
  assert.equal(h.headers.version, '1.0.0');
  assert.deepEqual(h.missingRequired, []);
  assert.deepEqual(h.missingRecommended, []);
});

test('parsePluginHeader with no file reports not found and everything missing', () => {
  const h = parsePluginHeader(null);
  assert.equal(h.found, false);
  assert.equal(h.missingRequired.length, REQUIRED_PLUGIN_HEADER_FIELDS.length);
});

test('parsePluginHeader reports a missing Version separately from a missing Plugin Name', () => {
  const h = parsePluginHeader({ path: 'x.php', content: '<?php /**\n * Plugin Name: X\n * License: GPLv2\n */' });
  assert.deepEqual(h.missingRequired, ['version']);
});

test('detectUnescapedOutput flags echo of a superglobal with no escaping function', () => {
  const files = [{ path: 'x.php', content: "<?php\necho 'Hi ' . $_GET['name'];\n" }];
  const findings = detectUnescapedOutput(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'x.php');
  assert.equal(findings[0].line, 2);
});

test('detectUnescapedOutput does not flag output wrapped in an escaping function', () => {
  const files = [{ path: 'x.php', content: "<?php\necho esc_html( $_GET['name'] );\n" }];
  assert.deepEqual(detectUnescapedOutput(files), []);
});

test('detectUnescapedOutput does not flag echo/superglobal usage that are unrelated to each other', () => {
  const files = [{ path: 'x.php', content: "<?php\necho 'hello';\n$x = $_POST['y'];\n" }];
  assert.deepEqual(detectUnescapedOutput(files), []);
});

test('detectUnescapedOutput checks each of the five superglobals', () => {
  for (const g of ['GET', 'POST', 'REQUEST', 'COOKIE', 'SERVER']) {
    const files = [{ path: 'x.php', content: `<?php\necho $_${g}['k'];\n` }];
    assert.equal(detectUnescapedOutput(files).length, 1, `$_${g} should be flagged`);
  }
});

test('detectUnescapedOutput recognizes each documented escaping/sanitizing function', () => {
  const functions = ['esc_html', 'esc_attr', 'esc_url', 'sanitize_text_field', 'absint', 'intval', 'wp_kses_post'];
  for (const fn of functions) {
    const files = [{ path: 'x.php', content: `<?php\necho ${fn}( $_GET['k'] );\n` }];
    assert.deepEqual(detectUnescapedOutput(files), [], `${fn} should count as escaping`);
  }
});

test('detectMissingNonceChecks flags a file reading $_POST with no nonce function anywhere in it', () => {
  const files = [{ path: 'save.php', content: "<?php\nif ( isset( $_POST['x'] ) ) { do_thing(); }\n" }];
  const findings = detectMissingNonceChecks(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'save.php');
});

test('detectMissingNonceChecks does not flag a file with a nonce check anywhere in it', () => {
  const files = [{
    path: 'save.php',
    content: "<?php\ncheck_admin_referer( 'save_action' );\nif ( isset( $_POST['x'] ) ) { do_thing(); }\n",
  }];
  assert.deepEqual(detectMissingNonceChecks(files), []);
});

test('detectMissingNonceChecks does not flag a file with no $_POST usage at all', () => {
  const files = [{ path: 'display.php', content: '<?php echo "hello";' }];
  assert.deepEqual(detectMissingNonceChecks(files), []);
});

test('detectMissingNonceChecks recognizes each documented nonce-verification function', () => {
  for (const fn of ['check_admin_referer', 'check_ajax_referer', 'wp_verify_nonce']) {
    const files = [{ path: 'x.php', content: `<?php\n${fn}( 'a' );\nif ( $_POST['x'] ) {}\n` }];
    assert.deepEqual(detectMissingNonceChecks(files), [], `${fn} should count as a nonce check`);
  }
});

test('buildReport: a fully clean plugin is ok', () => {
  const readme = parseReadme(GOOD_README);
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.ok, true);
  assert.equal(report.stableTagStatus, 'match');
});

test('buildReport: Stable tag / Version mismatch fails ok and is reported precisely', () => {
  const readme = parseReadme(GOOD_README.replace('Stable tag: 1.0.0', 'Stable tag: 0.9.0'));
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.ok, false);
  assert.equal(report.stableTagStatus, 'mismatch');
  assert.deepEqual(report.stableTagMismatch, { stableTag: '0.9.0', pluginVersion: '1.0.0' });
});

test('buildReport: Stable tag "trunk" fails ok, as Plugin Check errors on it', () => {
  const readme = parseReadme(GOOD_README.replace('Stable tag: 1.0.0', 'Stable tag: trunk'));
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.stableTagStatus, 'trunk');
  assert.equal(report.stableTagMismatch, null);
  assert.equal(report.ok, false);
});

test('buildReport: missing readme.txt fails ok even if everything else is clean', () => {
  const readme = parseReadme(null);
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.ok, false);
  assert.equal(report.readmeFound, false);
  assert.equal(report.stableTagStatus, 'not-checked');
});

test('buildReport: missing plugin header fails ok', () => {
  const readme = parseReadme(GOOD_README);
  const pluginHeader = parsePluginHeader(null);
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.ok, false);
  assert.equal(report.pluginHeaderFound, false);
});

test('buildReport: missing recommended fields alone does not fail ok', () => {
  const readme = parseReadme('=== X ===\nStable tag: 1.0.0\nLicense: GPLv2\nLicense URI: https://x\n');
  const pluginHeader = parsePluginHeader({ path: 'x.php', content: '<?php\n/**\n * Plugin Name: X\n * Version: 1.0.0\n * License: GPLv2\n */\n' });
  const report = buildReport({ readme, pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.ok(report.missingRecommendedReadme.length > 0);
  assert.equal(report.ok, true, 'missing only recommended fields must not fail ok');
});

test('buildReport: unescaped output and missing nonce checks each independently fail ok', () => {
  const readme = parseReadme(GOOD_README);
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER });
  const withEscaping = buildReport({
    readme, pluginHeader,
    unescapedOutput: [{ path: 'x.php', line: 1, snippet: 'echo $_GET["x"];' }],
    missingNonceChecks: [],
  });
  assert.equal(withEscaping.ok, false);
  const withNonce = buildReport({
    readme, pluginHeader, unescapedOutput: [],
    missingNonceChecks: [{ path: 'x.php', line: 1, snippet: '$_POST["x"]' }],
  });
  assert.equal(withNonce.ok, false);
});

// Licence rules, checked against Plugin Check's License_Utils trait and
// Plugin_Readme_Check::check_license / Plugin_Header_Fields_Check (audit
// 2026-11-26-wordpress-plugin-review-check, defect 1: any License passed).
test('normalizeLicense maps the common GPL spellings to one form, as Plugin Check does', () => {
  for (const s of ['GPLv2 or later', 'GPL-2.0-or-later', 'GPLv2', 'GPL v2', 'GPL-2.0+', 'GNU General Public License v2 or later', 'GPL version 2']) {
    assert.equal(normalizeLicense(s), 'GPL2', s);
  }
  assert.equal(normalizeLicense('GPL-3.0'), 'GPL3');
  assert.equal(normalizeLicense('Apache License 2.0'), 'Apache2');
});

test('checkLicenses: matching GPL-compatible licences pass', () => {
  assert.deepEqual(checkLicenses('GPLv2 or later', 'GPL-2.0-or-later'), []);
  assert.deepEqual(checkLicenses('MIT', 'MIT'), []);
});

test('checkLicenses: a proprietary header licence is plugin_header_invalid_license', () => {
  assert.deepEqual(checkLicenses('Proprietary', 'Proprietary').map((i) => i.code), ['plugin_header_invalid_license']);
});

test('checkLicenses: readme and header naming different licences is license_mismatch', () => {
  assert.deepEqual(checkLicenses('Proprietary', 'GPL-2.0-or-later').map((i) => i.code), ['license_mismatch']);
  assert.deepEqual(checkLicenses('GPLv2', 'GPL-3.0').map((i) => i.code), ['license_mismatch']);
});

test('checkLicenses: free text in readme License is invalid_license', () => {
  const codes = checkLicenses('All rights reserved', 'GPLv2').map((i) => i.code);
  assert.ok(codes.includes('invalid_license'));
});

test('buildReport: a licence issue fails ok; a missing header License fails ok', () => {
  const pluginHeader = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER.replace('GPL-2.0-or-later', 'Proprietary') });
  const report = buildReport({ readme: parseReadme(GOOD_README), pluginHeader, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(report.ok, false);
  assert.ok(report.licenseIssues.length > 0);
  const noLicence = parsePluginHeader({ path: 'example.php', content: GOOD_HEADER.replace(' * License: GPL-2.0-or-later\n', '') });
  const r2 = buildReport({ readme: parseReadme(GOOD_README), pluginHeader: noLicence, unescapedOutput: [], missingNonceChecks: [] });
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.missingRequiredHeader, ['License']);
});
