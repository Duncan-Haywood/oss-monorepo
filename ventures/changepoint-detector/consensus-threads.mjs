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
  const runs = new Array(panel.length);
  const todo = SLOWEST_FIRST.filter((i) => i < panel.length && !skip.includes(i));
  const k = Math.min(todo.length, threads ?? availableParallelism());
  const local = () => { for (const i of todo) if (!runs[i]) runs[i] = runSetting(base, panel[i]); return runs; };
  if (!todo.length) return runs;
  if (panel !== PANEL || k < 2) return local(); // a custom panel cannot be named to a thread
  let Worker;
  try { ({ Worker } = await import('node:worker_threads')); } catch { return local(); }
  const workers = [];
  try {
    for (let w = 0; w < k; w++) workers.push(new Worker(new URL('./consensus-thread.mjs', import.meta.url)));
  } catch {
    for (const w of workers) w.terminate();
    return local();
  }
  const queue = [...todo];
  try {
    await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
      const next = () => {
        const setting = queue.shift();
        if (setting === undefined) { resolve(); return; }
        w.postMessage({ id: setting, base, setting });
      };
      w.on('message', (m) => { runs[m.setting] = m.run; next(); });
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
