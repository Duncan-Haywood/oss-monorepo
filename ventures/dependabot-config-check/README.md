# Dependabot Config Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/dependabot-config-check/>

A free tool that lints `.github/dependabot.yml` and compares it with your
repository's file list to find **manifests Dependabot never updates**.

After using this, you can now **see every folder and ecosystem your
Dependabot config silently skips in one paste**, which used to take **noticing
that a subfolder's dependencies had gone stale months later and adding
entries one pull request at a time**.

**What it is not:** a vulnerability scanner or an audit. It does not know
which dependencies are outdated or vulnerable and never talks to GitHub. It
compares two texts you give it, and GitHub's own Dependabot documentation is
the authority on options.

## What it checks

| Rule | Level | Meaning |
| --- | --- | --- |
| `uncovered-ecosystem` | warn | A manifest in the file list has no update entry for its ecosystem and directory |
| `version`, `no-updates` | error | `version: 2` missing or wrong; empty `updates:` |
| `unknown-ecosystem` | error | e.g. `go` instead of `gomod` |
| `missing-directory`, `missing-schedule`, `missing-interval`, `bad-interval` | error | Required keys absent or invalid |
| `duplicate-entry` | error | Same ecosystem + directory + target-branch twice (GitHub rejects the file) |
| `relative-directory` | warn | Directory does not start with `/` |
| `pr-limit-zero` | warn | `open-pull-requests-limit: 0` disables version updates for the entry |
| `no-groups` | warn / info | Every bump is its own PR |
| `no-cooldown` | info | Releases can be proposed the hour they are published |
| `stale-entry` | info | An entry matches no manifest in the file list |

`directory: "/"` covers the repository root only (and `.github/workflows` for
`github-actions`); `directories:` globs such as `/*` and `/**` are honoured.
`pip`/`uv`, `npm`/`bun` and `terraform`/`opentofu` entries satisfy each other's
manifests. `node_modules`, `vendor`, `dist`, `build`, `.venv` and similar
folders are ignored when detecting manifests.

## Use it

Open [`index.html`](index.html), paste the config and `git ls-files`, click
Check. Or, with Node 18+ and nothing to install:

```sh
node cli.mjs                    # check .github/dependabot.yml against the current directory
node cli.mjs /path/to/repo
node cli.mjs --format json
node cli.mjs --fail-on-risk     # exit 2 on any error or warning (for CI)
node cli.mjs --generate         # print a starter config for the manifests found
```

## Privacy

Everything runs locally. No network calls, no upload. The page counts
anonymous feature events (`check_run`, `config_generated`, `example_loaded`)
in `localStorage` only; Do Not Track and Global Privacy Control are honoured
and a button turns it off. The CLI records nothing.

## Development

```sh
node --test
```

## Disclaimers

Provided free and as-is, without warranty. Not a security audit. Verify its
output against GitHub's current Dependabot documentation before relying on it.
Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what the tool does.
