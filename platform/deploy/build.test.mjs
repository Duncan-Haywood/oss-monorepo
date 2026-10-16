import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readApp, titleOf, descriptionOf, MAX_FILES } from './catalog.mjs';
import { build, loadTemplates } from './build.mjs';
import { composeRepo } from './compose.mjs';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'deploy-'));

test('titleOf / descriptionOf read the page head', () => {
  const html = '<title> A  B </title><meta name="description" content="does a thing">';
  assert.equal(titleOf(html, 's'), 'A B');
  assert.equal(descriptionOf(html), 'does a thing');
  assert.equal(titleOf('<p>', 'slug'), 'slug');
});

test('readApp skips root-absolute assets, oversize trees and no-index dirs', async () => {
  const d = await tmp();
  await fs.writeFile(path.join(d, 'index.html'), '<script src="/x.js"></script>');
  assert.match((await readApp(d)).skip, /root-absolute/);
  await fs.writeFile(path.join(d, 'index.html'), '<script src="x.js"></script>');
  assert.ok((await readApp(d)).files['index.html']);
  for (let i = 0; i <= MAX_FILES; i++) await fs.writeFile(path.join(d, `f${i}.css`), 'a{}');
  assert.match((await readApp(d)).skip, /files/);
  const e = await tmp();
  await fs.writeFile(path.join(e, 'a.css'), 'a{}');
  assert.match((await readApp(e)).skip, /index/);
});

test('readApp leaves test files and tests/ out of the published copy', async () => {
  const d = await tmp();
  await fs.writeFile(path.join(d, 'index.html'), '<p>x</p>');
  await fs.writeFile(path.join(d, 'calc.test.mjs'), 'x');
  await fs.mkdir(path.join(d, 'tests'));
  await fs.writeFile(path.join(d, 'tests', 'a.mjs'), 'x');
  assert.deepEqual(Object.keys((await readApp(d)).files), ['index.html']);
});

test('a real build writes the page, a catalogue and one json per app', async () => {
  const out = await tmp();
  const r = await build(out);
  assert.ok(r.apps > 100, `expected many deployable apps, got ${r.apps}`);
  const catalog = JSON.parse(await fs.readFile(path.join(out, 'catalog.json'), 'utf8'));
  assert.equal(catalog.length, r.apps);
  const files = await fs.readdir(path.join(out, 'apps'));
  assert.equal(files.length, r.apps);
  for (const f of ['index.html', 'app.mjs', 'compose.mjs', 'sealedbox.mjs', 'zip.mjs', 'templates.json', 'vendor/nacl-fast.mjs', 'vendor/blake2b.mjs']) {
    await fs.stat(path.join(out, f));
  }
}, { timeout: 120000 });

test('every built app composes into a repo for every provider', async () => {
  const out = await tmp();
  await build(out);
  const templates = JSON.parse(await fs.readFile(path.join(out, 'templates.json'), 'utf8'));
  const catalog = JSON.parse(await fs.readFile(path.join(out, 'catalog.json'), 'utf8'));
  for (const { slug, title } of catalog.slice(0, 40)) {
    const appFiles = JSON.parse(await fs.readFile(path.join(out, 'apps', `${slug}.json`), 'utf8'));
    for (const provider of ['github-pages', 'aws', 'gcp', 'azure', 'cloudflare']) {
      const repo = composeRepo({ slug, title, provider, appFiles, templates });
      assert.match(repo['app/index.html'], /buymeacoffee\.com\/duncanhaywood/, slug);
    }
  }
}, { timeout: 120000 });

test('the OpenTofu module pins its versions and encrypts state', async () => {
  const t = await loadTemplates();
  assert.match(t.aws['tofu/versions.tf'], /required_version = "= 1\.8\.5"/);
  assert.match(t.aws['tofu/versions.tf'], /version = "= \d+\.\d+\.\d+"/);
  assert.match(t.aws['tofu/encryption.hcl.tmpl'], /enforced = true/);
  assert.match(t.aws['deploy.yml'], /tofu_version: 1\.8\.5/);
  assert.match(t.aws['destroy.yml'], /tofu destroy/);
  assert.doesNotMatch(JSON.stringify(t), /AKIA[0-9A-Z]{16}/);
});

