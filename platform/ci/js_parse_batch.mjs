// Parse many JavaScript sources in one Node process, for check_js_syntax.py.
//
// stdin: a JSON array of [suffix, text] pairs; stdout: a JSON array of
// booleans, true where the source parsed. ".mjs" parses as an ES module
// (vm.SourceTextModule, which needs --experimental-vm-modules), anything else
// as a CommonJS body with the loader's five wrapper parameters, the same
// compile `node --check` does for a .js file (wrapSafe).
//
// A `true` here is final; a `false` is only a hint. `node --check` is more
// lenient in a few cases (Node 22 re-parses some failing CommonJS as a module:
// top-level await, `let require`), so the caller re-checks every `false` with
// `node --check` itself, and its message and JSX test are the original ones.
// One process instead of one per file: 58 s to about 3 s on 11,238 files
// (docs/history/ci-perf-2026-11-12-js-syntax-one-process.md).
import vm from 'node:vm';

const PARAMS = ['exports', 'require', 'module', '__filename', '__dirname'];

function parses(suffix, text) {
  try {
    if (suffix === '.mjs') new vm.SourceTextModule(text);
    else vm.compileFunction(text, PARAMS);
    return true;
  } catch {
    return false;
  }
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const items = JSON.parse(Buffer.concat(chunks).toString('utf8'));
process.stdout.write(JSON.stringify(items.map(([s, t]) => parses(s, t))));
