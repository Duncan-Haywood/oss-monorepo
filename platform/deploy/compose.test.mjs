import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { composeRepo, withDeployFooter, DONATE_URL, PROVIDERS, renderDeployUrl, blueprintEnv } from './compose.mjs';
import { zip, crc32 } from './zip.mjs';

const templates = {
  'github-pages': { 'deploy.yml': 'name: Deploy\n' },
  aws: { 'deploy.yml': 'a', 'destroy.yml': 'b', 'tofu/main.tf': 'c', 'tofu/encryption.hcl.tmpl': 'd' },
  gcp: { 'deploy.yml': 'a', 'destroy.yml': 'b', 'tofu/main.tf': 'c', 'tofu/encryption.hcl.tmpl': 'd' },
  azure: { 'deploy.yml': 'a', 'destroy.yml': 'b', 'tofu/main.tf': 'c', 'tofu/encryption.hcl.tmpl': 'd' },
  cloudflare: { 'deploy.yml': 'a' },
  _license: 'MIT',
};
const appFiles = {
  'index.html': { text: '<html><body><h1>x</h1></body></html>' },
  'logo.bin': { b64: Buffer.from([1, 2, 3]).toString('base64') },
};

test('footer carries the donate link once and the operator notice', () => {
  const once = withDeployFooter('<body>hi</body>');
  assert.match(once, new RegExp(DONATE_URL));
  assert.match(once, /run by whoever deployed it/);
  assert.equal(withDeployFooter(once), once);
  assert.match(withDeployFooter('no body tag'), /buymeacoffee/);
});

test('the donate URL is exactly the owner-given one', () => {
  assert.equal(DONATE_URL, 'https://buymeacoffee.com/duncanhaywood');
});

test('github-pages repo: app + workflow + readme + license, binary kept binary', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'github-pages', appFiles, templates });
  assert.deepEqual(Object.keys(r).sort(), ['.github/workflows/deploy.yml', 'LICENSE', 'README.md', 'app/index.html', 'app/logo.bin']);
  assert.ok(r['app/logo.bin'] instanceof Uint8Array);
  assert.match(r['app/index.html'], /buymeacoffee/);
  assert.match(r['README.md'], /You are the operator/);
});

test('aws repo carries tofu/ and both workflows', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles, templates });
  assert.ok(r['.github/workflows/deploy.yml'] && r['.github/workflows/destroy.yml']);
  assert.ok(r['tofu/main.tf'] && r['tofu/encryption.hcl.tmpl']);
  assert.match(r['README.md'], /TOFU_STATE_PASSPHRASE/);
});

test('cloudflare repo is private, carries one workflow, and tears down in the dashboard', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'cloudflare', appFiles, templates });
  assert.equal(PROVIDERS.cloudflare.repoPrivate, true);
  assert.deepEqual(PROVIDERS.cloudflare.needs, ['github', 'cloudflare']);
  assert.ok(r['.github/workflows/deploy.yml']);
  assert.match(r['README.md'], /Workers & Pages/);
  assert.match(r['app/index.html'], /buymeacoffee/);
});

test('gcp repo carries tofu/ and both workflows, and says what Destroy removes', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'gcp', appFiles, templates });
  assert.ok(r['.github/workflows/deploy.yml'] && r['.github/workflows/destroy.yml'] && r['tofu/main.tf']);
  assert.match(r['README.md'], /Cloud Storage bucket/);
  assert.doesNotMatch(r['README.md'], /CloudFront/);
  assert.match(r['app/index.html'], /buymeacoffee/);
});

test('refuses path traversal, missing index, unknown provider', () => {
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles: { 'index.html': { text: 'x' }, '../x': { text: 'y' } }, templates }), /unsafe/);
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles: {}, templates }), /index/);
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'heroku', appFiles, templates }), /unknown provider/);
});

