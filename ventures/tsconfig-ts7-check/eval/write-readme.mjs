#!/usr/bin/env node
// Writes eval/README.md from results.json, option-matrix.json and defaults.json.
//   node eval/write-readme.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const { summary, rows } = read('./results.json');
const matrix = read('./option-matrix.json');
const code = (s) => `\`${s}\``;

let md = `# Eval: the checker against tsc 6.0.3 and 7.0.2 (${summary.date})

Made by [write-readme.mjs](write-readme.mjs) from the files beside it; rerun
[run-eval.mjs](run-eval.mjs) first (\`TSC6=... TSC7=... node eval/run-eval.mjs --repo <monorepo root>\`).
Compilers: typescript@6.0.3 and typescript@7.0.2 from npm (the 7.0.2 package ships the native \`tsc\`).

Each config was compiled with its \`extends\` dropped and its sources replaced by one stub file in
\`src/\`, so the only diagnostics are about the config itself. "Rejected" means tsc 7 reported an
option as removed (TS5102/TS5108), unknown (TS5023) or an invalid value (TS6046). The suggestion is
\`suggestOptions()\`, written back and compiled again by both compilers.

| | Configs | Rejected by tsc 7.0.2 | Checker named exactly those options | Suggestion clean on 6.0.3 and 7.0.2 |
|---|---|---|---|---|
`;
for (const [g, label] of [['tsconfig-bases', '@tsconfig/bases (npm, MIT)'], ['synthetic', 'Hand-written legacy fixtures'], ['repo', 'This monorepo (git ls-files)']]) {
  const rs = rows.filter((r) => r.id.startsWith(g));
  md += `| ${label} | ${rs.length} | ${rs.filter((r) => r.tsc7Removed.length).length} | ${rs.filter((r) => r.removedMatch && r.rootDirMatch).length} | ${rs.filter((r) => r.suggestionClean).length} |\n`;
}
md += `| **All** | **${summary.configs}** | **${summary.configsTsc7Rejects}** | **${summary.agree}** | **${summary.suggestionsClean}** |

The rootDir prediction (TS5011, reported when sources sit in a subfolder and \`outDir\`,
\`declarationDir\` or \`outFile\` is set) also matched tsc 7 on every config.

## Per config

| Config | tsc 7.0.2 rejects |
|---|---|
`;
for (const r of rows) md += `| ${r.id} | ${r.tsc7Removed.length ? r.tsc7Removed.map(code).join(', ') : 'nothing'} |\n`;
md += `
## What the probes found that the TypeScript 6.0 source alone did not say

The rules started from \`checkDeprecations\` and \`computedOptions\` in typescript@6.0.3's
\`lib/_tsc.js\`. Running the compilers on every option ([option-matrix.json](option-matrix.json),
${matrix.length} single-option configs, made by [option-matrix-probe.mjs](option-matrix-probe.mjs))
corrected three first guesses:

- The options removed in 5.5 are not "removed" (TS5102) in 7.0 but **unknown** (TS5023), for every
  value: \`"keyofStringsOnly": false\` passes tsc 6.0.3 and fails tsc 7.0.2.
- \`"module": "none"\` and \`"target": "es3"\` are **invalid values** in 7.0 (TS6046), not "removed".
- \`"prepend": true\` on a project reference is an error in 6.0.3 and **silently ignored** by 7.0.2.

[defaults.json](defaults.json) (made by [defaults-probe.mjs](defaults-probe.mjs)) shows each changed
default on a fixture with the option left out, under 5.9.3, 6.0.3 and 7.0.2. 6.0.3 and 7.0.2 behave
the same on all seven.

The corpus in [corpus/tsconfig-bases/](corpus/tsconfig-bases/) is copied unchanged from the
\`@tsconfig/*\` npm packages (MIT, github.com/tsconfig/bases); the file name is
\`<package>-<version>.jsonc\` (JSON with comments, as tsc reads it).
`;
writeFileSync(new URL('./README.md', import.meta.url), md);
console.log(`wrote eval/README.md (${rows.length} configs)`);
