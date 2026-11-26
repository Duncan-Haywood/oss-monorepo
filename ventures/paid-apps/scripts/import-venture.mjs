#!/usr/bin/env node
// Import a venture from the public oss-monorepo into apps/<slug> as the baseline of a
// proprietary, paid product (owner direction 2026-11-24; the rules and the move list live in
// oss-monorepo portfolio/monetization/LICENSING_TRANSITION.md and transition.json).
//
//   node scripts/import-venture.mjs <slug> --from ../oss-monorepo [--model one-off|subscription] [--dry-run]
//
// What it does:
//   - refuses a slug that already exists here, or whose source has uncommitted changes;
//   - copies ventures/<slug> at the source HEAD, minus build output and dependencies;
//   - writes apps/<slug>/LICENSE: the imported baseline stays MIT as published, while changes
//     made after the import are proprietary;
//   - writes apps/<slug>/PROVENANCE.md: source commit, file count, the model, and every
//     third-party licence file found (each must be checked before a paid build ships it);
//   - writes apps/<slug>/biome.json so the root lint leaves the imported style alone.
// Zero dependencies; node >= 22.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", "dist", "target", ".wrangler", "__pycache__", ".git"]);
const LICENCE_FILE = /^(LICEN[CS]E|COPYING)([-_.].*)?$/i;
const CODE_FILE = /\.(m?[jt]sx?|cjs|py|rs|go|wasm)$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { slug: "", from: "", model: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") out.from = argv[++i] ?? "";
    else if (a === "--model") out.model = argv[++i] ?? "";
    else if (a === "--dry-run") out.dryRun = true;
    else if (!out.slug) out.slug = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!SLUG.test(out.slug))
    throw new Error("usage: import-venture.mjs <slug> --from <oss-monorepo>");
  if (!out.from) throw new Error("--from <path to an oss-monorepo checkout> is required");
  if (out.model && out.model !== "one-off" && out.model !== "subscription")
    throw new Error("--model must be one-off or subscription");
  return out;
}

/** @param {string} dir @returns {string[]} paths relative to dir */
export function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}

/** Licence files below the venture's own root. @param {string[]} files */
export function thirdPartyLicences(files) {
  return files.filter(
    (f) => f.includes("/") && LICENCE_FILE.test(path.basename(f)) && !CODE_FILE.test(f),
  );
}

/** The model the oss transition list gives the slug, if the file is there. @param {string} from @param {string} slug */
export function modelFromTransition(from, slug) {
  const p = path.join(from, "portfolio/monetization/transition.json");
  if (!fs.existsSync(p)) return "";
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const row = (data.proprietary ?? []).find(
    (/** @type {{venture: string}} */ r) => r.venture === slug,
  );
  return row ? row.model : "";
}

/** @param {{slug: string, commit: string, date: string, mitNotice: string}} o */
export function licenceText(o) {
  return `Licence for apps/${o.slug}

1. The baseline: oss-monorepo ventures/${o.slug} at commit ${o.commit}
   (imported ${o.date}) was published under the MIT licence below and stays
   available under it, as published, to anyone.

2. Everything changed or added in this directory after that import is
   Copyright (c) 2026 Duncan Haywood. All rights reserved. It is proprietary;
   see the repository's root LICENSE.

3. Third-party files keep their own licences (PROVENANCE.md lists them).

--- MIT licence of the imported baseline ---

${o.mitNotice.trim()}
`;
}

/** @param {{slug: string, commit: string, tree: string, date: string, model: string, files: string[], licences: string[]}} o */
export function provenanceText(o) {
  const lic = o.licences.length
    ? o.licences
        .map((l) => `- [ ] \`${l}\`: check its terms before a paid build ships this file`)
        .join("\n")
    : "- none found";
  return `# Provenance: ${o.slug}

| | |
|---|---|
| Source | oss-monorepo \`ventures/${o.slug}\` |
| Commit | \`${o.commit}\` (last to touch the venture) |
| Tree | \`${o.tree}\` (git tree id of the copied directory) |
| Imported | ${o.date} |
| Files | ${o.files.length} |
| Paid model | ${o.model || "not set (see oss transition.json)"} |

The imported files are the MIT-licensed baseline (LICENSE, part 1). The public
copy stays online as the free edition; new depth is built here (oss-monorepo
\`portfolio/monetization/LICENSING_TRANSITION.md\`, "How one product moves").

## Third-party licence files

${lic}

## Before the first paid release

- [ ] Every third-party file above is checked: MIT, BSD or Apache-2.0 ships with
      its notice; GPL, AGPL or unlicensed code does not ship; test corpora stay
      out of the build.
- [ ] The source history has no co-author other than the owner or agents
      working for them.
- [ ] The paid path goes through the merchant of record (no key in this
      repository) and stays dark until the owner sets the checkout link.
`;
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

/** @param {{slug: string, from: string, model: string, dryRun: boolean}} opts @param {string} repoRoot */
export function importVenture(opts, repoRoot, now = new Date()) {
  const src = path.resolve(opts.from, "ventures", opts.slug);
  const dest = path.join(repoRoot, "apps", opts.slug);
  if (!fs.existsSync(src)) throw new Error(`no such venture: ${src}`);
  if (fs.existsSync(dest)) throw new Error(`apps/${opts.slug} already exists; not overwriting`);
  const dirty = git(opts.from, ["status", "--porcelain", "--", `ventures/${opts.slug}`]);
  if (dirty)
    throw new Error(`ventures/${opts.slug} has uncommitted changes in the source checkout`);
  // The last commit that touched the venture: its tree equals what is copied, and unlike a local
  // branch head it is on the public main branch. The tree id pins the content either way.
  const commit = git(opts.from, ["log", "-1", "--format=%H", "--", `ventures/${opts.slug}`]);
  const tree = git(opts.from, ["rev-parse", `HEAD:ventures/${opts.slug}`]);
  const date = now.toISOString().slice(0, 10);
  const files = listFiles(src);
  const licences = thirdPartyLicences(files);
  const model = opts.model || modelFromTransition(opts.from, opts.slug);
  const mitPath = path.join(src, "LICENSE");
  const mitNotice = fs.existsSync(mitPath) ? fs.readFileSync(mitPath, "utf8") : "";
  if (!/MIT License/i.test(mitNotice))
    throw new Error(`ventures/${opts.slug}/LICENSE is not the MIT licence`);
  const summary = { slug: opts.slug, commit, tree, files: files.length, licences, model };
  if (opts.dryRun) return summary;
  for (const f of files) {
    if (f === "LICENSE") continue;
    const to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, f), to);
  }
  fs.writeFileSync(
    path.join(dest, "LICENSE"),
    licenceText({ slug: opts.slug, commit, date, mitNotice }),
  );
  fs.writeFileSync(
    path.join(dest, "PROVENANCE.md"),
    provenanceText({ slug: opts.slug, commit, tree, date, model, files, licences }),
  );
  fs.writeFileSync(
    path.join(dest, "biome.json"),
    `${JSON.stringify(
      {
        root: false,
        formatter: { enabled: false },
        linter: { enabled: false },
        assist: { enabled: false },
      },
      null,
      2,
    )}\n`,
  );
  return summary;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const s = importVenture(opts, repoRoot);
    console.log(
      `${opts.dryRun ? "would import" : "imported"} ${s.slug} @ ${s.commit.slice(0, 12)}: ` +
        `${s.files} files, model ${s.model || "unset"}, ${s.licences.length} third-party licence file(s)`,
    );
    for (const l of s.licences) console.log(`  check: ${l}`);
  } catch (e) {
    console.error(`import-venture: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
