import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssets, hasBlockingFinding, roleFromName } from './engine.mjs';

const shot = (name, width, height, extra = {}) => ({
  name,
  role: 'screenshot',
  info: { format: 'png', width, height, hasTransparency: false, hasAlphaChannel: false, bitDepth: 8, interlaced: false, ...extra },
});

const icon = (name, width, height, extra = {}) => ({
  ...shot(name, width, height, extra),
  role: 'icon',
});

const ids = (report) => report.findings.map((f) => f.id);

test('a clean iOS set produces no findings', () => {
  const report = classifyAssets(
    [
      icon('AppIcon.png', 1024, 1024),
      shot('01.png', 1290, 2796),
      shot('02.png', 1290, 2796),
      shot('03.png', 1290, 2796),
    ],
    { store: 'ios' },
  );
  assert.deepEqual(report.findings, []);
  assert.equal(hasBlockingFinding(report), false);
  assert.equal(report.counts.screenshots, 3);
});

test('an icon with an alpha channel is a blocking finding', () => {
  const report = classifyAssets([icon('AppIcon.png', 1024, 1024, { hasAlphaChannel: true, hasTransparency: true, colorType: 6 })], { store: 'ios' });
  assert.deepEqual(ids(report), ['icon-transparency']);
  assert.equal(report.findings[0].severity, 'danger');
  assert.match(report.findings[0].detail, /colour type \(6\)/);
  assert.equal(hasBlockingFinding(report), true);
});

test('a palette icon made transparent by tRNS is caught too', () => {
  const report = classifyAssets(
    [icon('AppIcon.png', 1024, 1024, { hasAlphaChannel: false, hasTransparency: true, hasTransparencyChunk: true, colorType: 3 })],
    { store: 'ios' },
  );
  assert.deepEqual(ids(report), ['icon-transparency']);
  assert.match(report.findings[0].detail, /tRNS/);
});

test('Play allows a transparent icon, App Store does not', () => {
  const transparent = icon('icon.png', 512, 512, { hasAlphaChannel: true, hasTransparency: true, colorType: 6 });
  assert.equal(classifyAssets([transparent], { store: 'play' }).findings.length, 0);
  // Same file, wrong store: now both the size and the transparency are wrong.
  const ios = classifyAssets([transparent], { store: 'ios' });
  assert.deepEqual(ids(ios).sort(), ['icon-dimensions', 'icon-transparency']);
});

test('an icon that is not 1024x1024 is blocking on iOS', () => {
  const report = classifyAssets([icon('AppIcon.png', 512, 512)], { store: 'ios' });
  assert.deepEqual(ids(report), ['icon-dimensions']);
  assert.match(report.findings[0].detail, /512x512/);
});

test('mixed screenshot sizes in one set is blocking, and names both sizes', () => {
  const report = classifyAssets(
    [shot('01.png', 1290, 2796), shot('02.png', 1290, 2796), shot('03.png', 1284, 2778)],
    { store: 'ios' },
  );
  assert.ok(ids(report).includes('mixed-dimensions'));
  const f = report.findings.find((x) => x.id === 'mixed-dimensions');
  assert.equal(f.severity, 'danger');
  assert.match(f.detail, /1290x2796/);
  assert.match(f.detail, /1284x2778/);
  assert.match(f.detail, /03\.png/);
});

test('a single screenshot cannot be inconsistent with itself', () => {
  const report = classifyAssets([shot('01.png', 1290, 2796)], { store: 'ios' });
  assert.equal(ids(report).includes('mixed-dimensions'), false);
});

test('mixing portrait and landscape is a notice, not a block', () => {
  const report = classifyAssets(
    [shot('01.png', 1290, 2796), shot('02.png', 2796, 1290)],
    { store: 'ios' },
  );
  const f = report.findings.find((x) => x.id === 'mixed-orientation');
  assert.equal(f.severity, 'notice');
  // Both are valid App Store sizes, so the only *blocking* thing here would be
  // the size mismatch -- which is real and should still fire.
  assert.ok(ids(report).includes('mixed-dimensions'));
});

test('an unrecognised iOS size is a notice that blames the table, not the file', () => {
  const report = classifyAssets([shot('01.png', 1234, 4321)], { store: 'ios' });
  const f = report.findings.find((x) => x.id === 'unrecognised-size');
  assert.equal(f.severity, 'notice');
  assert.match(f.detail, /table/i);
  assert.equal(hasBlockingFinding(report), false);
});

test('a landscape screenshot matching a transposed display class is accepted', () => {
  const report = classifyAssets([shot('01.png', 2796, 1290)], { store: 'ios' });
  assert.equal(ids(report).includes('unrecognised-size'), false);
});

test('more than ten iOS screenshots is blocking', () => {
  const many = Array.from({ length: 11 }, (_, i) => shot(`s${i}.png`, 1290, 2796));
  const report = classifyAssets(many, { store: 'ios' });
  const f = report.findings.find((x) => x.id === 'too-many-screenshots');
  assert.equal(f.severity, 'danger');
  assert.match(f.detail, /11 screenshots/);
});

