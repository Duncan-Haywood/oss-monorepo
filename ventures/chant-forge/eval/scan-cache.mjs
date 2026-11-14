// The archive.org page cache the scan evals share (scan-check, shape-check,
// rhombus-check, deskew-check, thick-line-check).
//
// Each eval used to fetch its pages one at a time inside its main loop, so a
// cold cache meant one curl per page in series: about 1.5 s a page here on
// 2026-11-14 and up to half an hour for shape-check on a slow day (run record
// 2026-11-14, doc_friction on shape-check.mjs). `prefetch` downloads and
// converts every missing page with a few requests in flight before the loop
// starts; `page` then only reads the cache, so what each eval computes is
// unchanged. A download goes to a `.part` file and is renamed when complete,
// so an interrupted run no longer leaves a truncated JPEG that every later run
// would trust.
//
//   import { scanCache } from './scan-cache.mjs';
//   const { page, prefetch } = scanCache(cacheDir);
//   await prefetch(pieces.flatMap((p) => p.pages.map((pg) => [p.archive, pg.leaf])));
//   const img = page(item, leaf);   // { width, height, data } from readPgm
import { readFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { readPgm } from '../scan.mjs';

export const pageUrl = (item, leaf, width = 2000) => `https://archive.org/download/${item}/page/n${leaf}_w${width}.jpg`;

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(' ')}: exit ${code} ${err.trim()}`))));
  });
}

// Run `jobs` (functions returning promises) with at most `limit` in flight.
export async function pool(jobs, limit) {
  let next = 0;
  const worker = async () => { while (next < jobs.length) await jobs[next++](); };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

export function scanCache(dir, { width = 2000 } = {}) {
  mkdirSync(dir, { recursive: true });
  const paths = (item, leaf) => {
    const jpg = join(dir, `${item}-n${leaf}-w${width}.jpg`);
    return { jpg, pgm: jpg.replace(/\.jpg$/, '.pgm') };
  };
  const curlArgs = (item, leaf, out) => ['-sSfL', '-m', '120', '--retry', '2', '-o', out, pageUrl(item, leaf, width)];
  const ffmpegArgs = (jpg, pgm) => ['-loglevel', 'error', '-y', '-i', jpg, '-pix_fmt', 'gray', pgm];

  // Synchronous fallback, for a page prefetch was not given.
  function page(item, leaf) {
    const { jpg, pgm } = paths(item, leaf);
    if (!existsSync(pgm) && !existsSync(jpg)) {
      execFileSync('curl', curlArgs(item, leaf, `${jpg}.part`));
      renameSync(`${jpg}.part`, jpg);
    }
    if (!existsSync(pgm)) {
      execFileSync('ffmpeg', ffmpegArgs(jpg, `${pgm}.part.pgm`));
      renameSync(`${pgm}.part.pgm`, pgm);
    }
    return readPgm(readFileSync(pgm));
  }

  // Fetch and convert every [item, leaf] not yet cached, `concurrency` at a time.
  // Returns how many pages it had to fetch. A failure is thrown after the others finish.
  async function prefetch(list, { concurrency = Number(process.env.SCAN_FETCH_CONCURRENCY) || 6, log = console.error } = {}) {
    const seen = new Set();
    const todo = [];
    for (const [item, leaf] of list) {
      const key = `${item}:${leaf}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!existsSync(paths(item, leaf).pgm)) todo.push([item, leaf]);
    }
    if (!todo.length) return 0;
    const t0 = Date.now();
    const errors = [];
    await pool(todo.map(([item, leaf]) => async () => {
      const { jpg, pgm } = paths(item, leaf);
      try {
        if (!existsSync(jpg)) {
          await run('curl', curlArgs(item, leaf, `${jpg}.part`));
          renameSync(`${jpg}.part`, jpg);
        }
        await run('ffmpeg', ffmpegArgs(jpg, `${pgm}.part.pgm`));
        renameSync(`${pgm}.part.pgm`, pgm);
      } catch (e) {
        rmSync(`${jpg}.part`, { force: true });
        rmSync(`${pgm}.part.pgm`, { force: true });
        errors.push(e);
      }
    }), concurrency);
    if (log) log(`scan-cache: fetched ${todo.length - errors.length} of ${todo.length} missing pages in ${((Date.now() - t0) / 1000).toFixed(1)} s (${concurrency} at a time, cache ${dir})`);
    if (errors.length) throw new Error(`scan-cache: ${errors.length} page(s) failed; first: ${errors[0].message}`);
    return todo.length;
  }

  return { page, prefetch, paths };
}
