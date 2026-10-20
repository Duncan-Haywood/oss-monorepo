// A JSON-file store for one guard process, so budget counters survive a
// restart. Writes go to a temp file and are renamed into place, so a crash
// mid-write leaves the previous state, not half a file. Not for several
// processes sharing one file: run one proxy per budget, or add a shared store.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { memoryStore } from './guard.mjs';

export function fileStore(path, { flushMs = 250 } = {}) {
  let initial = {};
  if (existsSync(path)) {
    try {
      initial = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      // Starting from zero would quietly hand every budget back in full.
      throw new Error(`state file ${path} is not valid JSON (${e.message}); fix or move it before starting`);
    }
  }
  const mem = memoryStore(initial);
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(mem.entries())));
    renameSync(tmp, path);
  };
  const schedule = () => {
    if (flushMs <= 0) return flush();
    if (!timer) {
      timer = setTimeout(flush, flushMs);
      timer.unref?.();
    }
  };
  return {
    get: mem.get,
    entries: mem.entries,
    set(k, v) { mem.set(k, v); schedule(); },
    delete(k) { mem.delete(k); schedule(); },
    flush() { if (timer) clearTimeout(timer); flush(); },
  };
}
