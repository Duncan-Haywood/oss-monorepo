#!/usr/bin/env node
// Semver Range Explainer CLI. No network, no dependencies.
//
//   node cli.mjs '^1.2.0' 1.3.0 2.0.0-beta.1     explain a range and test versions
//   npm view react versions --json | node cli.mjs '^18.2.0' -
//                                                which published version npm would pick, and why the rest miss
//   node cli.mjs '~1.2.5' --compare '^1.2'       does one range cover the other? with a witness version
//   node cli.mjs --project [dir]                 every dependency range in package.json: findings, and
//                                                whether package-lock.json's version satisfies it
//   --include-prerelease   npm's --include-prerelease semantics
//   --semver 7.7|7.8       which node-semver rules (default: the npm beside this node, else 7.8)
//   --json                 machine-readable output
//   --strict               exit 1 on any high-severity finding or lock mismatch
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, explainRange, satisfies, parseVersionList, semverFlavourFor, SEMVER_FLAVOURS } from "./semver.mjs";

/** The node-semver flavour of the npm next to this node binary, or null when it cannot be found. */
export function localFlavour() {
  const dir = join(process.execPath, "..", "..", "lib", "node_modules", "npm", "node_modules", "semver", "package.json");
  try { return semverFlavourFor(JSON.parse(readFileSync(dir, "utf8")).version); } catch { return null; }
}

export function projectReport(dir, { includePrerelease = false, semver } = {}) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const lockPath = join(dir, "package-lock.json");
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
  const rows = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, spec] of Object.entries(pkg[field] || {})) {
      const row = { field, name, spec, findings: [], locked: null, lockOk: null };
      if (/^(npm:|workspace:|file:|link:|git|https?:|github:)|\//.test(spec)) { row.skipped = "not a registry semver range"; rows.push(row); continue; }
      const x = explainRange(spec, { includePrerelease, semver });
      row.findings = x.findings.filter((f) => f.severity !== "info");
      row.comparators = x.range ?? null;
      const entry = lock?.packages?.[`node_modules/${name}`] ?? lock?.dependencies?.[name];
      if (entry?.version && x.valid && field !== "peerDependencies") {
        row.locked = entry.version;
        try { row.lockOk = satisfies(entry.version, spec, { includePrerelease, semver }); } catch { row.lockOk = null; }
      }
      rows.push(row);
    }
  }
  return { dir, lockfile: !!lock, rows };
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const value = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : undefined; };
  const includePrerelease = flags.has("--include-prerelease");
  const json = flags.has("--json");
  const strict = flags.has("--strict");
  const semver = value("--semver") || localFlavour() || "7.8";
  if (!SEMVER_FLAVOURS[semver]) { console.error(`--semver takes one of: ${Object.keys(SEMVER_FLAVOURS).join(", ")}`); return 2; }
  const consumed = new Set(["--compare", "--project", "--semver"].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0));
  const positional = argv.filter((a, i) => !a.startsWith("--") && !consumed.has(i));

  if (flags.has("--project")) {
    const v = value("--project");
    const dir = resolve(v && !v.startsWith("--") ? v : ".");
    const rep = projectReport(dir, { includePrerelease, semver });
    if (json) console.log(JSON.stringify(rep, null, 2));
    else {
      console.log(`${rep.rows.length} dependency ranges in ${dir}/package.json${rep.lockfile ? ", checked against package-lock.json" : " (no package-lock.json)"}.`);
      for (const r of rep.rows) {
        const lockNote = r.lockOk === false ? `  LOCKED ${r.locked} DOES NOT SATISFY` : r.locked ? `  locked ${r.locked}` : "";
        if (!r.findings.length && r.lockOk !== false) continue;
        console.log(`\n${r.name}@${r.spec} (${r.field})${lockNote}`);
        for (const f of r.findings) console.log(`  [${f.severity}] ${f.message}`);
      }
      const bad = rep.rows.filter((r) => r.findings.length || r.lockOk === false).length;
      console.log(bad ? `\n${bad} with something to look at.` : "\nNothing to flag.");
    }
    const fail = rep.rows.some((r) => r.lockOk === false || r.findings.some((f) => f.severity === "high"));
    return strict && fail ? 1 : 0;
  }

  const [range, ...rest] = positional;
  if (range === undefined) {
    console.error("usage: node cli.mjs '<range>' [versions... | -] [--compare '<range>'] [--include-prerelease] [--json] [--strict]\n       node cli.mjs --project [dir]");
    return 2;
  }
  let versions = rest;
  if (rest.length === 1 && rest[0] === "-") versions = parseVersionList(readFileSync(0, "utf8"));
  const result = analyze({ range, versions, other: value("--compare") || "", includePrerelease, semver });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(text(result));
  const fail = !result.range.valid || result.range.findings.some((f) => f.severity === "high");
  return strict && fail ? 1 : !result.range.valid ? 2 : 0;
}

export function text(result) {
  const out = [];
  const r = result.range;
  if (!r.valid) return `Invalid range: ${r.error}`;
  out.push(`Comparators: ${r.range || "*"}`);
  r.sets.forEach((s, i) => {
    out.push(`${r.sets.length > 1 ? `  branch ${i + 1}: ` : "  "}${s.words}`);
    for (const st of s.steps) out.push(`    ${st.written}  ->  ${st.becomes}  (${st.rule})`);
  });
  out.push(`Lowest matching version: ${r.minVersion ?? "none, nothing can match"}`);
  for (const f of r.findings) out.push(`[${f.severity}] ${f.message}`);
  if (result.versions.length) {
    out.push("");
    for (const v of result.versions) out.push(`${v.ok ? "yes" : v.valid ? " no" : "bad"}  ${v.version.padEnd(18)} ${v.reason}`);
    out.push(`\nHighest match (what npm installs from this list): ${result.max ?? "none"}`);
  }
  const c = result.comparison;
  if (c) {
    out.push("");
    if (!c.valid) out.push(`Cannot compare: ${c.error}`);
    else {
      out.push(`Every version range 1 allows, range 2 allows: ${c.aInB ? "yes" : `no, e.g. ${c.onlyA}`}`);
      out.push(`Every version range 2 allows, range 1 allows: ${c.bInA ? "yes" : `no, e.g. ${c.onlyB}`}`);
      out.push(`Overlap: ${c.overlap ? `yes, e.g. ${c.both}` : "none"}${c.equivalent ? " (the two ranges are equivalent)" : ""}`);
    }
  }
  return out.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
export { main };
