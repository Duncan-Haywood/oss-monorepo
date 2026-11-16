// Which bare-specifier imports does TypeScript's own resolver send to a
// project file? The reference for cyclehound's tsconfig `paths`/`baseUrl`
// support (BENCHMARK.md, "Path aliases").
//
//   node ts_alias_edges.cjs <typescript dir> <base dir> <graph.json> > ts.json
//
// graph.json is `cyclehound --graph --json` output (paths relative to base);
// its nodes are the files read. For each, the nearest tsconfig.json (else
// jsconfig.json) is parsed with TypeScript's API (extends included), every
// import is listed by ts.preProcessFile, and every bare specifier is
// resolved by ts.resolveModuleName. Prints {"file": ["dep", ...]} with the
// targets that are project source (not node_modules, not .d.ts).
const path = require("path");
const fs = require("fs");
const ts = require(process.argv[2]);
const base = path.resolve(process.argv[3]);
const graph = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));

const configs = new Map();
function optionsFor(file) {
  const dir = path.dirname(file);
  const cfg =
    ts.findConfigFile(dir, ts.sys.fileExists, "tsconfig.json") ||
    ts.findConfigFile(dir, ts.sys.fileExists, "jsconfig.json");
  if (!cfg) return null;
  if (!configs.has(cfg)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(cfg, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    });
    configs.set(cfg, parsed ? { ...parsed.options, allowJs: true } : null);
  }
  return configs.get(cfg);
}

const out = {};
let bare = 0;
for (const rel of Object.keys(graph)) {
  const file = path.join(base, rel);
  const opts = optionsFor(file);
  if (!opts || !(opts.paths || opts.baseUrl)) continue;
  const src = fs.readFileSync(file, "utf8");
  const info = ts.preProcessFile(src, true, true);
  const deps = new Set();
  for (const im of info.importedFiles) {
    const spec = im.fileName;
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    bare++;
    const r = ts.resolveModuleName(spec, file, opts, ts.sys).resolvedModule;
    if (!r || r.isExternalLibraryImport) continue;
    const to = r.resolvedFileName;
    if (to.includes(`${path.sep}node_modules${path.sep}`) || to.endsWith(".d.ts")) continue;
    deps.add(path.relative(base, to));
  }
  if (deps.size) out[rel] = [...deps].sort();
}
process.stderr.write(`${configs.size} configs, ${bare} bare specifiers read\n`);
console.log(JSON.stringify(out));
