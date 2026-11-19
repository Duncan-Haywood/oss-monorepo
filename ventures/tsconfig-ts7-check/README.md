# tsconfig TypeScript 7 Check

You switch the compiler to TypeScript 7 and the build stops before it reads
a single file: `Option 'baseUrl' has been removed. Please remove it from your
configuration.` Or it compiles, and then `process` and `describe` are
suddenly undefined. Both come from the tsconfig, not your code. Paste a
tsconfig.json (or point the CLI at one) and this tool tells you:

- **what TypeScript 7.0 rejects**, with the code each compiler prints:
  target ES5 and ES3, `moduleResolution` node/node10/classic, `baseUrl`,
  `outFile`, `module` AMD/UMD/System/None, `downlevelIteration`, the false
  values of `esModuleInterop`, `allowSyntheticDefaultImports` and
  `alwaysStrict`, and the options removed in 5.5, which 7.0 treats as unknown
  (TS5023) even when set to false;
- **which TypeScript 6.0 default changes reach you**, because the option is
  left out: `strict` now on, `types` now `[]` (the CLI names the `@types`
  packages that stop loading), target ES2025, `module` derived from the
  target, bundler resolution, interop always on, `rootDir` at the tsconfig
  folder (TS5011), and `noUncheckedSideEffectImports` on;
- **whether `"ignoreDeprecations": "6.0"` is hiding anything** (it works on
  6.0 and does nothing for removed options on 7.0);
- **a suggested compilerOptions** with the removed options taken out,
  `baseUrl` folded into `paths`, and the changed defaults pinned so the file
  states its choices.

Live: <https://marisstella.app/tsconfig-ts7-check/>

## Use it

In a browser: open `index.html` (any static server; plain ES modules). Add
the files a config `extends` with the file picker and they are matched by
file name.

From a terminal or CI (Node.js 20+, no dependencies):

```
node cli.mjs                               # ./tsconfig.json
node cli.mjs packages/*/tsconfig.json --strict
node cli.mjs tsconfig.json --suggest       # print a fixed compilerOptions
node cli.mjs tsconfig.json --json
```

The CLI follows `extends` the way tsc does: relative paths with or without
`.json`, package names through `node_modules` (a package.json `tsconfig`
field, then `tsconfig.json`, then the subpath plus `.json`), and lists with
later entries winning. A base it cannot find softens the default-change
warnings to notes and says which base was not read.

Exit codes: 0 when TypeScript 7 accepts the options (warnings allowed), 1
when it would reject them (or a warning with `--strict`), 2 for bad
arguments or an unreadable file.

## How the rules were checked

Nothing here is from memory or the release notes. The removed options came
from `checkDeprecations` and the new defaults from `computedOptions` in
typescript@6.0.3's `lib/_tsc.js`; then every rule was run through the real
compilers (`eval/`):

- [`eval/option-matrix.json`](eval/option-matrix.json): every tsconfig option
  and every enum value set alone, compiled by tsc 5.9.3, 6.0.3 and 7.0.2.
  `eval.test.mjs` replays all 239 rows against the checker in CI. This is
  how three first guesses were corrected (5.5-removed options are TS5023 in
  7.0 at any value; `module: none` and `target: es3` are TS6046; `prepend` is
  ignored by 7.0).
- [`eval/defaults.json`](eval/defaults.json): one fixture per changed default
  with the option left out, showing the behaviour change under each compiler.
- [`eval/README.md`](eval/README.md): 61 configs (35 versions of 25
  `@tsconfig/bases` packages, 9 hand-written legacy fixtures, and this
  monorepo's 17 tsconfig files). The checker named exactly the options tsc
  7.0.2 rejected in all 61, and its suggested config compiled with no config
  diagnostics under 6.0.3 and 7.0.2 in all 61. tsc 7.0.2 rejects 28 of them,
  including the current release of 7 of the 25 `@tsconfig/bases` packages
  (cypress, docusaurus, node10, nuxt, react-native, remix, taro).

To rerun: install typescript@6.0.3 and @7.0.2 anywhere, then
`TSC6=<6.0.3 tsc> TSC7=<7.0.2 tsc> node eval/run-eval.mjs --repo <monorepo root> && node eval/write-readme.mjs`.

## Limits

- It checks the config, not the code. New strict errors, imports that
  resolve differently under bundler or nodenext resolution, and language
  service plugins are outside it; run tsc 7 on the project afterwards.
- The page cannot see `node_modules`, so it cannot say whether the `types`
  change affects you or follow package `extends`; the CLI can.
- The rules describe tsc 6.0.3 and 7.0.2. A later release may change them;
  rerun the probes in `eval/` against it.
- The suggested config keeps 5.9's behaviour where it is safe to (`"strict":
  false`, `"types": ["*"]`, the old target and module) so a migration does
  not change output silently. Tighten those deliberately.

## Files

| File | What it is |
|---|---|
| `tsconfig7.mjs` | JSONC parser, rules, `checkConfig`, `suggestOptions` (no dependencies; the page and CLI share it) |
| `cli.mjs` | command line, `extends` resolution, `@types` discovery |
| `index.html` | the page |
| `usage.mjs` | anonymous local usage counter with opt-out |
| `eval/` | compiler probes, corpus, results |
| `*.test.mjs` | `node --test '*.test.mjs'` |

MIT licensed. Not affiliated with Microsoft or the TypeScript project.