test('the gcp module pins versions, encrypts state and holds no key', async () => {
  const t = await loadTemplates();
  assert.match(t.gcp['tofu/versions.tf'], /required_version = "= 1\.8\.5"/);
  assert.match(t.gcp['tofu/versions.tf'], /version = "= \d+\.\d+\.\d+"/);
  assert.match(t.gcp['tofu/encryption.hcl.tmpl'], /enforced = true/);
  assert.match(t.gcp['deploy.yml'], /tofu_version: 1\.8\.5/);
  assert.match(t.gcp['destroy.yml'], /tofu destroy/);
  assert.doesNotMatch(JSON.stringify(t.gcp), /BEGIN (RSA )?PRIVATE KEY/);
});

test('the azure module pins versions, encrypts state and holds no secret', async () => {
  const t = await loadTemplates();
  assert.match(t.azure['tofu/versions.tf'], /required_version = "= 1\.8\.5"/);
  assert.match(t.azure['tofu/versions.tf'], /azurerm[\s\S]*version = "= \d+\.\d+\.\d+"/);
  assert.match(t.azure['tofu/encryption.hcl.tmpl'], /enforced = true/);
  assert.match(t.azure['deploy.yml'], /tofu_version: 1\.8\.5/);
  assert.match(t.azure['destroy.yml'], /tofu destroy/);
  assert.match(t.azure['deploy.yml'], /secrets\.ARM_CLIENT_SECRET/);
  assert.doesNotMatch(JSON.stringify(t.azure), /GOOGLE_|GCP_/);
});

test('the cloudflare workflow pins wrangler and reads only its two secrets', async () => {
  const t = await loadTemplates();
  const y = t.cloudflare['deploy.yml'];
  assert.match(y, /wrangler@\d+\.\d+\.\d+ pages deploy app/);
  assert.match(y, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(y, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(y, /secrets\.(?!CLOUDFLARE_)\w+/);
});

test('the workflows never echo a secret and hold no credentials of our own', async () => {
  const t = await loadTemplates();
  for (const p of ['aws', 'gcp', 'azure', 'cloudflare', 'github-pages']) {
    for (const [name, body] of Object.entries(t[p])) {
      if (!name.endsWith('.yml')) continue;
      assert.doesNotMatch(body, /echo[^\n]*secrets\./, `${p}/${name}`);
    }
  }
});

test('server ventures get servers/<slug>.json whose blueprint matches the repo layout', async () => {
  const out = await tmp();
  await build(out);
  const catalog = JSON.parse(await fs.readFile(path.join(out, 'catalog.json'), 'utf8'));
  const servers = catalog.filter((a) => a.server).map((a) => a.slug).sort();
  assert.ok(servers.includes('cancel-flow') && servers.includes('dunning-engine'), servers.join());
  assert.deepEqual((await fs.readdir(path.join(out, 'servers'))).map((f) => f.replace('.json', '')).sort(), servers);
  const templates = await loadTemplates();
  for (const slug of servers) {
    const serverFiles = JSON.parse(await fs.readFile(path.join(out, 'servers', `${slug}.json`), 'utf8'));
    const repo = composeRepo({ slug, title: slug, provider: 'render', serverFiles, templates });
    assert.match(repo['render.yaml'], new RegExp(`ventures/${slug}`), `${slug}: render.yaml must point at its own directory`);
    assert.ok(repo[`ventures/${slug}/Dockerfile`] && repo[`ventures/${slug}/server.mjs`], slug);
    assert.ok(!Object.keys(repo).some((k) => /\.test\.m?js$/.test(k)), `${slug}: no test files`);
    const bundle = composeRepo({ slug, title: slug, provider: 'docker', serverFiles, templates });
    assert.ok(bundle['compose.yaml'] && bundle['setup.sh'] && bundle['.env.example'], `${slug}: docker bundle`);
    assert.ok(bundle['app/Dockerfile'] && bundle['app/server.mjs'], `${slug}: docker bundle has the app`);
    const fly = composeRepo({ slug, title: slug, provider: 'fly', serverFiles, templates });
    assert.ok(fly['fly.toml'] && fly['app/Dockerfile'] && fly['app/server.mjs'], `${slug}: fly bundle`);
    // every file the Dockerfile COPYs by name must be in the repo
    const copy = serverFiles.Dockerfile.text.match(/^COPY\s+(.+?)\s+\.\/\s*$/m)?.[1].split(/\s+/) ?? [];
    for (const f of copy.filter((x) => !x.includes('*'))) assert.ok(repo[`ventures/${slug}/${f}`], `${slug}: Dockerfile copies ${f}`);
  }
});
