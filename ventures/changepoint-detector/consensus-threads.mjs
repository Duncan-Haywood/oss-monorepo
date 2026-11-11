// The agreed-changes panel on Node worker threads (CLI). The six settings are
// independent analyses of one series, so they run side by side, one per thread,
// up to the number of cores, slowest first; mergeConsensus groups the results
// exactly as consensus() does on one thread (pinned in consensus-threads.test.mjs).
// If threads cannot start, the settings run here, one after another.
import { availableParallelism } from 'node:os';
import { PANEL, runSetting } from './consensus.mjs';

// Slowest settings first, so the longest job never starts last (measured on tree-ring,
// 7,980 points, 2026-11-11: AR(1) widened 5.1 s, AR(1) joint 4.9 s, level 3.9 s,
// noise floor 3.4 s, trend 0.9 s, trend with floor 0.6 s).
export const SLOWEST_FIRST = [1, 2, 0, 3, 4, 5];

// base: the options the panel shares. skip: panel indices the caller fills in itself (the
// CLI's own level-model run stands in for setting 0 when its options match). threads: how
// many at most (default: the number of cores). Resolves to runSetting() results in panel
// order, with the skipped slots left empty.
export async function runPanelThreaded(base, { threads = null, skip = [], panel = PANEL } = {}) {
  const todo = SLOWEST_FIRST.filter((i) => i < panel.length && !skip.includes(i));
  const runs = new Array(panel.length);
  if (panel !== PANEL) { for (const i of todo) runs[i] = runSetting(base, panel[i]); return runs; } // a custom panel cannot be named to a thread
  const done = await runJobsThreaded(todo.map((setting) => ({ base, setting })), { threads });
  todo.forEach((setting, k) => { runs[setting] = done[k]; });
  return runs;
}

// The several-column panel (cli.mjs --columns): six settings on each column, every one an
// independent job, handed to the same pool slowest setting first across all columns, so
// d columns take about 6d / cores settings' time rather than 6d. Resolves to one array of
// runSetting() results per column, in panel order, for columnConsensus({ runs }).
// base: options every setting shares (the CLI passes none; columnConsensus's default).
export async function runColumnPanelsThreaded(cols, { threads = null, base = {} } = {}) {
  const jobs = [];
  for (const setting of SLOWEST_FIRST) cols.forEach((values, column) => jobs.push({ base: { ...base, values }, setting, column }));
  const done = await runJobsThreaded(jobs, { threads });
  const runs = cols.map(() => new Array(PANEL.length));
  jobs.forEach((j, k) => { runs[j.column][j.setting] = done[k]; });
  return runs;
}

// jobs: [{ base, setting }] (setting: a PANEL index). Runs them on up to `threads` worker
// threads, taking the next job as each finishes, and resolves to runSetting() results in job
// order. If threads cannot start, or one dies, whatever is missing runs here, one after
// another, so the answer never depends on the threads.
export async function runJobsThreaded(jobs, { threads = null } = {}) {
  const runs = new Array(jobs.length);
  const local = () => { jobs.forEach((j, k) => { if (!runs[k]) runs[k] = runSetting(j.base, PANEL[j.setting]); }); return runs; };
  if (!jobs.length) return runs;
  const k = Math.min(jobs.length, threads ?? availableParallelism());
  if (k < 2) return local();
  let Worker;
  try { ({ Worker } = await import('node:worker_threads')); } catch { return local(); }
  const workers = [];
  try {
    for (let w = 0; w < k; w++) workers.push(new Worker(new URL('./consensus-thread.mjs', import.meta.url)));
  } catch {
    for (const w of workers) w.terminate();
    return local();
  }
  let nextJob = 0;
  try {
    await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
      const next = () => {
        if (nextJob >= jobs.length) { resolve(); return; }
        const id = nextJob++;
        w.postMessage({ id, base: jobs[id].base, setting: jobs[id].setting });
      };
      w.on('message', (m) => { runs[m.id] = m.run; next(); });
      w.on('error', reject);
      w.on('exit', (code) => { if (code !== 0) reject(new Error(`panel thread exited with code ${code}`)); });
      next();
    })));
  } catch {
    // A thread died (out of memory, a crash): finish whatever is missing here.
    return local();
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return runs;
}
