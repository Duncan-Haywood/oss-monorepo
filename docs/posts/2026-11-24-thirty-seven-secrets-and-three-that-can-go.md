---
title: "37 secrets in our workflows, and 3 that no longer need to exist"
date: 2026-11-24
tags: [security, github-actions, oidc, trusted-publishing, pypi, npm]
description: "Every secret our GitHub Actions read, listed: 37 names, 24 long-lived. A CI check keeps the list true; the PyPI, npm and Homebrew jobs move to OIDC."
---

This repository runs 129 GitHub Actions workflows. Until today nobody had
written down which secrets they read. The setup docs named some, the
hardening guide named others, and the rest lived only as a `${{ secrets.X }}`
somewhere in a YAML file.

So this run counted them. A script parses every workflow, collects each
`secrets.NAME` inside a `${{ }}` expression, and notes the job's environment.
It skips comments and file names, so `worker-secrets.json` in a shell line is
not counted. In
[`oss-monorepo`](../security/secrets-inventory.yaml) the result was **37
names**. The private product repository adds 27 more.

## What the 37 are

| Kind | Count | Example |
|---|---|---|
| Built-in, short-lived | 1 | `GITHUB_TOKEN` |
| Not credentials at all (IDs, an address, a handle) | 9 | `CLOUDFLARE_ACCOUNT_ID`, four GitHub App IDs, `EMAIL_FORWARD_TO` |
| Alternate spellings of another secret | 3 | `CLOUDFLAREAPITOKEN`, `CLOUDFLARERESTRICTEDAPIKEY`, `CLOUDFLAREACCOUNTID` |
| Long-lived credentials | 24 | registry tokens, a Cloudflare token, social API keys, app private keys |

The spellings are the clearest sign of a click-ops problem. The Cloudflare
deploy token is read under three names, because over time it was saved under
three. In the private repository, the same token has six names in a single
`||` chain. One of those names also accepts a Cloudflare *Global API Key*,
which can do anything the account login can.

## A list that cannot go stale

An inventory is only useful while it stays true. So
[`platform/ci/secrets_inventory.py`](../../platform/ci/secrets_inventory.py)
fails CI in four cases:

- a workflow reads a secret the inventory does not list;
- the inventory lists a secret that no workflow reads;
- an entry's `workflows` or `environments` no longer match the files;
- a secret marked `retired` is read again.

Each entry records the provider, what the secret can do as far as the repo's
own docs say, where it is read, which GitHub environment must hold it, how it
rotates (`short-lived`, `scheduled` or `manual`), and what the owner still has
to do. No entry holds a value, and the check fails on anything that looks
like a GitHub, PyPI, npm or Anthropic token, or a private key.

## Three secrets that can go

Three of the 24 long-lived credentials exist only to upload packages: a PyPI
API token, an npm token and a GitHub personal access token for the Homebrew
tap. PyPI and npm now support trusted publishing. The workflow asks GitHub for
an OIDC token that names the repository, workflow file and environment. The
registry checks those against a publisher the owner registered once, then
issues a credential that lasts minutes and works only for those packages.
Nothing is stored, so there is nothing to leak or rotate.

The changes:

- The PyPI scripts gain a `PYPI_DIST_DIR` mode that builds the packages and
  stops. `pypa/gh-action-pypi-publish` then uploads them with no password and
  attaches attestations.
- The npm scripts detect GitHub's OIDC endpoint and publish with npm 11.21.2
  and `--provenance`.
- The Homebrew job mints a one-hour token from a GitHub App installed on the
  tap repository only.

One limit came up in the tests. npm attaches a trusted publisher only to a
package that already exists, and none of the eight npm packages exists yet.
On the OIDC path the script now skips a name the registry does not have and
logs it for a one-time first publish by the owner; it does not fail.

The owner's side is a table of form fields, one row per package, in
[`trusted-publishing-setup.md`](../security/trusted-publishing-setup.md),
followed by the three secrets to delete. The workflow edits touch
`.github/`, so they wait in their own pull request for the owner's approval.

## What stays manual, and why

Of the other 21 long-lived credentials, four are the review bots' GitHub App
keys, which already mint one-hour tokens. Two are values the apps generate
for themselves: a session-signing key and a docs passcode.

Two more had not been set up at the last usage report, and each has a better route
written down. Search Console can use Workload Identity Federation, and the
traffic reader can use a GitHub App.

The remaining 13 belong to services with no OIDC route from GitHub Actions
today: Cloudflare, the social and newsletter APIs, Anthropic, OpenCode and
Vercel. The private repository adds Resend, Paddle and Slack to that list.
For those, the inventory records what can still be done:

- one name per secret instead of six;
- an expiry where the provider supports one;
- a spend limit where money is involved;
- storage in the one GitHub environment whose jobs need it.
