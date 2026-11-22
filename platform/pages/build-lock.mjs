// One `node build.mjs` per output directory at a time.
//
// buildSite() starts with `rm -rf outDir` and writes ~10,000 pages back over
// several minutes. Two builds into the same directory delete each other's
// files: on 2026-11-15 a polish run's second build died on ENOTEMPTY (rmdir)
// while the first, detached by a trailing `&`, was still writing, and another
// run probed dist/ during a second build and read a page with its tab stops
// missing (doc friction, prompts/polish/prompt-0.md). The lock is a sibling
// file, `<outDir>.building`, holding the builder's pid, so it survives the rm
// and a probe can tell a finished dist/ from one still being written. A lock
// whose pid is gone (a killed build) is taken over, not obeyed.
//
// A caller that would rather queue than fail (run_workflow_locally.py, whose
// --for-changes build used to die on exit 75 while another session's local
// build held dist/: doc friction 2026-11-21) sets PAGES_BUILD_LOCK_WAIT to a
// number of seconds; waitForBuildLock() then polls until the holder finishes.
// CI leaves it unset, so a clash there still fails at once.
import fs from 'node:fs';

export function lockPath(outDir) {
  return `${outDir.replace(/[\\/]+$/, '')}.building`;
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by another user
  }
}

// Returns a release function, or throws (code BUILD_LOCKED) while a live
// build holds outDir.
export function acquireBuildLock(outDir, { pid = process.pid, isAlive = alive } = {}) {
  const file = lockPath(outDir);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(file, `${pid}\n`, { flag: 'wx' });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          if (fs.readFileSync(file, 'utf8').trim() === String(pid)) fs.rmSync(file, { force: true });
        } catch { /* already gone */ }
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let holder = NaN;
      try { holder = Number.parseInt(fs.readFileSync(file, 'utf8'), 10); } catch { /* removed meanwhile */ }
      if (holder !== pid && isAlive(holder)) {
        const e = new Error(
          `another build (pid ${holder}) is writing ${outDir}; wait for it to finish `
          + `(it removes ${file} when done), or build elsewhere with --out=<dir>. `
          + "Two builds into one directory delete each other's pages.");
        e.code = 'BUILD_LOCKED';
        throw e;
      }
      fs.rmSync(file, { force: true }); // stale: its builder is gone
    }
  }
  throw new Error(`could not take the build lock ${file}`);
}

// Like acquireBuildLock, but polls while a live build holds outDir, for up to
// waitMs, calling onWait(message) once. Throws BUILD_LOCKED when time runs out.
export async function waitForBuildLock(outDir, {
  waitMs = 0, pollMs = 5000, onWait = () => {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, ...opts
} = {}) {
  const deadline = now() + waitMs;
  let told = false;
  for (;;) {
    try {
      return acquireBuildLock(outDir, opts);
    } catch (err) {
      if (err.code !== 'BUILD_LOCKED' || now() >= deadline) throw err;
      if (!told) {
        onWait(`${err.message.split(';')[0]}; waiting up to ${Math.round(waitMs / 1000)} s`);
        told = true;
      }
      await sleep(Math.max(1, Math.min(pollMs, deadline - now())));
    }
  }
}
