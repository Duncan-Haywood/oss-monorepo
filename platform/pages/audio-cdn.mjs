// Serve the site's audio from jsDelivr instead of the Pages artifact.
//
// The MP3s (podcast episodes, the two story shelves) were 370 MB of the
// 480 MB artifact on 2026-10-24: copied, checked, uploaded and deployed on
// every merge although they change a few times a week. jsDelivr serves any
// file in a public GitHub repository at a pinned commit, with
// `content-type: audio/mpeg`, byte ranges, open CORS and a one-year immutable
// cache (all checked with curl on 2026-10-24), so the files stay in git as the
// source of truth and the artifact carries only links to them.
//
// Each built `.mp3` is matched to a committed file by its git blob hash, so
// the pass needs no idea of which generator copied it from where. The URL is
// pinned to the last commit that touched the file, not to HEAD: it stays the
// same across deploys, so browsers and podcast apps keep their caches. A file
// with no committed match (new, edited, untracked), one over jsDelivr's 20 MB
// limit for GitHub files, or any file at all when git is missing, stays on
// Pages exactly as before.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CDN_ORIGIN = 'https://cdn.jsdelivr.net/gh/';
export const CDN_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_REPO = 'Duncan-Haywood/oss-monorepo';
// Files whose text can name an audio URL: pages, feeds, data and scripts.
const TEXT_EXTS = new Set(['.html', '.xml', '.json', '.js', '.mjs', '.txt', '.webmanifest']);

/** git's blob id for some bytes, the same hash `git ls-tree` prints. */
export const gitBlobId = (buf) =>
  createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

/**
 * Committed MP3s at HEAD: blob id -> { path, commit }, where `commit` is the
 * last commit that touched the path (a shallow clone's boundary commit when
 * the change is older than the clone, which still holds the file). Null when
 * git cannot answer.
 */
export function committedAudio(repoRoot) {
  const git = (args) => execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  let tree;
  let log;
  try {
    // ls-tree takes no glob pathspec, so the whole tree, filtered below.
    tree = git(['ls-tree', '-r', '-z', 'HEAD']);
    // One walk for every file, newest first; the first commit naming a path
    // is the last one to touch it.
    log = git(['-c', 'core.quotePath=false', 'log', '--format=%x1e%H', '--name-only', '--no-renames', 'HEAD', '--', ':(glob)**/*.mp3']);
  } catch {
    return null;
  }
  const lastTouched = new Map();
  for (const rec of log.split('\x1e')) {
    const [commit, ...paths] = rec.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const p of paths) if (!lastTouched.has(p)) lastTouched.set(p, commit);
  }
  const byBlob = new Map();
  for (const entry of tree.split('\0').filter(Boolean)) {
    // "<mode> blob <sha>\t<path>"
    const tab = entry.indexOf('\t');
    const [, type, blob] = entry.slice(0, tab).split(' ');
    const p = entry.slice(tab + 1);
    if (type !== 'blob' || !p.endsWith('.mp3') || !lastTouched.has(p)) continue;
    if (!byBlob.has(blob)) byBlob.set(blob, { path: p, commit: lastTouched.get(p) });
  }
  return byBlob;
}

export const cdnUrl = (repo, commit, file) =>
  `${CDN_ORIGIN}${repo}@${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Point every reference to a built `.mp3` at its jsDelivr URL and remove the
 * file from `outDir`. References are resolved the way a browser would, from
 * the referring file's own URL, so `audio/x.mp3`, `../podcast/audio/x.mp3` and
 * `${base}writing/podcast/audio/x.mp3` all match.
 */
export async function moveAudioToCdn({ outDir, base, repoRoot, repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO, log = () => {} }) {
  const files = await walk(outDir);
  const audio = files.filter((f) => f.endsWith('.mp3'));
  const result = { moved: 0, kept: 0, bytes: 0 };
  if (!audio.length) return result;
  const committed = committedAudio(repoRoot);
  if (!committed) {
    log('audio: git unavailable, every MP3 stays on Pages');
    result.kept = audio.length;
    return result;
  }

  const siteBase = new URL(base.endsWith('/') ? base : `${base}/`);
  const urlOf = (file) => new URL(path.relative(outDir, file).split(path.sep).join('/'), siteBase).href;
  const target = new Map(); // site URL of an MP3 -> CDN URL
  for (const file of audio) {
    const buf = await fs.readFile(file);
    const hit = buf.length <= CDN_MAX_BYTES ? committed.get(gitBlobId(buf)) : null;
    if (!hit) {
      result.kept += 1;
      continue;
    }
    target.set(urlOf(file), { cdn: cdnUrl(repo, hit.commit, hit.path), file, bytes: buf.length });
  }
  if (!target.size) return result;

  // A quoted, parenthesised or attribute-valued reference ending in .mp3.
  const REF = /(["'(=\s])([^"'()\s<>]*?\.mp3)(?=[?#]?[^"'()\s<>]*["')\s<>])/g;
  const texts = files.filter((f) => TEXT_EXTS.has(path.extname(f)));
  const unreferenced = new Set(target.keys());
  await Promise.all(texts.map(async (file) => {
    const src = await fs.readFile(file, 'utf8');
    if (!src.includes('.mp3')) return;
    const from = urlOf(file);
    let changed = false;
    const out = src.replace(REF, (whole, lead, ref) => {
      let resolved;
      try {
        resolved = new URL(ref.replace(/&amp;/g, '&'), from).href;
      } catch {
        return whole;
      }
      const hit = target.get(resolved);
      if (!hit) return whole;
      changed = true;
      unreferenced.delete(resolved);
      return `${lead}${hit.cdn}`;
    });
    if (changed) await fs.writeFile(file, out);
  }));

  for (const [url, { file, bytes }] of target) {
    // An MP3 nothing links is still a published URL (a feed reader may hold
    // it), so it stays rather than silently 404ing.
    if (unreferenced.has(url)) {
      result.kept += 1;
      continue;
    }
    await fs.rm(file);
    result.moved += 1;
    result.bytes += bytes;
  }
  log(`audio: ${result.moved} MP3s (${(result.bytes / 1e6).toFixed(0)} MB) served from jsDelivr, ${result.kept} kept on Pages`);
  return result;
}
