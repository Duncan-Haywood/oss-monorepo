// Builds platform/deploy/dist: the static one-click deploy page plus catalog.json.
// The app list comes from discoverSurfaces() in platform/pages/build.mjs, never a
// second list (PRODUCT_PLAYBOOK.md §2).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSurfaces, REPO_ROOT } from '../pages/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function titleOf(html, fallback) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m ? m[1].replace(/\s+/g, ' ').trim() : '';
  return t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"') || fallback;
}

export async function buildCatalog(venturesDir = path.join(REPO_ROOT, 'ventures')) {
  const surfaces = await discoverSurfaces(venturesDir);
  const apps = [];
  for (const s of surfaces) {
    const html = await fs.readFile(s.entryFile, 'utf8');
    apps.push({
      slug: s.slug,
      title: titleOf(html, s.slug),
      dir: path.relative(REPO_ROOT, s.sourceDir).split(path.sep).join('/'),
    });
  }
  return apps;
}

export async function build(outDir = path.join(HERE, 'dist')) {
  await fs.mkdir(outDir, { recursive: true });
  const apps = await buildCatalog();
  await fs.writeFile(path.join(outDir, 'catalog.json'), JSON.stringify(apps));
  await fs.copyFile(path.join(HERE, 'core.mjs'), path.join(outDir, 'core.mjs'));
  await fs.copyFile(path.join(HERE, 'index.html'), path.join(outDir, 'index.html'));
  return apps.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().then((n) => console.log(`deploy page built: ${n} apps -> platform/deploy/dist`));
}
