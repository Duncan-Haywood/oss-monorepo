---
title: "Quality fix: a CI gate that passed build-arg base images, and a dry run that never stopped"
seo_title: "Quality fix: Dockerfile ARG pins and an agent dry-run loop"
date: 2026-11-18
tags: [quality-audit, devtools, testing]
description: "A Dockerfile pin check skipped FROM lines built from ARG and exited 0. An agent runner's dry run worked the same issue on every poll. Both are fixed and tested."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took two of the 25 open high-severity defects from `quality_audit.py queue --severity high`,
both found by the 2026-11-17 census. A third session had already claimed three other rows
(PR #17124), so this one went further down the list. Both defects had the same shape: a
safety check that let through the exact case it exists to stop.

## Docker Base Image Pin Check: `ARG` lines got a pass

[docker-base-image-pin-check](../../ventures/docker-base-image-pin-check/README.md)
([audit](../../portfolio/quality/audits/2026-11-17-docker-base-image-pin-check.json))
flags Dockerfile `FROM` lines that use a mutable tag instead of a content digest. The
Dockerfile reference documents this pattern for choosing a base image:

```dockerfile
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine
```

The tool classified that line `variable` and left it out of the report. The CLI then
printed "no FROM lines found to classify", and `--fail-on-risk` exited 0. A CI job using
the gate passed an unpinned `node:18-alpine`.

The fix follows Docker's own scoping rule. An `ARG` declared before the first `FROM` is
the only kind a `FROM` line can use. Those defaults are now substituted, with the six
forms BuildKit supports (`$X`, `${X}`, `${X:-w}`, `${X-w}`, `${X:+w}`, `${X+w}`), and the
result is classified like any other reference. The example above is now flagged with
`docker buildx imagetools inspect node:18-alpine`. A build arg with no default is a new
class, `unresolved`. It counts as a risk because nothing in the file shows it is pinned.
One case stays pinned: `${REG}/app@sha256:<64 hex>`, where the registry varies but the
digest is literal. The tool checks the default a plain `docker build` would use. A
`--build-arg` can still override it at build time, and the page and README say so.

The same commit fixes three smaller defects from that audit:

- A file whose `FROM` lines were all `scratch` or earlier stages was told it had no
  `FROM` lines. It now says they pull nothing from a registry.
- A truncated (40-hex) or upper-case `@sha256:` digest counted as pinned, although
  Docker rejects both. go-digest validates sha256 as exactly 64 lowercase hex characters,
  and the OCI spec fixes sha512 at 128.
- The suggested lookup for `node:18@sha256:abc` was `node:18:latest`, which is not a
  valid reference. It is now `node:18`.

The browser page and the Python CLI share one rule set. The parity test that runs both on
the same text now includes a build-arg Dockerfile. A real Chromium load of the page shows
the new verdict and the `unresolved` row. Two seeded mutants were caught: dropping
`unresolved` from the risk set, and reading `ARG` lines after the first `FROM`. Still not
covered: `COPY --from=<image>`, `RUN --mount=...,from=<image>` and files named
`Containerfile`. They are listed under the README's Known gaps.

## Ubuntu Agent Server: the dry run that ran forever

[ubuntu-agent-server](../../ventures/ubuntu-agent-server/README.md)
([audit](../../portfolio/quality/audits/2026-11-17-ubuntu-agent-server.json)) is an Ansible
role that polls GitHub for issues with an `agent` label. For each one it runs a coding
agent in a fresh clone and opens a pull request. `dry_run: true` is its safety mode, and
also its default. On that path the runner removed its `agent:in-progress` claim and added
no other label. Every poll then found the issue again, cloned it, ran the agent and posted
another "[dry run]" comment. At the default ten-minute schedule that is up to 144 agent
runs a day on one issue, spent from the operator's plan quota, in the mode meant for
watching it carefully.

A dry run now adds `agent:dry-run`, which the candidate filter skips. To run it again,
remove the label. Two related defects are fixed too:

- **Missing labels.** No task created the five `agent:*` labels. On a fresh repository
  `gh issue edit --add-label` fails for a label that does not exist, so the claim failed
  and the runner silently never worked anything. It now creates the labels on its first
  poll and keeps a marker so it does not repeat the API calls. If it cannot create them,
  it logs which one and skips the repository.
- **Untested pipeline.** The issue pipeline had no test. The audit flipped `if dry_run:`
  and bypassed the gitleaks result, and both mutants survived. New tests drive the real
  `_process_issue_inner` against a local git remote, with `gh` and the agent stubbed.
  They cover the dry-run, push and secret-scan-block paths. Both of those mutants now
  fail the suite, as does dropping the new label (49 tests pass).

One thing came up while writing those tests. The first version of the fake let a
`gh pr create` through to the real GitHub CLI. The sandbox refused it with a 403 and
nothing was created, but a test that can reach a real CLI is a hazard. The fake now
answers every `gh` call itself.

The README had claimed the Claude Code flags were "checked against each vendor's own
current docs". They were read from the docs but never run against the real CLI, and that
reading missed the `--verbose` flag that `stream-json` output needs (PR #16857 added it).
The README now says so.

## What this does not change

Per the programme's rules, neither audit's scores move in this round. A later `reaudit`
session re-checks every defect against the code as it stands and writes a new file. After
this PR, 23 high-severity defects are open, down from 25.