test('every provider has a label, a blurb and a privacy flag', () => {
  for (const p of Object.values(PROVIDERS)) assert.ok(p.label && p.blurb && typeof p.repoPrivate === 'boolean');
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip() output is a valid archive (read back with python zipfile)', () => {
  const bytes = zip({ 'a.txt': 'hello', 'dir/b.bin': new Uint8Array([0, 255, 7]), 'ü.txt': 'utf8' });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 't.zip');
  fs.writeFileSync(f, bytes);
  const out = execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(sorted(z.namelist())); print(z.read('a.txt').decode()); print(list(z.read('dir/b.bin')))
`, f]).toString();
  assert.match(out, /'a.txt'/);
  assert.match(out, /hello/);
  assert.match(out, /\[0, 255, 7\]/);
  assert.match(out, /ü\.txt/);
});

test('render repo: venture under ventures/<slug>, blueprint at the root, no static workflow', () => {
  const serverFiles = {
    Dockerfile: { text: 'FROM node:22-alpine\n' },
    'render.yaml': { text: 'services: []\n' },
    'server.mjs': { text: 'x' },
    'index.html': { text: '<body>hi</body>' },
    'logo.bin': { b64: Buffer.from([9]).toString('base64') },
  };
  const r = composeRepo({ slug: 'cancel-flow', title: 'Cancel Flow', provider: 'render', serverFiles, templates });
  assert.deepEqual(Object.keys(r).sort(), ['LICENSE', 'README.md', 'render.yaml', 'ventures/cancel-flow/Dockerfile', 'ventures/cancel-flow/index.html', 'ventures/cancel-flow/logo.bin', 'ventures/cancel-flow/render.yaml', 'ventures/cancel-flow/server.mjs']);
  assert.equal(r['render.yaml'], 'services: []\n');
  assert.match(r['ventures/cancel-flow/index.html'], /buymeacoffee/);
  assert.ok(r['ventures/cancel-flow/logo.bin'] instanceof Uint8Array);
  assert.match(r['README.md'], /You are the operator/);
  assert.ok(r['README.md'].includes(DONATE_URL), 'README links the donate URL');
  assert.ok(!r['README.md'].includes('${'), 'no uninterpolated template text');
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'render', serverFiles: {}, templates }), /server files/);
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'render', serverFiles: { ...serverFiles, '../x': { text: 'y' } }, templates }), /unsafe/);
});

test('renderDeployUrl encodes the repository URL', () => {
  assert.equal(renderDeployUrl('https://github.com/a/b'), 'https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb');
});

test('blueprintEnv reads keys, literal values, generated and secret variables', () => {
  const y = 'services:\n  - name: x\n    envVars:\n      - key: A\n        value: "true"\n      - key: B\n        generateValue: true\n      - key: C\n        sync: false\n    other: 1\n';
  assert.deepEqual(blueprintEnv(y), [{ key: 'A', value: 'true' }, { key: 'B', generate: true }, { key: 'C', secret: true }]);
});

test('docker bundle: compose file, env template, setup script, no secrets, download only', () => {
  const yaml = 'services:\n  - name: x\n    healthCheckPath: /healthz\n    disk:\n      name: s\n      mountPath: /data\n    envVars:\n      - key: DRY_RUN\n        value: "true"\n      - key: ADMIN_KEY\n        generateValue: true\n      - key: STRIPE_SECRET_KEY\n        sync: false\n';
  const serverFiles = { Dockerfile: { text: 'FROM node:22-alpine\nEXPOSE 9000\n' }, 'render.yaml': { text: yaml }, 'server.mjs': { text: 'x' }, 'index.html': { text: '<body>hi</body>' } };
  const r = composeRepo({ slug: 'cancel-flow', title: 'Cancel Flow', provider: 'docker', serverFiles, templates });
  assert.ok(PROVIDERS.docker.downloadOnly && PROVIDERS.docker.needs.length === 0);
  assert.ok(r['app/Dockerfile'] && r['app/server.mjs'] && !r['app/render.yaml']);
  assert.match(r['app/index.html'], /buymeacoffee/);
  assert.match(r['compose.yaml'], /"\$\{HOST_PORT:-9000\}:9000"/);
  assert.match(r['compose.yaml'], /data:\/data/);
  assert.match(r['compose.yaml'], /127\.0\.0\.1:9000\/healthz/);
  assert.match(r['.env.example'], /^DRY_RUN=true$/m);
  assert.match(r['.env.example'], /^# STRIPE_SECRET_KEY=$/m);
  assert.match(r['setup.sh'], /'ADMIN_KEY' "\$\(rand\)"/);
  assert.match(r['setup.sh'], /'# STRIPE_SECRET_KEY='/);
  assert.match(r['README.md'], /You are the operator/);
  assert.ok(r['README.md'].includes(DONATE_URL));
  assert.ok(!r['README.md'].includes('${'));
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'docker', serverFiles: {}, templates }), /server files/);
  const bad = { ...serverFiles, 'render.yaml': { text: yaml.replace('DRY_RUN', 'x;rm') } };
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'docker', serverFiles: bad, templates }), /unsafe env/);
});

test('fly bundle: fly.toml from the blueprint, flyctl steps, no secrets, download only', () => {
  const yaml = 'services:\n  - name: x\n    healthCheckPath: /healthz\n    disk:\n      name: s\n      mountPath: /data\n    envVars:\n      - key: DRY_RUN\n        value: "true"\n      - key: ADMIN_KEY\n        generateValue: true\n      - key: STRIPE_SECRET_KEY\n        sync: false\n';
  const serverFiles = { Dockerfile: { text: 'FROM node:22-alpine\nEXPOSE 9000\n' }, 'render.yaml': { text: yaml }, 'server.mjs': { text: 'x' }, 'index.html': { text: '<body>hi</body>' } };
  const r = composeRepo({ slug: 'cancel-flow', title: 'Cancel Flow', provider: 'fly', serverFiles, templates });
  assert.ok(PROVIDERS.fly.downloadOnly && PROVIDERS.fly.serverOnly && PROVIDERS.fly.needs.length === 0);
  assert.ok(r['app/Dockerfile'] && r['app/server.mjs'] && !r['app/render.yaml']);
  assert.match(r['app/index.html'], /buymeacoffee/);
  assert.match(r['fly.toml'], /internal_port = 9000/);
  assert.match(r['fly.toml'], /path = '\/healthz'/);
  assert.match(r['fly.toml'], /destination = '\/data'/);
  assert.match(r['fly.toml'], /DRY_RUN = 'true'/);
  assert.ok(!/^app\s*=/m.test(r['fly.toml']), 'no hard-coded global app name');
  assert.ok(!r['fly.toml'].includes('STRIPE') && !r['fly.toml'].includes('ADMIN_KEY'), 'secrets stay out of fly.toml');
  assert.match(r['README.md'], /ADMIN_KEY=\$\(openssl rand -hex 24\)/);
  assert.match(r['README.md'], /STRIPE_SECRET_KEY=\.\.\./);
  assert.match(r['README.md'], /fly volumes create data/);
  assert.match(r['README.md'], /You are the operator/);
  assert.ok(r['README.md'].includes(DONATE_URL));
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'fly', serverFiles: {}, templates }), /server files/);
  const bad = { ...serverFiles, 'render.yaml': { text: yaml.replace('DRY_RUN', 'x;rm') } };
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'fly', serverFiles: bad, templates }), /unsafe env/);
});

test('android repo: capacitor project around app/, workflow, no secrets, valid ids', async () => {
  const { androidAppId } = await import('./compose.mjs');
  const real = fs.readFileSync(new URL('./templates/android/deploy.yml', import.meta.url), 'utf8');
  const r = composeRepo({ slug: '3d-print-quote', title: 'Print "Quote" <b>', provider: 'android', appFiles, templates: { ...templates, android: { 'deploy.yml': real } } });
  assert.deepEqual(Object.keys(r).sort(), ['.github/workflows/deploy.yml', '.gitignore', 'LICENSE', 'README.md', 'app/index.html', 'app/logo.bin', 'capacitor.config.json', 'package.json']);
  const cfg = JSON.parse(r['capacitor.config.json']);
  assert.equal(cfg.webDir, 'app');
  assert.equal(cfg.appId, 'io.selfhosted.dprintquote');
  assert.match(cfg.appId, /^([a-z][a-z0-9]*)(\.[a-z][a-z0-9]*)+$/);
  assert.equal(cfg.appName, 'Print Quote b');
  const pkg = JSON.parse(r['package.json']);
  for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, 'pinned, no ranges');
  assert.match(r['app/index.html'], /buymeacoffee/);
  assert.match(r['README.md'], /You are the operator/);
  assert.match(r['README.md'], /Google Play \(your account/);
  assert.equal(androidAppId('123'), 'io.selfhosted.app');
  assert.equal(PROVIDERS.android.downloadOnly, undefined);
  // the signing step must be gated on all four secrets, and secrets must reach the shell only via env
  assert.match(real, /ANDROID_KEYSTORE_B64 != ''/);
  assert.doesNotMatch(real.split('run:').slice(1).join('\n'), /\$\{\{\s*secrets\./, 'no secret interpolated into a shell script');
});
