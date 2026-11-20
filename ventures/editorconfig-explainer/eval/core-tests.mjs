// Runs the engine over the official EditorConfig core-tests suite
// (github.com/editorconfig/editorconfig-core-test, BSD-2-Clause; not vendored
// here). Clone it anywhere and pass the folder:
//
//   git clone --depth 1 https://github.com/editorconfig/editorconfig-core-test /tmp/ect
//   node ventures/editorconfig-explainer/eval/core-tests.mjs /tmp/ect
//
// Each `new_ec_test*` call in the suite's CMakeLists.txt names a config file
// name, a target path and a regular expression the core's output must match.
// The CLI tests (cli/) exercise a command line's flags, not the format, and
// are skipped. Exit 1 when any test fails.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { parseFile, resolvePath, coreOutput } from "../editorconfig.mjs";

const root = process.argv[2];
if (!root || !existsSync(join(root, "CMakeLists.txt"))) {
  console.error("usage: node eval/core-tests.mjs <path to editorconfig-core-test clone>");
  process.exit(2);
}

// CMake argument lists: quoted strings (with \\ \" \t \n \r \; escapes) and
// bare words, across lines, comments dropped.
function cmakeArgs(text) {
  const args = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"') {
      let s = "";
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") {
          const n = text[i + 1];
          s += n === "t" ? "\t" : n === "n" ? "\n" : n === "r" ? "\r" : n;
          i += 2;
        } else s += text[i++];
      }
      i++;
      args.push(s);
      continue;
    }
    let s = "";
    while (i < text.length && !/\s/.test(text[i])) s += text[i++];
    args.push(s);
  }
  return args;
}

function calls(file) {
  const src = readFileSync(file, "utf8").replace(/^\s*#.*$/gm, "");
  const out = [];
  const re = /\b(new_ec_test(?:_multiline|_version|_full_ec_file_path)?)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    if (/function\s*\($/.test(src.slice(Math.max(0, m.index - 10), m.index + m[0].length))) continue;
    let depth = 1, j = re.lastIndex, inQ = false;
    for (; j < src.length && depth; j++) {
      const c = src[j];
      if (c === "\\" && inQ) { j++; continue; }
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === "(") depth++;
      else if (!inQ && c === ")") depth--;
    }
    out.push({ fn: m[1], args: cmakeArgs(src.slice(re.lastIndex, j - 1)) });
  }
  return out.filter((c) => !/^function/.test(c.fn));
}

function cmakeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cmakeFiles(p));
    else if (name === "CMakeLists.txt" && dir !== root) out.push(p);
  }
  return out;
}

let pass = 0, fail = 0, skipped = 0;
const failures = [];
for (const cm of cmakeFiles(root)) {
  const dir = dirname(cm);
  if (relative(root, dir).split(sep)[0] === "cli") { skipped += calls(cm).length; continue; }
  for (const { fn, args } of calls(cm)) {
    const [name, ecName, src, regex, version] = args;
    if (fn === "new_ec_test_full_ec_file_path") { skipped++; continue; } // a Windows backslash path on the command line
    // config files named ecName in the target's folder and every folder above, up to the suite's top
    const target = relative(root, join(dir, src)).split(sep).join("/");
    const files = [];
    let d = dirname(join(dir, src));
    for (;;) {
      const f = join(d, ecName);
      if (existsSync(f)) files.push(parseFile(readFileSync(f, "utf8"), relative(root, f).split(sep).join("/")));
      if (d === root || relative(root, d).startsWith("..")) break;
      d = dirname(d);
    }
    let out = coreOutput(resolvePath(files, target, { version: fn === "new_ec_test_version" ? version : undefined }));
    if (fn === "new_ec_test_multiline") out = out.split("\n").filter(Boolean).sort().join("\n");
    out += "\n";
    // CMake regex -> JS: `${L}` is meta/'s `set(L ...)`, and CMake's `[\\]` (one
    // backslash in a class) has to be `[\\\\]` for JS.
    const js = regex.replace(/\$\{L\}/g, "[ \t\n\r]+").replace(/\[\\\]/g, "[\\\\]");
    const ok = new RegExp(js).test(out);
    if (ok) pass++; else { fail++; failures.push({ name, target, out: out.trim(), regex }); }
  }
}
for (const f of failures) console.log(`FAIL ${f.name}  ${f.target}\n  got:  ${JSON.stringify(f.out)}\n  want: /${f.regex}/`);
console.log(`core-tests: ${pass} passed, ${fail} failed, ${skipped} skipped (command-line path test)`);
process.exit(fail ? 1 : 0);
