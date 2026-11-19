---
kind: note
subjects: [tsconfig-ts7-check]
---
# tsconfig-ts7-check: notes for the next run (2026-11-19)

What shipped: `ventures/tsconfig-ts7-check/`, a page and CLI that flag the
tsconfig options TypeScript 7.0 rejects and the defaults 6.0 changed.
How it was checked: `ventures/tsconfig-ts7-check/eval/README.md`.

## Things a later run should know

- **Three ventures here fail under tsc 7.0.2**, all on `"target": "es5"`:
  `print-atelier`, `vendor-watch`,
  `real-estate-agent-photo-app/research`. Their package.json files pin
  `typescript` `^5`, so nothing breaks today. Before anyone merges a
  Dependabot bump to 7.x for them, change `target` to `es2017` or later. With
  `noEmit: true` the change has no effect on output.
  `node ventures/tsconfig-ts7-check/cli.mjs <path>` confirms it.
- Almost every tsconfig here leaves `types` unset. Under 6.0 and later that
  means no `@types` globals. The CLI names the installed packages that stop
  loading once `node_modules` exists.
- **Rerunning the eval** needs typescript@6.0.3 and @7.0.2 from npm (both
  reachable through the proxy; 7.0.2 pulls the native
  `@typescript/typescript-linux-x64` binary). Install them into the
  scratchpad, then run
  `TSC6=... TSC7=... node eval/run-eval.mjs --repo . && node eval/write-readme.mjs`.
  It takes about 3 minutes for 61 configs.
  `eval/option-matrix-probe.cjs` takes about 10 minutes (239 configs × 3
  compilers): start it with `run_in_background`.
- When TypeScript 7.1 ships (7.1.0-beta is on npm now), rerun both probes.
  `eval.test.mjs` pins the recorded compiler versions, so it will not drift
  silently.
