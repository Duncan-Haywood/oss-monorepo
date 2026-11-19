# Eval: the checker against tsc 6.0.3 and 7.0.2 (2026-11-19)

Made by [write-readme.mjs](write-readme.mjs) from the files beside it; rerun
[run-eval.mjs](run-eval.mjs) first (`TSC6=... TSC7=... node eval/run-eval.mjs --repo <monorepo root>`).
Compilers: typescript@6.0.3 and typescript@7.0.2 from npm (the 7.0.2 package ships the native `tsc`).

Each config was compiled with its `extends` dropped and its sources replaced by one stub file in
`src/`, so the only diagnostics are about the config itself. "Rejected" means tsc 7 reported an
option as removed (TS5102/TS5108), unknown (TS5023) or an invalid value (TS6046). The suggestion is
`suggestOptions()`, written back and compiled again by both compilers.

| | Configs | Rejected by tsc 7.0.2 | Checker named exactly those options | Suggestion clean on 6.0.3 and 7.0.2 |
|---|---|---|---|---|
| @tsconfig/bases (npm, MIT) | 35 | 17 | 35 | 35 |
| Hand-written legacy fixtures | 9 | 8 | 9 | 9 |
| This monorepo (git ls-files) | 17 | 3 | 17 | 17 |
| **All** | **61** | **28** | **61** | **61** |

The rootDir prediction (TS5011, reported when sources sit in a subfolder and `outDir`,
`declarationDir` or `outFile` is set) also matched tsc 7 on every config.

## Per config

