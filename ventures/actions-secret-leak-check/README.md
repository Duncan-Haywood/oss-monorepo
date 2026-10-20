# GitHub Actions Secret Leak Check

A free, read-only checker for two documented ways a secret reaches a
GitHub Actions log, or a later step, in plain text despite GitHub's own log
masking. Paste your workflow YAML into the browser page, or run the CLI
against a checkout — both use the same classifier and agree on every input
(`classify.test.mjs` pins a parity test that shells out to the CLI and
compares findings).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/actions-secret-leak-check/

## Why this is not "did I `echo` a secret"

GitHub Actions already masks the exact, unmodified string of a declared
`secrets.*` value (or an `env:` var sourced from one) everywhere it appears
in a job's log output, including inside `set -x` trace output. A tool that
flagged `run: echo ${{ secrets.TOKEN }}` would mostly be reporting a risk
the platform already closed. This checker instead looks for the two ways a
secret's value still reaches a log, or a later step, **unmasked** — both
documented by GitHub's own guidance and both invisible to the platform's
built-in protection by construction:

- **`transformed-secret`** — masking is an exact string match. Pipe a
  secret through `base64`, `openssl`, `xxd`, `basenc`, `iconv`, `tr`, `rev`,
  or take a shell substring of it (`${VAR:0:8}`), and the result is a
  different string than the one the runner is watching for. The encoded
  value — which still fully reverses back to the secret — prints in plain
  text.
- **`unmasked-env-export`** — a value written to `$GITHUB_ENV`,
  `$GITHUB_OUTPUT`, or `$GITHUB_STATE` is exported to later steps, but
  writing it there does not register it with the runner's masking list on
  its own. A freshly derived value (an OAuth token minted using a secret, a
  signed URL, a session cookie) was never declared as a secret to the
  runner at all, so the first later step that echoes it prints it in plain
  text — unless the workflow calls `::add-mask::` on it first, which is
  GitHub's own documented fix for exactly this case.

Full mechanism and worked examples: [why GitHub Actions secret masking
fails on a transformed value](why-github-actions-secret-masking-fails.html).

Why code review usually misses both: [this checker vs. reading the workflow
by eye](vs-reading-the-workflow-by-eye.html).

## What it does not do

A static, step-scoped line scanner over `.github/workflows/*.yml` and
`*.yaml` text — not a YAML parser, and it does not execute anything it
finds. It makes **no network calls of any kind**. A clean scan is not a
security audit: a transform split across two steps, a custom action that
re-exports a secret internally, or a transform utility this tool does not
recognise are all outside what a regex/indentation scan can see.

## Use it

Open `index.html` in a browser, paste one or more workflow files, and click
Check. Nothing is uploaded — the scan runs entirely on your device.

Or run the CLI, stdlib only, nothing to install:

```
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --format sarif   # SARIF 2.1.0, for github/codeql-action/upload-sarif
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Wire `--fail-on-risk` into your own CI to block a newly-added finding before
it merges.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a security audit, a compliance
attestation, or a guarantee that your secrets are safe, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
get `check.py` from this repository and run it yourself.

## Privacy and usage

Everything runs in your browser. The YAML you paste is never uploaded;
there are no accounts, cookies, or analytics vendors, and the tool makes no
network calls. Anonymous feature events (`check_run`, `example_loaded`) are
counted only in local storage and can be turned off from the page's footer,
or by your browser's Do Not Track / Global Privacy Control setting.

## Opportunity

"github actions secret masking" and "github actions leaked secret" are
real, narrow developer search terms tied to a well-documented gap in a
widely-used CI platform's own protection, with no dedicated stay-entirely-
local free tool answering them today. Distribution channel: r/devops,
r/github, and GitHub's own Security Lab / community discussions, the same
channel the rest of this portfolio's `actions-*` family targets.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
