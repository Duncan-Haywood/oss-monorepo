# Release Notes Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/release-notes-generator/>

Turn `git log` into release notes. Commits are grouped by Conventional Commit type,
**breaking changes come first**, pull requests and commits are linked, and the next
semantic version is suggested. Histories that do not follow any convention still work:
the section is guessed from the first word and the tool says how many were guesses.

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no
network calls. [`how-to-write-a-changelog.html`](how-to-write-a-changelog.html) is the
editorial guide.

After using this, you can paste a release's commits and have a reviewable CHANGELOG.md
entry and version number in seconds, which used to take a manual read of the log.

## CLI

```
node cli.mjs --from v1.2.0 --version 1.3.0 --repo https://github.com/owner/repo
node cli.mjs --from v1.2.0 --bump            # minor -> v1.3.0
node cli.mjs --style github --authors --skip chore,ci,test
git log --format='%H%x1f%an%x1f%s%x1f%b%x1e' | node cli.mjs --stdin
```

Styles: `keepachangelog` (default), `github`, `plain`. Node 18+, git, no dependencies.

## Limits

Notes and the bump come from commit messages only; a mislabelled commit gives a wrong
section or bump. It does not publish releases or edit files. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
