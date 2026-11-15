// Worker for eval/update-rate-stale-lr-5.mjs. Kept apart from it because round four's module (imported
// there for its cells) posts round four's verdicts from any worker thread that imports it.
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { updateRateChanges } from '../update-rate.mjs';
import { staleTestMarkov } from '../rounded-walk.mjs';

const AT = 150; // eval/update-rate-catchup.mjs
// lr: Infinity so the pipeline only records the statistics; thresholds are applied in `tally`.
const RECORD = { method: 'lr', lr: Infinity, test: staleTestMarkov, trim: 'range' };

/** One series' statistics on the change nearest AT, or null when there is no change. */
export function judge(v) {
  const u = updateRateChanges(v, { catchUp: RECORD });
  if (!u.changes.length) return null;
  const c = u.changes.reduce((a, z) => (Math.abs(z.index - AT) < Math.abs(a.index - AT) ? z : a));
  const oneTick = !!(c.rounding || c.catchUp);
  return { oneTick, lr: oneTick ? (c.staleLR ?? 0) : null, lrIid: oneTick ? (c.staleLRIid ?? c.staleLR ?? 0) : null };
}

if (!isMainThread && Array.isArray(workerData)) parentPort.postMessage(workerData.map(([j, v]) => [j, judge(v)]));
