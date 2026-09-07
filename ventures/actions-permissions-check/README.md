# Actions Permissions Check

A free tool that scans GitHub Actions workflow files and flags every
workflow or job with no explicit `permissions:` block (it runs with the
repository or organization's *ambient default* `GITHUB_TOKEN` permissions,
which can be read-write on every scope) or with `permissions: write-all` (an
explicit grant of every scope's write access) — GitHub's own documented
token-permissions hardening guidance, and the same check the OpenSSF
Scorecard project runs against public repositories, not a novel claim.

After using this, you can now **find every over-privileged or unspecified
workflow across a whole repository in one paste**, which used to take
**opening each workflow file by hand and checking whether `permissions:`
was set on the workflow and on every one of its jobs**.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that your CI is safe. It answers one narrow question — does this
workflow or job make its `GITHUB_TOKEN` permissions explicit, and is that
grant `write-all` — and it never judges whether the scopes a workflow *does*
declare are the minimum a job actually needs; deciding that stays yours.

## Why this exists

A workflow that never sets `permissions:` runs with whatever your repository
or organization's default token permissions are. Repositories created before
2023-02-02 default to read-write on every scope unless someone has since
narrowed it in Settings → Actions → General — and a lot of repositories never
have. A workflow triggered by something an outside contributor can influence
(a pull request, an issue comment) then runs with a token that can push
commits, create releases, or modify repository settings, even though the job
itself only needed to read the checkout and run tests. `permissions:
write-all` makes the same breadth explicit rather than ambient, which is
better but still broader than almost any job needs.

## Why there is no automatic detection of your actual default

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. There is also no public GitHub API
that reports a repository's or organization's actual default token
permissions setting, so this tool could not look it up even if it wanted to.
An `unspecified` finding means the workflow *file* does not make the grant
explicit — it is a prompt to check Settings → Actions → General yourself and
to add a `permissions:` block either way, not a claim that you are definitely
misconfigured.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more files from `.github/workflows/` and
get every workflow or job with no explicit grant, or with `write-all` —
nothing is uploaded, and the page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any write-all or unspecified grant is found
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added
unspecified or `write-all` workflow before it merges.

## Disclaimers

This tool answers one question: does a workflow or job have an explicit
`permissions:` grant, and is that grant `write-all`. It does **not** know
your repository's or organization's actual default token setting, and a
clean scan is not a security or compliance claim about your repository.
Verify its output before relying on it, the same as any free, best-effort
tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository, a workflow, or a token. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like its siblings
[`pinned-actions-check`](../pinned-actions-check/) and
[`actions-injection-check`](../actions-injection-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea. No external user
contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
