import test from 'node:test';
import assert from 'node:assert/strict';
import { detectApiUsage, parseManifest, buildReport, suggestedSnippet, REQUIRED_REASON_CATEGORIES } from './scan.mjs';

test('detects UserDefaults usage in Swift source with file and line', () => {
  const files = [
    { path: 'Sources/Settings.swift', content: 'import Foundation\n\nlet prefs = UserDefaults.standard\n' },
  ];
  const detected = detectApiUsage(files);
  const bucket = detected.get('NSPrivacyAccessedAPICategoryUserDefaults');
  assert.equal(bucket.count, 1);
  assert.equal(bucket.examples[0].path, 'Sources/Settings.swift');
  assert.equal(bucket.examples[0].line, 3);
});

test('detects @AppStorage as user defaults usage', () => {
  const files = [{ path: 'View.swift', content: '@AppStorage("theme") var theme = "light"\n' }];
  const detected = detectApiUsage(files);
  assert.equal(detected.get('NSPrivacyAccessedAPICategoryUserDefaults').count, 1);
});

test('detects file timestamp APIs (stat family) without matching unrelated words', () => {
  const files = [
    { path: 'a.m', content: 'struct stat s;\nstat(path, &s);\nint status = 0; // "stat" substring, not a call\n' },
  ];
  const detected = detectApiUsage(files);
  const bucket = detected.get('NSPrivacyAccessedAPICategoryFileTimestamp');
  // Only the `stat(` call line matches the word-boundary + paren pattern; the
  // declaration and the unrelated `status` variable must not.
  assert.equal(bucket.count, 1);
  assert.equal(bucket.examples[0].line, 2);
});

test('detects disk space and system boot time and active keyboard symbols', () => {
  const files = [
    { path: 'a.swift', content: 'let free = url.resourceValues(forKeys: [.volumeAvailableCapacityKey])' },
    { path: 'b.swift', content: 'let up = ProcessInfo.processInfo.systemUptime' },
    { path: 'c.swift', content: 'let modes = UITextInputMode.activeInputModes' },
  ];
  const detected = detectApiUsage(files);
  assert.equal(detected.get('NSPrivacyAccessedAPICategoryDiskSpace').count, 1);
  assert.equal(detected.get('NSPrivacyAccessedAPICategorySystemBootTime').count, 1);
  assert.equal(detected.get('NSPrivacyAccessedAPICategoryActiveKeyboards').count, 1);
});

test('caps examples per category but keeps the true count', () => {
  const lines = Array.from({ length: 20 }, () => 'UserDefaults.standard.set(1, forKey: "x")').join('\n');
  const detected = detectApiUsage([{ path: 'many.swift', content: lines }]);
  const bucket = detected.get('NSPrivacyAccessedAPICategoryUserDefaults');
  assert.equal(bucket.count, 20);
  assert.ok(bucket.examples.length <= 8);
});

test('non-string content is ignored rather than throwing', () => {
  const detected = detectApiUsage([{ path: 'weird', content: undefined }]);
  assert.equal(detected.get('NSPrivacyAccessedAPICategoryUserDefaults').count, 0);
});

const SAMPLE_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>ZZZZ.9</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
`;

test('parseManifest reads declared categories and their reason codes', () => {
  const { categories, parseNote } = parseManifest(SAMPLE_MANIFEST);
  assert.equal(parseNote, null);
  assert.ok(categories.get('NSPrivacyAccessedAPICategoryUserDefaults').has('CA92.1'));
  assert.ok(categories.get('NSPrivacyAccessedAPICategoryFileTimestamp').has('ZZZZ.9'));
});

test('parseManifest reports a note for an empty or unrecognised file', () => {
  assert.equal(parseManifest('').parseNote, 'empty file');
  assert.equal(parseManifest('<plist><dict/></plist>').parseNote, 'no NSPrivacyAccessedAPITypes array found');
});

test('buildReport: manifest missing entirely is reported distinctly from an empty one', () => {
  const detected = detectApiUsage([]);
  const report = buildReport(detected, null);
  assert.equal(report.manifestFound, false);
  assert.equal(report.ok, false);
});

test('buildReport: detected-but-undeclared category fails the report and is named', () => {
  const files = [{ path: 'a.swift', content: 'UserDefaults.standard.set(true, forKey: "x")' }];
  const detected = detectApiUsage(files);
  const manifest = parseManifest('<plist><dict><key>NSPrivacyAccessedAPITypes</key><array></array></dict></plist>');
  const report = buildReport(detected, manifest);
  const ud = report.categories.find((c) => c.id === 'NSPrivacyAccessedAPICategoryUserDefaults');
  assert.equal(ud.status, 'undeclared');
  assert.equal(report.undeclaredCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport: detected and declared with a valid code passes', () => {
  const files = [{ path: 'a.swift', content: 'UserDefaults.standard.set(true, forKey: "x")' }];
  const detected = detectApiUsage(files);
  const manifest = parseManifest(SAMPLE_MANIFEST);
  const report = buildReport(detected, manifest);
  const ud = report.categories.find((c) => c.id === 'NSPrivacyAccessedAPICategoryUserDefaults');
  assert.equal(ud.status, 'declared');
  assert.equal(report.undeclaredCount, 0);
});

test('buildReport: flags a reason code that is not one of Apple\'s published codes for that category', () => {
  const detected = detectApiUsage([]);
  const manifest = parseManifest(SAMPLE_MANIFEST); // FileTimestamp declared with bogus ZZZZ.9
  const report = buildReport(detected, manifest);
  const ft = report.categories.find((c) => c.id === 'NSPrivacyAccessedAPICategoryFileTimestamp');
  assert.deepEqual(ft.invalidReasonCodes, ['ZZZZ.9']);
  assert.equal(report.invalidCodeCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport: declared with no detected usage is its own status, not a failure', () => {
  const detected = detectApiUsage([]); // nothing in source
  const manifest = parseManifest(SAMPLE_MANIFEST); // but UserDefaults is declared
  const report = buildReport(detected, manifest);
  const ud = report.categories.find((c) => c.id === 'NSPrivacyAccessedAPICategoryUserDefaults');
  assert.equal(ud.status, 'declared-but-not-detected');
});

test('every category has at least one reason code and one detection symbol', () => {
  for (const category of REQUIRED_REASON_CATEGORIES) {
    assert.ok(category.reasons.length > 0, `${category.id} has no reasons`);
    assert.ok(category.symbols.length > 0, `${category.id} has no symbols`);
  }
});

test('suggestedSnippet embeds the category id and its first reason code', () => {
  const snippet = suggestedSnippet('NSPrivacyAccessedAPICategoryUserDefaults');
  assert.ok(snippet.includes('NSPrivacyAccessedAPICategoryUserDefaults'));
  assert.ok(snippet.includes('CA92.1'));
});

test('suggestedSnippet on an unknown category id returns empty string rather than throwing', () => {
  assert.equal(suggestedSnippet('not-a-real-category'), '');
});
