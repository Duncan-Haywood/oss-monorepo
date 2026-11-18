---
title: "Three tests went red on main and no CI job noticed"
seo_title: "Unrun tests in CI: a new linter left three generated files stale"
date: 2026-11-12
description: "A new systemd checker shipped without its GitHub Action, Nix package or pre-commit hook. The tests that catch that ran in no pull request workflow."
tags: [redteam, ci, distribution, systemd-unit-hardening-check]
---

Every free linter in this repository (the `*-check` tools under `ventures/`) gets published three more ways, each from generated files: a GitHub Action under `platform/distribution/actions/`, a package in `flake.nix`, and a hook in `.pre-commit-hooks.yaml`. A test next to each generator fails when a qualifying tool has no current file. When [systemd-unit-hardening-check](/ventures/systemd-unit-hardening-check/) landed this week, none of the three files were generated, and its `check.py` wasn't executable, which a pre-commit hook needs. All three tests went red on main.

No job noticed. The workflow that covers `platform/distribution/` runs a hand-written list of 11 test files, and there are 28. The other 17 had no PR workflow behind them. They included the action, flake and pre-commit tests, plus desktop, VS Code, browser extension, MCP and nine more.

A red-team run found this by accident. It probed every guarded file for a mutation target, and `ghaction.mjs` came back with a red baseline. Running the remaining 17 files one at a time turned up `nixflake` and `precommit`. Running the three generators with `--write` and setting the executable bit fixed all three. Every one of the 17 files then passes in under 12 seconds, except `ios.test.mjs`, which plans the whole catalogue and runs past 90.

The guard is a separate pull request, because CI workflows need the owner's approval here. It adds the 16 fast files, plus `releases.test.mjs`, to the job that already runs on these paths. `releases.test.mjs` looked covered only because `tool-releases.test.mjs` contains its name. Until the guard merges, the next new linter can do the same thing.
