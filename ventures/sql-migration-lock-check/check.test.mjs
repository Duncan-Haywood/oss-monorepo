import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, renderText, main } from './check.mjs';
import { analyzeSources } from './engine.mjs';

/** Collect what the CLI printed instead of writing to the real console. */
function capture() {
  const out = [];
  const err = [];
  return { io: { log: (s) => out.push(String(s)), error: (s) => err.push(String(s)) }, out, err };
}

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sqlmig-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const RISKY = 'CREATE INDEX idx_users_email ON users (email);\n';
const CLEAN = "SET lock_timeout = '3s';\nSELECT 1;\n";

test('parseArgs defaults to the current directory and text format', () => {
  const opts = parseArgs([]);
  assert.deepEqual(opts.paths, ['.']);
  assert.equal(opts.format, 'text');
  assert.equal(opts.failOnRisk, false);
});

test('parseArgs accepts both --format spellings', () => {
  assert.equal(parseArgs(['--format', 'json']).format, 'json');
  assert.equal(parseArgs(['--format=json']).format, 'json');
});

test('parseArgs rejects an unknown format rather than guessing', () => {
  assert.throws(() => parseArgs(['--format', 'yaml']), /--format expects/);
  assert.throws(() => parseArgs(['--format']), /--format expects/);
});

test('parseArgs rejects an unknown option', () => {
  assert.throws(() => parseArgs(['--recursive']), /unknown option/);
});

test('parseArgs collects several paths', () => {
  assert.deepEqual(parseArgs(['a.sql', 'b.sql']).paths, ['a.sql', 'b.sql']);
});

test('--help prints usage and exits 0', async () => {
  const { io, out } = capture();
  assert.equal(await main(['--help'], io), 0);
  assert.match(out.join('\n'), /sql-migration-lock-check/);
  assert.match(out.join('\n'), /--fail-on-risk/);
});

test('--list-checks prints every check with its severity', async () => {
  const { io, out } = capture();
  assert.equal(await main(['--list-checks'], io), 0);
  const text = out.join('\n');
  assert.match(text, /no-lock-timeout/);
  assert.match(text, /create-index-not-concurrent/);
  assert.match(text, /validate-in-same-transaction/);
});

test('a bad argument exits 1 and says so on stderr', async () => {
  const { io, err } = capture();
  assert.equal(await main(['--nope'], io), 1);
  assert.match(err.join('\n'), /unknown option/);
});

test('an unreadable path exits 1 rather than reporting a clean tree', async () => {
  const { io, err } = capture();
  assert.equal(await main([path.join(tmpdir(), 'definitely-not-here-4f2a')], io), 1);
  assert.match(err.join('\n'), /cannot read/);
});

test('a directory with no .sql files says so and exits 0', async () => {
  await withTempDir(async (dir) => {
    const { io, out } = capture();
    assert.equal(await main([dir], io), 0);
    assert.match(out.join('\n'), /No \.sql files found/);
  });
});

test('a risky migration is reported and --fail-on-risk exits 2', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '001_index.sql'), RISKY);
    const plain = capture();
    assert.equal(await main([dir], plain.io), 0, 'without the flag, findings do not fail the run');
    assert.match(plain.out.join('\n'), /can block the table/);
    assert.match(plain.out.join('\n'), /create index/i);

    const gated = capture();
    assert.equal(await main([dir, '--fail-on-risk'], gated.io), 2);
  });
});

test('a clean migration exits 0 under --fail-on-risk and says what a clean result is not', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '001_ok.sql'), CLEAN);
    const { io, out } = capture();
    assert.equal(await main([dir, '--fail-on-risk'], io), 0);
    const text = out.join('\n');
    assert.match(text, /not a\s+guarantee/i, 'a clean run must not read as approval');
  });
});

test('--format json emits parseable output carrying the findings', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '001_index.sql'), RISKY);
    const { io, out } = capture();
    assert.equal(await main([dir, '--format', 'json'], io), 0);
    const parsed = JSON.parse(out.join('\n'));
    assert.equal(parsed.filesChecked, 1);
    assert.equal(parsed.verdict, 'can-block');
    assert.ok(parsed.findings.some((f) => f.id === 'create-index-not-concurrent'));
    assert.ok(parsed.findings.every((f) => typeof f.file === 'string'));
  });
});

test('a named file is read directly, not treated as a directory', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'one.sql');
    await writeFile(file, RISKY);
    const { io, out } = capture();
    assert.equal(await main([file], io), 0);
    assert.match(out.join('\n'), /create index/i);
  });
});

test('nested directories are scanned and node_modules is skipped', async () => {
  await withTempDir(async (dir) => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(dir, 'migrate'), { recursive: true });
    await mkdir(path.join(dir, 'node_modules'), { recursive: true });
    await writeFile(path.join(dir, 'migrate', '001.sql'), RISKY);
    await writeFile(path.join(dir, 'node_modules', 'vendor.sql'), RISKY);
    const { io, out } = capture();
    await main([dir, '--format', 'json'], io);
    const parsed = JSON.parse(out.join('\n'));
    assert.equal(parsed.filesChecked, 1, 'node_modules must not be scanned');
  });
});

test('several files are reported in filename order, which is apply order', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '002_second.sql'), 'TRUNCATE b;\n');
    await writeFile(path.join(dir, '001_first.sql'), RISKY);
    const { io, out } = capture();
    await main([dir, '--format', 'json'], io);
    const parsed = JSON.parse(out.join('\n'));
    assert.deepEqual(parsed.files.map((f) => path.basename(f.name)), ['001_first.sql', '002_second.sql']);
  });
});

test('renderText quotes the statement, the reason and the fix for each finding', () => {
  const result = analyzeSources([{ name: 'm.sql', text: RISKY }]);
  const text = renderText(result);
  assert.match(text, /line 1:/);
  assert.match(text, /sql:/);
  assert.match(text, /why:/);
  assert.match(text, /fix:/);
  assert.match(text, /CONCURRENTLY/);
});

test('renderText wraps prose so a CI log stays readable', () => {
  const result = analyzeSources([{ name: 'm.sql', text: RISKY }]);
  for (const line of renderText(result).split('\n')) {
    assert.ok(line.length <= 100, `line too long for a CI log: ${line.length}`);
  }
});

test('the report names the file when several were read', () => {
  const result = analyzeSources([
    { name: 'db/001.sql', text: RISKY },
    { name: 'db/002.sql', text: 'TRUNCATE x;' },
  ]);
  const text = renderText(result);
  assert.match(text, /db\/001\.sql/);
  assert.match(text, /db\/002\.sql/);
  assert.match(text, /Read 2 file\(s\)/);
});
