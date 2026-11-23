// Real-package check: every package folder under a node_modules tree (by
// default the one inside your npm), packed by this engine and by the real
// npm-packlist from that npm. Installed packages are what their authors
// published, so their package.json `files`, `main` and `bin` and their folder
// layouts are real ones, not generated.
//
//   node eval/real-packages.mjs [node_modules folder] [npm's node_modules]
//
// Prints a summary line and every disagreement; exit 1 on any.

import { readdirSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readPackage } from "../cli.mjs";
import { analyze } from "../packlist.mjs";

const npmMods = process.argv[3] || (() => {
  let d = dirname(realpathSync(execFileSync("which", ["npm"], { encoding: "utf8" }).trim()));
  for (let i = 0; i < 4; i++, d = dirname(d)) if (existsSync(join(d, "node_modules", "npm-packlist"))) return join(d, "node_modules");
  throw new Error("npm's node_modules not found");
})();
const scan = process.argv[2] || npmMods;
const req = createRequire(join(npmMods, "noop.js"));
const Arborist = req("@npmcli/arborist");
const packlist = req("npm-packlist");

const dirs = [];
const collect = (nm) => {
  for (const name of readdirSync(nm)) {
    if (name.startsWith(".")) continue;
    const p = join(nm, name);
    if (name.startsWith("@")) { collect(p); continue; }
    if (existsSync(join(p, "package.json"))) dirs.push(p);
    if (existsSync(join(p, "node_modules"))) collect(join(p, "node_modules"));
  }
};
collect(scan);

let agree = 0, withFiles = 0, totalFiles = 0, shipped = 0;
const bad = [];
const flagged = {};
for (const dir of dirs) {
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { continue; }
  if (pkg.workspaces || pkg.bundleDependencies || pkg.bundledDependencies) continue;
  const tree = await new Arborist({ path: dir }).loadActual();
  const theirs = (await packlist(tree, { path: dir })).map((f) => f.replace(/^\.\//, ""));
  const { files, contents } = readPackage(dir);
  const r = analyze({ packageJson: contents.get("package.json"), files, ignoreFiles: contents });
  const a = [...r.files].sort().join("\n"), b = [...theirs].sort().join("\n");
  if (Array.isArray(pkg.files)) withFiles++;
  totalFiles += files.length; shipped += r.files.length;
  for (const f of r.findings) flagged[f.id] = (flagged[f.id] || 0) + 1;
  if (a === b) agree++;
  else bad.push({ dir, onlyOurs: r.files.filter((f) => !theirs.includes(f)), onlyNpm: theirs.filter((f) => !r.files.includes(f)) });
}
console.log(`${agree} of ${agree + bad.length} packages agree (${withFiles} use files; ${totalFiles} files listed, ${shipped} packed)`);
console.log("findings by id (packages):", JSON.stringify(flagged));
for (const b of bad) console.log(JSON.stringify(b));
process.exitCode = bad.length ? 1 : 0;