test('Play refuses more than eight, and wants at least two', () => {
  const nine = Array.from({ length: 9 }, (_, i) => shot(`s${i}.png`, 1080, 1920));
  assert.ok(ids(classifyAssets(nine, { store: 'play' })).includes('too-many-screenshots'));

  const one = classifyAssets([shot('s.png', 1080, 1920)], { store: 'play' });
  const f = one.findings.find((x) => x.id === 'too-few-screenshots');
  assert.equal(f.severity, 'notice');
});

test('Play bounds: too small, too large, and too elongated all block', () => {
  const small = classifyAssets([shot('a.png', 200, 400), shot('b.png', 200, 400)], { store: 'play' });
  assert.ok(ids(small).includes('screenshot-out-of-bounds'));

  const huge = classifyAssets([shot('a.png', 4000, 4000), shot('b.png', 4000, 4000)], { store: 'play' });
  assert.ok(ids(huge).includes('screenshot-out-of-bounds'));

  const tall = classifyAssets([shot('a.png', 1000, 2500), shot('b.png', 1000, 2500)], { store: 'play' });
  const f = tall.findings.find((x) => x.id === 'screenshot-aspect-ratio');
  assert.equal(f.severity, 'danger');
  assert.match(f.detail, /2\.50:1/);
});

test('an exactly 2:1 Play screenshot is accepted', () => {
  // The boundary is inclusive, and floating-point division must not push an
  // exact ratio over the line.
  const report = classifyAssets([shot('a.png', 1080, 2160), shot('b.png', 1080, 2160)], { store: 'play' });
  assert.equal(ids(report).includes('screenshot-aspect-ratio'), false);
});

test('Play feature graphic must be exactly 1024x500 and opaque', () => {
  const bad = classifyAssets(
    [{ name: 'feature-graphic.png', role: 'feature-graphic', info: { format: 'png', width: 1024, height: 512, hasTransparency: true, hasAlphaChannel: true } }],
    { store: 'play' },
  );
  assert.deepEqual(ids(bad).sort(), ['feature-graphic-dimensions', 'feature-graphic-transparency']);
});

test('a format the store does not accept is blocking, and says renaming will not help', () => {
  const report = classifyAssets(
    [{ name: 'shot.png', role: 'screenshot', info: { format: 'heic', error: 'HEIC dimensions are not readable without decoding; this tool measures PNG and JPEG' } }],
    { store: 'ios' },
  );
  assert.ok(ids(report).includes('unsupported-format'));
  assert.match(report.findings.find((f) => f.id === 'unsupported-format').detail, /renaming/i);
});

test('an unreadable file is reported and excluded from the other checks', () => {
  const report = classifyAssets(
    [
      { name: 'broken.png', role: 'screenshot', info: { format: 'unknown', error: 'unrecognised image format (not PNG or JPEG)' } },
      shot('01.png', 1290, 2796),
      shot('02.png', 1290, 2796),
    ],
    { store: 'ios' },
  );
  assert.ok(ids(report).includes('unreadable'));
  // The two good screenshots agree, so the broken one must not have been
  // counted as a third, different size.
  assert.equal(ids(report).includes('mixed-dimensions'), false);
});

test('danger findings sort ahead of notices', () => {
  const report = classifyAssets(
    [shot('01.png', 1234, 4321), icon('AppIcon.png', 999, 999)],
    { store: 'ios' },
  );
  assert.equal(report.findings[0].severity, 'danger');
  assert.equal(report.findings.at(-1).severity, 'notice');
});

test('an empty set is not an error and blocks nothing', () => {
  const report = classifyAssets([], { store: 'ios' });
  assert.deepEqual(report.findings, []);
  assert.equal(report.counts.assets, 0);
});

test('an unknown store is refused rather than silently defaulted', () => {
  assert.throws(() => classifyAssets([], { store: 'amazon' }), /unknown store/);
});

test('roleFromName guesses conservatively', () => {
  assert.equal(roleFromName('AppIcon.png'), 'icon');
  assert.equal(roleFromName('assets/app-icon.png'), 'icon');
  assert.equal(roleFromName('ic_launcher-playstore.png'), 'icon');
  assert.equal(roleFromName('feature_graphic.jpg'), 'feature-graphic');
  assert.equal(roleFromName('01_home.png'), 'screenshot');
  // "iconic-view.png" is a screenshot, not an icon: the word has to stand
  // alone, or every screenshot with "icon" in its name gets the strictest
  // checks in the tool applied to it.
  assert.equal(roleFromName('iconic-view.png'), 'screenshot');
});

test('the report names the store and its source', () => {
  const report = classifyAssets([shot('01.png', 1290, 2796)], { store: 'ios' });
  assert.match(report.storeLabel, /App Store/);
  assert.ok(report.source.length > 0);
});
