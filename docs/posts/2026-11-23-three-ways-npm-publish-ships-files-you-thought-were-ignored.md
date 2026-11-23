---
title: "Three ways npm publish ships files you thought were ignored"
seo_title: "npm publish included .env or ignored files: why, and a free checker"
date: 2026-11-23
tags: [npm, javascript, security, npmignore, open-source]
description: "A free tool that agrees with npm pack on 3,000 random packages, and three traps it found: .npmignore, main with ./, and ! rules."
---

[npm Publish Contents](../../ventures/npm-publish-contents/) is a new free tool,
[live here](https://marisstella.app/npm-publish-contents/). You give it a package's
`package.json`, its file list and its ignore files, and it lists every file
`npm publish` would put in the tarball, with the rule that decides each one. It
also flags the files to deal with before publishing: `.env` files and keys, entry
points missing from the tarball, and ignore rules npm is not reading.
`npm pack --dry-run` already prints the list. It does not say *why* a file is on
it, and the why is where the surprises are.

## How we know it says what npm does

The engine is a from-behaviour reimplementation of the four modules npm uses to
choose files: `npm-packlist`, `ignore-walk`, `minimatch` and `brace-expansion`. It
runs on a virtual folder tree, so it works in a browser. A differential test builds
seeded random packages: folders up to three deep, dotfiles, case variants,
README and LICENCE spellings, lockfiles, root and nested `node_modules`, random
root and nested `.npmignore` and `.gitignore` files drawn from 48 patterns, and
random `files`, `main`, `bin` and `browser`. Each package is packed by the engine
and by the real `npm-packlist` loaded from the npm on the machine.

- Seeds 1 to 300 were used while building. On 3,000 held-out seeds, the engine
  agrees with npm 10.9.9 on **all 3,000**, and with npm 11.21.3 on **all 3,000**.
- Broken on purpose, by deleting one branch of the folder logic, the engine
  disagrees with npm on 4 to 8 of the first 300 seeds. So the test can fail.
- The pattern matcher on its own matches minimatch on 5,304 of 5,304
  pattern and path pairs, under npm's options.
- On real packages, it agrees on all 338 package folders installed inside the
  two npms. With `--verify`, it also matches `npm pack --dry-run` itself on all 22
  packable `package.json` folders in this repository.

Three behaviours came out of building it. Each was then checked by running the
real `npm pack --dry-run` on npm 10.9.9 and npm 11.21.3, with the same result on
both.

## 1. A .npmignore replaces your .gitignore

npm reads **one** ignore file per folder: the `.npmignore` if there is one,
otherwise the `.gitignore`. Add a `.npmignore` that says `src/` and `test/`, and
the `.env` your `.gitignore` was keeping out ships. At the package root, a `files`
field in `package.json` switches off both files. This one is documented, but it
is still the commonest way a secret ends up in a package. So the tool lists every
shipped file that the `.gitignore` alone would have kept out.

## 2. `"main": "./dist/index.js"` is not forced in

npm promises to always include the `main` file. It does this by adding the rule
`!/` + `main`. minimatch treats `./` as a path segment of its own, so
`!/./dist/index.js` matches nothing. Take `"files": ["lib"]` and
`"main": "./dist/index.js"`: npm leaves `dist/index.js` out. Write
`"dist/index.js"` instead and it ships. `bin` paths are normalised earlier, so
`"./bin/cli.js"` is fine there. Most packages never hit this, because their
`files` already lists the folder. The ones that do publish a package that cannot
be imported.

## 3. A `!` line opens the whole folder

npm leaves a folder out by never entering it. Anything that gives it a reason to
enter makes it go in: a forced `main`, a folder in `files`, or a `!` rule for a
file inside. Once it is in, a rule like `secrets/` names the folder, not the files
in it. So this `.npmignore`:

```
secrets/
!secrets/public.pem
```

publishes `secrets/private.pem` as well as the public one. git reads the same two
lines the other way: it never re-includes a file under an ignored folder. The rule
`secrets/**` names the files, so it keeps working inside the folder. The tool
reports any file that ships from under a folder rule.

## Use it

On the [page](https://marisstella.app/npm-publish-contents/), paste the three
inputs. Nothing is uploaded. In a package folder, run
`node ventures/npm-publish-contents/cli.mjs .`, which has no dependencies.
`--why path` explains one file. `--verify` runs your own `npm pack --dry-run` and
says whether it agrees. `--fail-on high` makes a CI job fail before a secret goes
public. The [guide](https://marisstella.app/npm-publish-contents/why-npmignore-publishes-your-gitignored-files.html)
covers all three traps in more detail.

Limits: the secret check goes by file names, not contents. `bundleDependencies`,
workspaces and `directories.bin` are not modelled; the report says when a package
uses them. `npm pack --dry-run` has the final word.
