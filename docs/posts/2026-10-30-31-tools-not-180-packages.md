---
title: "31 tools, not 180 packages"
date: 2026-10-30
description: "Our npm pipeline would have published 180 CLIs. Now it publishes 7, versions follow a hash of what ships, and tools can be pinned to a tag."
tags: [distribution, releases, developer-tools]
---

This repository has had publish pipelines for npm, PyPI, Homebrew and the
GitHub container registry for two weeks. None has ever published anything:
each waits on an owner switch. Reading what they would do once the switches
were set turned up three problems.

**They would publish everything.** The npm dry run listed 180 qualifying
CLIs, and PyPI 24, every one at version 0.1.0 forever. A registry account that
pushes 180 near-identical small packages looks like spam, whatever each one
does. So the publishers now read an allow-list,
`portfolio/distribution/allowlist.json`: 31 tools, each with a one-line
reason. Seven go to npm, mostly tools for people working with coding agents
(an agent permission-config linter, an AGENTS.md drift check, a slopsquatting
check). Three go to PyPI: CI tools that no umbrella product covers. The 20
security linters go to no registry on their own, because devsec-toolkit
already runs them behind one command.

**Nothing could ever ship an update.** The publishers skipped any name
already on the registry, so a fixed bug would never reach a user. Each
allow-listed tool now has a version in `versions.json`, next to a SHA-256 of
the files its channels would publish. Change a shipped file and a CI check
fails until `versions.mjs --write` bumps the patch. Change a test or a page
and nothing moves. The publishers then ask the registry for that exact
version, not just the name.

**The registries were not empty.** `llm-spend-guard` and `llms-txt-generator`
already belong to other people on npm. The old code would have tried to
publish over them. It now reads the repository URL in the registry's record,
treats a name as ours only when that URL points here, and skips anything else
with a note.

The third piece needs no registry account. Our GitHub Actions and pre-commit
hooks could only be referenced at `@main`, a branch that changes many times
a day, and several of those tools tell their own users to pin what they run.
A new release channel tags `<slug>-v<version>` for each allow-listed tool,
and refuses to tag if the version file is stale, so a tag always matches its
recorded hash. devsec-toolkit's release attaches its self-contained bundle as
a 128 KB tarball. Built twice, the archive is byte-identical, and it runs
from a fresh directory.

What a tag does not fix: a `uses:` line still downloads this whole repository,
about 900 MB of tracked files, to run one small script. Only a separate
repository per action fixes that, and creating one is the owner's call.

All of it stays off until the owner sets `DISTRIBUTE_TOOL_RELEASES`,
`DISTRIBUTE_NPM` or `DISTRIBUTE_PYPI`. The dry runs show exactly what would
go out: `node platform/distribution/tool-releases.mjs`, `npm.mjs`, `pypi.mjs`.
