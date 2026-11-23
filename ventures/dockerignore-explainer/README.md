# .dockerignore Explainer

A free tool for developers: **give it a `.dockerignore`, a file list and optionally a Dockerfile, and see which
files `docker build` sends in the build context and the line that decides each one, resolved the way BuildKit
resolves it.** It flags the COPY sources your rules exclude (the usual cause of a `not found` COPY error), the
`.env` files, keys and `.git` folders still sent, and the patterns that do not mean what they look like. It
writes a fix and re-checks it against your files before offering it. Nothing is uploaded.

**Live tool:** https://marisstella.app/dockerignore-explainer/ ·
**Guide:** [why a .dockerignore pattern does not match in subfolders](why-dockerignore-pattern-does-not-match-subfolders.html)

After using this, you can **say exactly which files reach the builder and why, and fix a COPY that cannot find
its source without rebuilding to find out**. Docker has no `check-ignore` equivalent. The usual workaround is a
throwaway `COPY . /ctx` stage with `RUN find /ctx`, which shows what was sent but not which line decided it.

## What it reports

- **Every path's answer**: sent or left out, the deciding line, the folder where that line matched when the
  answer came down from a parent, and the folder BuildKit skipped without looking inside.
- **COPY / ADD / RUN --mount=type=bind sources the rules exclude** (high): the build fails with `not found`.
  It also reports wildcard sources whose every match is excluded, and folder copies that lose some files (low).
- **Secrets sent** (high when a COPY in your Dockerfile takes them into the image, else medium): `.env` and
  `.env.*` files (examples kept), private keys and keystores, SSH keys, `.npmrc`/`.netrc`/`.pypirc` and similar,
  cloud and cluster credentials, Terraform state and variables, service-account JSON.
- **Heavy folders sent**: `.git`, `node_modules` (also nested ones in a monorepo), virtual environments, caches,
  with file counts and sizes when the list has them.
- **Root-only patterns** (medium): `*.log`, `node_modules` and other slash-free patterns match only at the top of
  the context in Docker, unlike `.gitignore`. Reported with the deeper paths they miss.
- **Folder exceptions that re-include nothing** (medium): `**/*.md` then `!docs` keeps `docs/*.md` out, because
  BuildKit carries a folder's exception down only when the folder was excluded first. The fix is `!docs/**`.
- **Go-syntax traps**: `[!a]` is not a negation (`[^a]` is), a negated class matches `/`, a backslash before a
  letter is a regular-expression escape, an indented `#` line or a `#` after a pattern is part of a pattern.
- **Lines that stop every build**: an unclosed `[`, a lone `!`, a pattern Go's regexp compiler rejects. Each is
  reported with its line number.
- **Rules that do nothing in your list**: they match nothing, or never decide a path.
- **A checked fix**: the rewritten lines (`**/` added, `!folder/**`) and the appended exclusions and exceptions,
  re-run over the same list. The report gives how many targeted paths are fixed, how many are not, and every
  other path whose answer changes.

## How the engine works

`matcher.mjs` is a line-by-line port of the Go code BuildKit runs when it sends a local context:

- `moby/patternmatcher` v0.6.1, `ignorefile.ReadAll`: BOM, `#` only in column one, whitespace trimmed with Go's
  `unicode.IsSpace` (not JS `trim`), `!` split off, `filepath.Clean`, one leading `/` dropped.
- `patternmatcher.New` and `Pattern.compile`: the exact, prefix, suffix and regexp match types. Syntax is checked
  with a port of Go's `filepath.Match`, which stops checking at the first mismatch, as Go's does. The Go
  regexp text `compile` builds is translated into an equivalent JS regexp under the `u` flag. The translator
  follows RE2 where it differs from JS: ASCII-only `\d\s\w`, `[:alpha:]` classes, a leading `]` in a class, and
  `.` not matching a newline. Compile errors surface lazily, only when a path reaches the pattern, as in Go.
