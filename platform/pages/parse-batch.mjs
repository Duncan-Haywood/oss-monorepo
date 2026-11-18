// Child process for check.mjs: parses many script files in one process.
// stdin: JSON [[file, "mjs"|"js"], ...]; stdout: JSON array of the indexes that
// parsed cleanly. Nothing is executed: vm.SourceTextModule and
// vm.compileFunction only compile. A file missing from the answer (a parse
// failure, or anything unexpected) is re-checked by check.mjs with
// `node --check`, so this never decides that a script is broken.
// Run with --experimental-vm-modules.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const jobs = JSON.parse(readFileSync(0, 'utf8'));
const ok = [];
jobs.forEach(([file, extension], i) => {
  try {
    const body = readFileSync(file, 'utf8');
    if (extension === 'mjs') new vm.SourceTextModule(body, { identifier: file });
    // `node --check x.js` compiles a CommonJS file inside this wrapper.
    else vm.compileFunction(body, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: file });
    ok.push(i);
  } catch {
    /* left for the node --check fallback */
  }
});
process.stdout.write(JSON.stringify(ok));
