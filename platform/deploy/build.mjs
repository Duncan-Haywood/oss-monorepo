// node platform/deploy/build.mjs --out=dist/deploy
// Writes the static deploy page: index.html + its ES modules, catalog.json,
// templates.json, and one apps/<slug>.json per deployable app.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../pages/build.mjs';
import { deployableApps } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILES = ['index.html', 'app.mjs', 'compose.mjs', 'sealedbox.mjs', 'zip.mjs'];
const VENDOR = ['nacl-fast.mjs', 'blake2b.mjs', 'TWEETNACL-LICENSE', 'BLAKEJS-LICENSE'];

async function readTree(dir, prefix = '') {
  const out = {};
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    // `tofu init` (CI runs it before the tests) leaves .terraform/ and a lock file here.
    if (e.name === '.terraform' || e.name === '.terraform.lock.hcl') continue;
    const rel = prefix + e.name;
    if (e.isDirectory()) Object.assign(out, await readTree(path.join(dir, e.name), `${rel}/`));
    else out[rel] = await fs.readFile(path.join(dir, e.name), 'utf8');
  }
  return out;
}

export async function loadTemplates() {
  const t = {};
  for (const p of ['github-pages', 'aws', 'android']) t[p] = await readTree(path.join(HERE, 'templates', p));
  t._license = await fs.readFile(path.join(REPO_ROOT, 'LICENSE'), 'utf8');
  return t;
}

export async function build(out) {
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
  await fs.mkdir(path.join(out, 'apps'), { recursive: true });
  for (const f of PAGE_FILES) await fs.copyFile(path.join(HERE, f), path.join(out, f));
  for (const f of VENDOR) await fs.copyFile(path.join(HERE, 'vendor', f), path.join(out, 'vendor', f));
  await fs.writeFile(path.join(out, 'templates.json'), JSON.stringify(await loadTemplates()));

  const { apps, skipped } = await deployableApps();
  await fs.mkdir(path.join(out, 'servers'), { recursive: true });
  for (const a of apps) {
    await fs.writeFile(path.join(out, 'apps', `${a.slug}.json`), JSON.stringify(a.files));
    if (a.serverFiles) await fs.writeFile(path.join(out, 'servers', `${a.slug}.json`), JSON.stringify(a.serverFiles));
  }
  await fs.writeFile(
    path.join(out, 'catalog.json'),
    JSON.stringify(apps.map(({ slug, title, description, serverFiles }) => ({ slug, title, description, ...(serverFiles ? { server: true } : {}) }))),
  );
  return { apps: apps.length, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'dist/deploy');
  const r = await build(out);
  console.log(`deploy page: ${r.apps} deployable apps, ${r.skipped.length} skipped -> ${out}`);
  if (process.argv.includes('--why')) for (const s of r.skipped) console.log(`  skip ${s.slug}: ${s.reason}`);
}