- `MatchesUsingParentResults`: per-line match state inherited from the parent folder, which is what makes
  `!docs` differ from `!docs/**`.
- `tonistiigi/fsutil` `filterFS.Walk`, exclude half: an excluded folder is skipped unless an exception could
  match inside it. With only literal exceptions that means a prefix test; with any wildcard exception, BuildKit
  walks in. An excluded folder is still sent when something inside it is.

`dockerfile.mjs` reads COPY/ADD sources and `RUN --mount=type=bind` sources. It handles parser directives
(`# escape=`), continuations, comment lines, heredocs, JSON and shell form, and flags. It skips `--from=`, URL
and git sources; sources with variables are reported, not guessed. `dockerignore.mjs` builds the report.

What it does not model: the legacy (non-BuildKit) builder, Windows path separators, `\p{..}` and `\Q..\E` in a
pattern (reported as not modelled), COPY wildcard `**` (treated as Go's `filepath.Match` treats it), and file
contents (secret detection is by name).

## How it is checked

- `oracle/main.go` runs BuildKit's own code: `ignorefile.ReadAll` plus `fsutil.Walk` with those
  `ExcludePatterns` over a real temporary directory. Pinned to moby/patternmatcher v0.6.1 and tonistiigi/fsutil
  `v0.0.0-20261103125000-e075fd9305eb`.
- `oracle.gen.mjs` writes seeded random cases (names and patterns built to hit dotfiles, `**`, classes, escapes,
  regexp metacharacters, `..`, spaces, `#` and `!`) and saves the oracle's answers in `oracle-fixture.json`.
- `dockerignore.diff.test.mjs` replays all 5,000 fixture cases (2,980 of them exclude something; 392 make
  BuildKit refuse the file) and requires the same pattern list, the same sent set and the same failure kind. With
  Go and the modules cached, it also runs 400 fresh cases live.
- Before the fixture was recorded, 25,000 more cases on other seeds ran with 0 disagreements (2026-11-23,
  go1.25.0).

```sh
node --test ventures/dockerignore-explainer/*.test.mjs ventures/dockerignore-explainer/cli/*.test.mjs
node ventures/dockerignore-explainer/oracle.gen.mjs 5000   # re-record the fixture (needs Go 1.25+)
```

## Command line

```sh
node ventures/dockerignore-explainer/cli/check.mjs <context-dir>             # report
node ventures/dockerignore-explainer/cli/check.mjs . -f build/app.Dockerfile # another Dockerfile
node ventures/dockerignore-explainer/cli/check.mjs . --why src/a.js          # steps for one path
node ventures/dockerignore-explainer/cli/check.mjs . --fixed > .dockerignore.new
node ventures/dockerignore-explainer/cli/check.mjs . --strict                # exit 1 on a high finding
```

Like BuildKit, it uses `<Dockerfile>.dockerignore` next to the Dockerfile when that file exists, otherwise
`<context>/.dockerignore`. It does not follow symlinks.

## Usage tracking and privacy

The page counts five anonymous events (`dockerignore_checked`, `example_loaded`, `folder_picked`,
`why_shown`, `report_downloaded`) in `localStorage` on the visitor's device only (`usage.mjs`). There is no
network call, Do Not Track and Global Privacy Control turn it off, and the page has an off switch. Picking a
folder reads names and sizes, plus the `.dockerignore` and `Dockerfile` at its top.

## No warranty

Provided free and as-is, without warranty of any kind. It is not legal, security or professional advice. Results
come from this tool's port of BuildKit's rules over the list you give it; it does not run Docker. Not affiliated
with or endorsed by Docker, Inc. or the Moby project. MIT licensed (`LICENSE`), except that `matcher.mjs` is a
translation of third-party code and keeps those licences: moby/patternmatcher (Apache-2.0, Docker, Inc.), Go's
`path/filepath` (BSD-3-Clause, The Go Authors) and tonistiigi/fsutil (MIT, Tõnis Tiigi). See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The oracle fetches those modules as dependencies; none is
vendored.
