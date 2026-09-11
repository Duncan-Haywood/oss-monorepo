import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './check.mjs';

// The CLI is the half that touches the filesystem, so these tests write real
// files and read the real exit code -- the contract a CI job depends on.

function pngBytes({ width, height, colorType = 2 }) {
  const chunk = (type, data) => {
    const len = data.length;
    return [
      (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
      ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0,
    ];
  };
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      8, colorType, 0, 0, 0,
    ]),
    ...chunk('IDAT', [0, 0, 0, 0]),
  ]);
}

function withDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'assetcheck-'));
  try {
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const capture = () => {
  const lines = [];
  return { sink: { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) }, lines };
};

test('a clean directory exits 0', () => {
  withDir(
    {
      'AppIcon.png': pngBytes({ width: 1024, height: 1024 }),
      '01.png': pngBytes({ width: 1290, height: 2796 }),
      '02.png': pngBytes({ width: 1290, height: 2796 }),
    },
    (dir) => {
      const { sink, lines } = capture();
      assert.equal(run([dir], sink), 0);
      assert.match(lines.join('\n'), /No issues found/);
    },
  );
});

test('an icon with alpha exits 1 and names the file', () => {
  withDir(
    {
      'AppIcon.png': pngBytes({ width: 1024, height: 1024, colorType: 6 }),
      '01.png': pngBytes({ width: 1290, height: 2796 }),
    },
    (dir) => {
      const { sink, lines } = capture();
      assert.equal(run([dir], sink), 1);
      const out = lines.join('\n');
      assert.match(out, /DANGER/);
      assert.match(out, /AppIcon\.png/);
      assert.match(out, /transparency/i);
    },
  );
});

test('--strict turns a notice into a non-zero exit', () => {
  withDir({ '01.png': pngBytes({ width: 1234, height: 4321 }) }, (dir) => {
    const { sink } = capture();
    assert.equal(run([dir], sink), 0, 'a notice alone does not block by default');
    assert.equal(run([dir, '--strict'], sink), 1);
  });
});

test('--json emits parseable output carrying every asset', () => {
  withDir(
    { '01.png': pngBytes({ width: 1290, height: 2796 }), '02.png': pngBytes({ width: 1284, height: 2778 }) },
    (dir) => {
      const { sink, lines } = capture();
      run([dir, '--json'], sink);
      const parsed = JSON.parse(lines.join('\n'));
      assert.equal(parsed.store, 'ios');
      assert.equal(parsed.assets.length, 2);
      assert.ok(parsed.findings.some((f) => f.id === 'mixed-dimensions'));
      assert.ok(parsed.specReviewed);
    },
  );
});

test('--store play applies the Play rules instead', () => {
  withDir(
    { 'a.png': pngBytes({ width: 1000, height: 2500 }), 'b.png': pngBytes({ width: 1000, height: 2500 }) },
    (dir) => {
      const { sink, lines } = capture();
      assert.equal(run([dir, '--store', 'play', '--json'], sink), 1);
      const parsed = JSON.parse(lines.join('\n'));
      assert.ok(parsed.findings.some((f) => f.id === 'screenshot-aspect-ratio'));
    },
  );
});

test('individual files can be named instead of a directory', () => {
  withDir({ 'AppIcon.png': pngBytes({ width: 512, height: 512 }) }, (dir) => {
    const { sink } = capture();
    assert.equal(run([join(dir, 'AppIcon.png')], sink), 1);
  });
});

test('a non-image file in the directory is ignored, not reported as broken', () => {
  withDir(
    {
      '01.png': pngBytes({ width: 1290, height: 2796 }),
      '02.png': pngBytes({ width: 1290, height: 2796 }),
      'README.txt': Buffer.from('not an image'),
      '.DS_Store': Buffer.from([0, 1, 2, 3]),
    },
    (dir) => {
      const { sink, lines } = capture();
      assert.equal(run([dir], sink), 0);
      assert.equal(/README\.txt/.test(lines.join('\n')), false);
    },
  );
});

test('a missing path exits 2 rather than reporting a clean run', () => {
  const { sink, lines } = capture();
  assert.equal(run(['/no/such/directory/anywhere'], sink), 2);
  assert.match(lines.join('\n'), /cannot read/);
});

test('no arguments exits 2', () => {
  const { sink, lines } = capture();
  assert.equal(run([], sink), 2);
  assert.match(lines.join('\n'), /at least one/);
});

test('an unknown store exits 2 rather than defaulting', () => {
  const { sink, lines } = capture();
  assert.equal(run(['--store', 'amazon', '.'], sink), 2);
  assert.match(lines.join('\n'), /unknown store/);
});

test('an unknown option exits 2', () => {
  const { sink } = capture();
  assert.equal(run(['--recurse', '.'], sink), 2);
});

test('--help exits 0 and explains itself', () => {
  const { sink, lines } = capture();
  assert.equal(run(['--help'], sink), 0);
  assert.match(lines.join('\n'), /--store/);
});

test('an empty directory exits 2 rather than claiming a clean set', () => {
  // Pointing the CLI at the wrong path is the failure mode that matters here:
  // a green check over zero files is exactly the false assurance a CI gate
  // exists to prevent.
  withDir({}, (dir) => {
    const { sink, lines } = capture();
    assert.equal(run([dir], sink), 2);
    assert.match(lines.join('\n'), /no image files/);
  });
});

test('the text report names its source and the date the tables were reviewed', () => {
  withDir({ '01.png': pngBytes({ width: 1290, height: 2796 }) }, (dir) => {
    const { sink, lines } = capture();
    run([dir], sink);
    const out = lines.join('\n');
    assert.match(out, /Checked against:/);
    assert.match(out, /authoritative/);
    assert.match(out, /not affiliated with Apple or Google/);
  });
});
