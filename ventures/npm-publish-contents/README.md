# npm Publish Contents

A free tool for JavaScript package authors: **paste `package.json`, your file list and your ignore files, and see
every file `npm publish` would put in the tarball, with the rule that decides each one.** It puts the things to fix
first: `.env` files and keys that would go public, a `.gitignore` that a `.npmignore` (or `files`) switched off, entry
points missing from the tarball, and folder rules npm walks straight past. Nothing is uploaded.

**Live tool:** https://marisstella.app/npm-publish-contents/ ·
**Guide:** [why a .npmignore publishes your gitignored files](why-npmignore-publishes-your-gitignored-files.html)

After using this, you can **say exactly why a file is or is not in your package, and fix the rule before the
publish, not after**. `npm pack --dry-run` prints the list; it does not say which rule put a file there, that the
`.gitignore` was never read, or that the `main` it promises to force in will not be.

## What it reports

- **Every file's deciding rule**: file and line of the `.npmignore`/`.gitignore` rule, the `files` entry, one of
  npm's default excludes or forced rules, or "no rule matches, so it ships". When a folder is never entered, it says
  which folder and which rule.
- **Secrets that would ship** (high): `.env*` (not `.env.example`), keys and certificate stores, SSH keys,
  `.netrc`/`.pypirc`/`.git-credentials`, credentials and service-account files, Terraform state, databases. By file
  name only.
- **A shadowed `.gitignore`** (medium, high when a secret is involved): npm reads `.npmignore` *instead of* the
  `.gitignore` in the same folder, and at the root a `files` field switches both off. Lists every shipped file the
  `.gitignore` alone would have kept out.
- **Entry points missing from the tarball** (high): `main`, `types`/`typings`, `module`, `browser`, each `bin` and
  every `./` target in `exports`.
- **`main` written with `./`** (high): npm forces `main` in with the rule `!/<main>`, and minimatch keeps `./` as a
  segment, so `"main": "./dist/index.js"` is not forced in. `bin` is normalised first, so `./bin/x.js` works.
- **Folder rules npm walks past** (medium, high with a secret): npm skips a folder by not entering it. Once
  `main`, `bin`, `files` or a `!` line gives it a reason to go in, `dist/` or `secrets/` no longer matches the files
  inside. `secrets/` then `!secrets/public.pem` publishes `secrets/private.pem` too.
- **`files` entries that select nothing**, **a nested `node_modules`** (only the root one is dropped), and
  **files that rarely belong in a package** (tests, coverage, CI config, editor settings, source maps).

## How the engine works (`packlist.mjs`)

A reimplementation, from their behaviour, of the four modules npm itself uses: `npm-packlist` (which files),
`ignore-walk` (how a folder's rules combine with its parents'), `minimatch` (the patterns) and `brace-expansion`.
It runs over a virtual tree, so the page needs no file system.

- In every folder, three rule sets apply in order and the last match wins: npm's default excludes; the folder's
  own rules (at the root `files`, else `.npmignore`, else `.gitignore`; below the root `.npmignore`, else
  `.gitignore`, also under `files`); npm's forced rules (`package.json`, root README/LICENSE/LICENCE/COPYING,
  `main`, `browser`, `bin` in; root `node_modules`, lockfiles, `.npmrc` out).
- A parent folder's rules are asked about each path first, with the path relative to that parent; a folder is
  entered when its rules let it through as a partial match, which is why negations open folders.
- Patterns are minimatch with `matchBase`, `dot` and `nocase`: case is ignored, a slash-free pattern matches the
  name at any depth, lines are trimmed at both ends. Braces, classes (with POSIX classes), escapes and `**` follow
  minimatch 9.0.9, including its fast paths. Extglobs (`+(a|b)`, `!(x)`) are translated plainly and the rule is
  flagged as approximate.
- Not modelled, and said so in the report: `bundleDependencies`, workspaces, `directories.bin`, symbolic links
  (npm does not pack them; the CLI lists the ones it skipped).

## How it was checked

- **Differential, generated** (`packlist.diff.test.mjs`): seeded random packages (up to three folder levels,
  dotfiles, case variants, README/LICENCE spellings, root and nested `node_modules`, lockfiles), random root and
  nested `.npmignore`/`.gitignore` from 48 patterns, random `files`, `main`, `bin` and `browser`, packed by this
  engine and by the real `npm-packlist` loaded from the npm on the machine. Seeds 1-300 were used while building;
  held-out seeds 100000-102999: **3,000 of 3,000 agree on npm 10.9.9** (npm-packlist 9.0.0) **and 3,000 of 3,000 on
  npm 11.21.3** (npm-packlist 10.0.4, minimatch 10.2.5). Breaking the engine on purpose (dropping the
  relative-rule branch, or the exact-folder flag) makes 4-8 of the first 300 seeds disagree, so the check can fail.
- **The matcher alone**: 52 patterns (braces, sequences, classes, escapes, globstars) x 51 paths x partial and full
  matching, against the real minimatch with npm's options: 5,304 of 5,304 agree on both npm versions.
- **Real packages** (`eval/real-packages.mjs`): every package folder installed inside npm 10.9.9 (195) and npm
  11.21.3 (143), real `files`/`main`/`bin` and layouts: all 338 agree. Their findings are not meaningful: npm's
  bundled copies have `.d.ts` files and `bin/` folders stripped.
- **Source trees**: the 22 packable `package.json` folders in this repository, checked with `cli.mjs --verify`
  against `npm pack --dry-run` itself: 22 of 22 agree (10 others have no `version`, so npm refuses to pack them).

## Use it

- **Page:** paste `package.json`, the file list (`find . -type f -not -path './.git/*' -not -path
  './node_modules/*'`, or `npm pack --dry-run --json` output) and the ignore files as `==> path <==` blocks (what
  `head -n 9999 .npmignore .gitignore` prints).
- **CLI** (no dependencies, no network): `node cli.mjs [folder]`; `--why <path>` explains one path; `--all` lists
  what is left out; `--json`; `--verify` also runs your own `npm pack --dry-run --json --ignore-scripts` and diffs
  (exit 3 on a disagreement: please report it); `--fail-on high|medium|low|info` exits 1 for CI.
- **Agents:** `node platform/agents/tools.mjs call npm-publish-contents analyze --input '{"packageJson":{...},"files":[...],"ignoreFiles":{".npmignore":"..."}}'`.

## Tests

`node --test packlist.test.mjs page.test.mjs cli.test.mjs usage.test.mjs packlist.diff.test.mjs` (the differential
test skips when npm's bundled modules are not found; `NPM_MODULES=<npm>/node_modules` points it at another npm).

## Usage tracking

Anonymous counters in the visitor's own local storage only (`package_checked`, `example_loaded`, `secret_found`,
`report_downloaded`), off under Do Not Track or Global Privacy Control, with an opt-out button. Nothing is sent.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, security or professional advice. The secret check
reads file names, not contents. Check the real list with `npm pack --dry-run` before you publish. Not affiliated
with or endorsed by npm, Inc. or the npm CLI maintainers; npm is a trademark of npm, Inc.

MIT licensed. The engine is written from the behaviour of npm-packlist and ignore-walk (ISC, npm, Inc.), minimatch
(ISC, Isaac Z. Schlueter) and brace-expansion (MIT, Julian Gruber); the brace-expansion algorithm follows that
module's structure.