| Config | tsc 7.0.2 rejects |
|---|---|
| synthetic/amd-outfile-library.jsonc | `alwaysStrict:TS5108`, `module:TS5108`, `outFile:TS5102`, `target:TS5108` |
| synthetic/angular-2019-style.jsonc | `baseUrl:TS5102`, `downlevelIteration:TS5102`, `moduleResolution:TS5108`, `target:TS5108` |
| synthetic/ignore-deprecations-6.jsonc | `baseUrl:TS5102`, `moduleResolution:TS5108`, `target:TS5108` |
| synthetic/modern-clean.jsonc | nothing |
| synthetic/module-none.jsonc | `module:TS6046` |
| synthetic/node-commonjs-legacy.jsonc | `allowSyntheticDefaultImports:TS5108`, `baseUrl:TS5102`, `esModuleInterop:TS5108`, `moduleResolution:TS5108`, `target:TS5108` |
| synthetic/removed-in-5-5.jsonc | `importsNotUsedAsValues:TS5023`, `keyofStringsOnly:TS5023`, `noImplicitUseStrict:TS5023`, `noStrictGenericChecks:TS5023`, `preserveValueImports:TS5023`, `suppressExcessPropertyErrors:TS5023`, `suppressImplicitAnyIndexErrors:TS5023` |
| synthetic/system-classic.jsonc | `module:TS5108`, `moduleResolution:TS5108`, `outFile:TS5102` |
| synthetic/umd-none.jsonc | `module:TS5108` |
| tsconfig-bases/bun-1.0.12.jsonc | nothing |
| tsconfig-bases/create-react-app-1.0.3.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/create-react-app-2.0.12.jsonc | nothing |
| tsconfig-bases/cypress-1.0.6.jsonc | `target:TS5108` |
| tsconfig-bases/deno-1.0.15.jsonc | nothing |
| tsconfig-bases/docusaurus-1.0.7.jsonc | `baseUrl:TS5102` |
| tsconfig-bases/docusaurus-2.0.10.jsonc | `baseUrl:TS5102` |
| tsconfig-bases/ember-1.1.0.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/ember-3.0.13.jsonc | nothing |
| tsconfig-bases/esm-1.0.5.jsonc | nothing |
| tsconfig-bases/next-1.0.5.jsonc | `moduleResolution:TS5108`, `target:TS5108` |
| tsconfig-bases/next-2.0.7.jsonc | nothing |
| tsconfig-bases/node-lts-26.0.1.jsonc | nothing |
| tsconfig-bases/node10-1.0.14.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/node12-12.1.9.jsonc | nothing |
| tsconfig-bases/node14-14.1.10.jsonc | nothing |
| tsconfig-bases/node16-16.1.10.jsonc | nothing |
| tsconfig-bases/node18-18.2.8.jsonc | nothing |
| tsconfig-bases/node20-20.1.11.jsonc | nothing |
| tsconfig-bases/node22-22.0.7.jsonc | nothing |
| tsconfig-bases/node24-24.0.6.jsonc | nothing |
| tsconfig-bases/nuxt-1.0.1.jsonc | `baseUrl:TS5102`, `moduleResolution:TS5108` |
| tsconfig-bases/nuxt-2.0.6.jsonc | `baseUrl:TS5102` |
| tsconfig-bases/react-native-1.0.5.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/react-native-3.0.10.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/recommended-1.0.14.jsonc | nothing |
| tsconfig-bases/remix-1.0.4.jsonc | `baseUrl:TS5102`, `moduleResolution:TS5108` |
| tsconfig-bases/remix-2.0.8.jsonc | `baseUrl:TS5102` |
| tsconfig-bases/strictest-1.0.2.jsonc | `importsNotUsedAsValues:TS5023` |
| tsconfig-bases/strictest-2.0.9.jsonc | nothing |
| tsconfig-bases/svelte-1.0.13.jsonc | `importsNotUsedAsValues:TS5023`, `moduleResolution:TS5108` |
| tsconfig-bases/svelte-5.0.9.jsonc | nothing |
| tsconfig-bases/taro-1.0.7.jsonc | `moduleResolution:TS5108` |
| tsconfig-bases/vite-react-1.0.1.jsonc | `esModuleInterop:TS5108`, `moduleResolution:TS5108` |
| tsconfig-bases/vite-react-8.1.2.jsonc | nothing |
| repo/ventures/ai-first-markets/tsconfig.json | nothing |
| repo/ventures/local-site-studio/convex/tsconfig.json | nothing |
| repo/ventures/local-site-studio/tsconfig.json | nothing |
| repo/ventures/photo-editing/docs-site/tsconfig.json | nothing |
| repo/ventures/print-atelier/tsconfig.json | `target:TS5108` |
| repo/ventures/quick-pick-survey/tsconfig.json | nothing |
| repo/ventures/real-estate-agent-photo-app/docs-site/tsconfig.json | nothing |
| repo/ventures/real-estate-agent-photo-app/pipeline/tsconfig.json | nothing |
| repo/ventures/real-estate-agent-photo-app/research/tsconfig.json | `target:TS5108` |
| repo/ventures/retail-pilot-intel/apps/docs/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/apps/portal/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/packages/analytics/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/packages/edge/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/packages/pos/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/packages/schemas/tsconfig.json | nothing |
| repo/ventures/retail-pilot-intel/tsconfig.base.json | nothing |
| repo/ventures/vendor-watch/tsconfig.json | `target:TS5108` |

## What the probes found that the TypeScript 6.0 source alone did not say

The rules started from `checkDeprecations` and `computedOptions` in typescript@6.0.3's
`lib/_tsc.js`. Running the compilers on every option ([option-matrix.json](option-matrix.json),
239 single-option configs, made by [option-matrix-probe.mjs](option-matrix-probe.mjs))
corrected three first guesses:

- The options removed in 5.5 are not "removed" (TS5102) in 7.0 but **unknown** (TS5023), for every
  value: `"keyofStringsOnly": false` passes tsc 6.0.3 and fails tsc 7.0.2.
- `"module": "none"` and `"target": "es3"` are **invalid values** in 7.0 (TS6046), not "removed".
- `"prepend": true` on a project reference is an error in 6.0.3 and **silently ignored** by 7.0.2.

[defaults.json](defaults.json) (made by [defaults-probe.mjs](defaults-probe.mjs)) shows each changed
default on a fixture with the option left out, under 5.9.3, 6.0.3 and 7.0.2. 6.0.3 and 7.0.2 behave
the same on all seven.

The corpus in [corpus/tsconfig-bases/](corpus/tsconfig-bases/) is copied unchanged from the
`@tsconfig/*` npm packages (MIT, github.com/tsconfig/bases); the file name is
`<package>-<version>.jsonc` (JSON with comments, as tsc reads it).
