---
title: "Start here: developers, pick the part of the repo that matches your stack"
seo_title: "Contribute to open source by stack: JavaScript, Python, Next.js, MCP"
date: 2026-11-03
tags: [start-here, developers, contributing, open-source, javascript, python]
description: "A map of a 1,300-tool open-source monorepo by stack: plain-JS calculators, Python checkers, apps, the site builder, MCP and research code, with test commands."
---

# Start here: developers, pick the part of the repo that matches your stack

This guide is for developers deciding where in this repository to spend an evening. You may write plain JavaScript, Python, TypeScript and React, or build developer tooling. You may want a first open-source contribution, a real codebase to practise on, or simply to fix the tool you used and found wrong.

The repository is large and unusual. AI coding agents open and merge most of its pull requests, and one person steers them. That makes it a good place to contribute in some ways (small, self-contained directories; fast tests; plenty of honest "not yet tested" notes) and a strange one in others (`main` moves many times a day; fork pull requests wait for a person). This page says which corner fits which skills, with the commands that work today.

If you have never sent a pull request here, read [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) first. It covers the fork, the sparse clone that avoids the 5 GB history, and how review works.

## The map, by stack

These counts were taken on 2026-11-03 from the tree on `main`, with the commands shown.

| If you write... | Work on | How many | Tests |
|---|---|---|---|
| Plain JavaScript, no framework | Browser calculators in `ventures/<slug>/`: `calc.mjs` holds the arithmetic as pure functions, `index.html` the page | 991 with `calc.mjs` and `index.html` (`ls -d ventures/*/` filtered on both files); some use another file name, so more | `node --test` in the directory |
| Python | Command-line checkers (`check.py`, often with a browser port in `classify.mjs`) | 25 (`ls ventures/*/check.py`) | `python3 -m pytest -q` |
| Python, numerical or scientific | Research projects in `research/<project>/`: `src/`, `tests/`, `experiments/` | 1,064 directories, 909 with a `pyproject.toml` | `python3 -m pytest -q` in the project |
| TypeScript, React, Next.js | Apps with their own `package.json` | 14 (`ls ventures/*/package.json`), 5 on Next.js | Per the app's README, after `npm install` |
| Build tooling and static sites | The site builder, `platform/pages/build.mjs`, and its checks | One builder serving every page | `cd platform/pages && node --test "*.test.mjs"` |
| Developer tools and agents | The MCP server and CLI in `platform/agents/tools.mjs`, the BYOK model client `platform/llm/byok.mjs`, the UI tester `platform/uitest/` | A handful of focused packages | See each README |
| CI and Python scripting | About 80 check scripts in `platform/ci/`, most with a `test_*.py` | | `python3 -m pytest -q platform/ci/test_<name>.py` |

## Which corner suits a first contribution

**The browser calculators** are the shortest loop in the repository. Most have no dependencies and no build step, and a whole suite runs in well under a second. They are also where outside eyes help most: each one encodes a trade's assumptions, and a test for an edge case the agents did not think of (zero, a negative, a huge input, another locale's number format) is a real improvement. `docs/contributing/fix-a-tool.md` lists the changes that are welcome, including "Accessibility fixes: labels, focus order, contrast, keyboard use." and "A broken link or layout on a phone."

**The Python checkers** come in pairs: `check.py` for the command line and `classify.mjs` for the browser, kept in step by a parity test. If you change one, change both, or the parity test fails. That makes them a good exercise in porting logic carefully between two languages.

**The research projects** suit people who read papers. Each has a README stating its question and what was measured, and many say which result has not been reproduced. Reproducing one, or finding where it breaks, is a contribution in its own right: [Reproduce a result](2026-10-30-start-here-reproduce-a-result.md) shows what a useful report contains. After changing one, also run `python3 research/_homepage/build.py`, which must print `ok`.

**The site builder and checks** suit people who like tooling. Seven browser checks in `platform/pages/` (customer journey, does every tool still compute, contrast, phone reflow and others) need Playwright and run outside CI. `platform/ci/browser_checks.py` runs them together, and its header says plainly: "No CI check covers this ground". Making any of them faster or easier to run is useful work.

**The MCP server** suits people building with AI agents. `node platform/agents/tools.mjs mcp` speaks MCP over stdio with four tools (`search_tools`, `describe_tool`, `call_tool` and `run_cli`) so an agent in Claude Code, Cursor or another client can call any calculator's engine. [Tools for your AI agent](2026-10-29-start-here-ai-agents-and-mcp.md) covers it.

## Your first thirty minutes

1. Pick a row of the map above.
2. Sparse-clone only that directory, as [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) shows: `git sparse-checkout set ventures/<slug>`.
3. Read the directory's `README.md`. Many end with a "not yet tested" or "Wanted" list; that is your task list.
4. Run its tests before you change anything, and keep the output.
5. Make one change, with a test that fails before it and passes after.

To see which CI checks your change would trigger, `python3 platform/ci/run_workflow_locally.py --for-changes` runs them from your machine. It needs a fuller checkout than one directory.

## There is no "good first issue" label, and why

Work here is queued in files, not GitHub issues, so the usual labels are missing. The equivalents are in the tree:

- **"Wanted" and "Not yet measured" lines in READMEs.** `grep -rn "Wanted\|Not yet measured" ventures/<slug>/README.md` finds them.
- **The Open Tennis Robots hardware notes**, which do have a heading for it: "Open questions (good first issues)" in `ventures/open-tennis-robots/hardware/feeder-catcher.md` and `collector.md`.
- **Unchecked boxes** in `VENTURE_QUALITY_STATUS.md`, including accessibility audits that have not been done.

If you want to propose something larger, a new tool, a change to `platform/` or across many tools, or a new dependency, open an issue first. The default answer to adding a dependency, a network call, analytics or payment code to a browser tool is no.

## House rules that matter to developers

- **MIT only.** Contribute only code you can license under MIT, and credit what is not yours.
- **No trackers or network calls in browser tools.** The one in-browser usage counter, `usage.mjs`, honours Do Not Track; leave it alone.
- **Keep the disclaimer.** Every user-facing tool says what it is not. A PR that removes one will not be merged.
- **Paste your test output.** A fork's CI runs the fork's own workflows, so the reviewer relies on the output you paste.
- **A person reviews fork PRs.** Agents never review, check out, run or merge a pull request from a fork. There is no promised response time.
- **Merge `main` in, do not rebase.** `main` moves fast; [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) shows the shallow-clone merge that works.

## Cost and data

Free. The browser tools need nothing but Node 22 and a browser. Research projects need Python 3.12 and, for some, `numpy`. The apps with a `package.json` install their own dependencies.

## What this does not cover

Steering the agent sessions themselves needs write access; [`docs/contributing/steering-agents.md`](../contributing/steering-agents.md) describes how the maintainer does it, and [Run agents on your own repo](2026-10-30-start-here-run-agents-on-your-own-repo.md) shows how to copy the setup.

## Where to go next

- Toolchain and running the site locally: [`docs/contributing/setup.md`](../contributing/setup.md)
- The tool shapes, with a worked fix: [`docs/contributing/fix-a-tool.md`](../contributing/fix-a-tool.md)
- Accessibility and design work: [Start here: designers and accessibility specialists](2026-11-03-start-here-designers-and-accessibility.md)
- Developers shipping LLM features: [LLM cost and safety tools](2026-10-30-start-here-llm-cost-and-safety-tools.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
