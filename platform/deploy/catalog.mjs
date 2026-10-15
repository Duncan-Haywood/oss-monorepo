// Which apps can be self-deployed, and their files. The list is derived from
// discoverSurfaces() in platform/pages/build.mjs, the canonical build; there
// is no second list here to drift.

import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, discoverSurfaces, isPublishable, listFiles } from '../pages/build.mjs';

export const MAX_FILES = 60;
export const MAX_BYTES = 3 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.cache', 'tests', 'test', '__pycache__']);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.csv', '.webmanifest', '.md']);

// Root-absolute references (src="/x") break when the app is served from its
// own origin only if it assumed a sub-path; relative ones always work. We
// reject absolute ones rather than guess.
const ROOT_ABSOLUTE = /\b(?:src|href)\s*=\s*["']\/(?!\/)/i;

export const titleOf = (html, slug) =>
  (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? slug).replace(/\s+/g, ' ').trim();

export const descriptionOf = (html) =>
  (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? '').trim();

/** Files of one surface as { 'rel/path': {text}|{b64} }, or { skip: reason }. */
export async function readApp(sourceDir) {
  const all = (await listFiles(sourceDir)).filter((f) => {
    const rel = path.relative(sourceDir, f);
    return !rel.split(path.sep).some((s) => SKIP_DIRS.has(s)) && isPublishable(path.basename(f));
  });
  if (all.length > MAX_FILES) return { skip: `${all.length} files (limit ${MAX_FILES})` };
  const files = {};
  let bytes = 0;
  for (const f of all) {
    const buf = await fs.readFile(f);
    bytes += buf.length;
    const rel = path.relative(sourceDir, f).split(path.sep).join('/');
    files[rel] = TEXT_EXT.has(path.extname(f).toLowerCase()) ? { text: buf.toString('utf8') } : { b64: buf.toString('base64') };
  }
  if (bytes > MAX_BYTES) return { skip: `${bytes} bytes (limit ${MAX_BYTES})` };
  const index = files['index.html']?.text;
  if (index === undefined) return { skip: 'no index.html' };
  if (ROOT_ABSOLUTE.test(index)) return { skip: 'root-absolute asset paths' };
  return { files };
}

export const SERVER_MAX_FILES = 200;
const TEST_FILE = /\.test\.m?js$/;

/**
 * Files of a server venture (one with a Dockerfile and a render.yaml) as
 * { 'rel/path': {text}|{b64} }, or { skip: reason }. Unlike readApp this keeps
 * every non-test source file, because the Dockerfile decides what it needs.
 */
export async function readServer(sourceDir) {
  const names = await fs.readdir(sourceDir).catch(() => []);
  if (!names.includes('Dockerfile') || !names.includes('render.yaml')) return { skip: 'no Dockerfile + render.yaml' };
  const all = [];
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && !TEST_FILE.test(e.name)) all.push(full);
    }
  };
  await walk(sourceDir);
  if (all.length > SERVER_MAX_FILES) return { skip: `${all.length} files (limit ${SERVER_MAX_FILES})` };
  const files = {};
  let bytes = 0;
  for (const f of all) {
    const buf = await fs.readFile(f);
    bytes += buf.length;
    const rel = path.relative(sourceDir, f).split(path.sep).join('/');
    files[rel] = TEXT_EXT.has(path.extname(f).toLowerCase()) || ['Dockerfile', 'render.yaml'].includes(rel) || /\.(ya?ml|toml|py|ts|txt)$/.test(rel)
      ? { text: buf.toString('utf8') } : { b64: buf.toString('base64') };
  }
  if (bytes > MAX_BYTES) return { skip: `${bytes} bytes (limit ${MAX_BYTES})` };
  return { files };
}

/** [{ slug, title, description, files }] for every deployable surface. */
export async function deployableApps(venturesDir = path.join(REPO_ROOT, 'ventures')) {
  const apps = [];
  const skipped = [];
  for (const { slug, sourceDir } of await discoverSurfaces(venturesDir)) {
    const r = await readApp(sourceDir);
    if (r.skip) { skipped.push({ slug, reason: r.skip }); continue; }
    const html = r.files['index.html'].text;
    const srv = await readServer(sourceDir);
    apps.push({ slug, title: titleOf(html, slug), description: descriptionOf(html), files: r.files, ...(srv.files ? { serverFiles: srv.files } : {}) });
  }
  return { apps, skipped };
}
