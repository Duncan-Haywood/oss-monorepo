---
title: "Start here: your first pull request, from fork to merge"
seo_title: "Your first pull request to the free tools repo, step by step"
date: 2026-10-30
tags: [start-here, contributing, pull-requests, open-source]
description: "A step-by-step first pull request for developers: fork, a small sparse clone, run one tool's tests, check the page, and open a PR a maintainer can merge."
---

# Start here: your first pull request, from fork to merge

This guide is for developers who want to send a change to one of the free tools here. You might have found a wrong default and want to fix it yourself. You might want to add a test for an edge case, tidy a confusing label, or fix a layout that breaks on your phone. You might simply want a first open-source contribution in a repository where most tools are a few files with no dependencies.

It walks through one pull request from start to finish, with the real commands. Nothing here needs more than Git, Node and, for some tools, Python.

## The problem, in your words

"The repo is huge, where do I even start?" "Do I need to build the whole site to test one calculator?" "Will anyone look at my PR, or does a bot close it?"

Fair questions. The full history is about 5 GB and a plain checkout of the tree is close to 1 GB, because it holds over 1,300 tools and their pages. Most of the repository is written and merged by scheduled AI coding sessions. Neither of those has to get in your way: you can work on one tool's directory alone, and fork pull requests go to a person, not a bot.

## What you get

- A change in a public, MIT-licensed tool that anyone can use.
- A short loop: most browser tools have no `npm install` and no build step, and their whole test suite runs in well under a second.
- A review by the maintainer, by hand.

## Before you start

You need:

- **Git** and a GitHub account.
- **Node.js 22**, which is what CI uses, for browser tools and their tests.
- **Python 3.12** (what CI uses; most tools work on 3.9+) for command-line checkers and research projects, plus `pytest` if the tool has `test_*.py` files. For a browser tool, Python is only used to serve the page locally.

Check with `node --version` and `python3 --version`.

## Step by step

### 1. Pick one small thing

Good first changes, from `docs/contributing/fix-a-tool.md`: a test for an edge case you hit (zero, a negative, a huge input, another locale's number format), a clearer label or FAQ answer, an accessibility fix, a broken link or layout on a phone, or a default you can source.

Discuss in an issue first if your idea is a new tool, touches `platform/` or many tools at once, or adds a dependency, a network call, analytics or payment code to a browser tool. The default answer to that last group is no.

### 2. Fork, then clone only what you need

Fork `duncan-haywood/oss-monorepo` on GitHub. Then clone your fork shallow and sparse, as `docs/contributing/setup.md` describes:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/<you>/oss-monorepo.git
cd oss-monorepo
git sparse-checkout set ventures/roofing-bid-calculator
```

That gives you the root files plus one directory, in seconds. Add more later with `git sparse-checkout add <path>`.

### 3. Find the tool's directory

Every tool lives in `ventures/<slug>/`, and the slug is the last part of its page address. The roofing calculator at `https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/roofing-bid-calculator/` lives in `ventures/roofing-bid-calculator/`. The catalogue, `ventures/README.md`, lists every tool.

Look at the files to see which shape you have. A browser calculator has `calc.mjs` (the arithmetic as pure functions), `calc.test.mjs`, `index.html` (the page) and `page.test.mjs` (structural checks on the HTML). A command-line checker has `check.py` and `test_check.py`, often with a browser port in `classify.mjs` that a parity test keeps in step: change both together. Read the tool's `README.md` before you edit.

### 4. Make a branch and run the tests first

```bash
git switch -c fix-roofing-<what>
cd ventures/roofing-bid-calculator
node --test
```

Run the tests before you change anything, so you know what green looks like. Here is what that command printed when this post was written, on Node 22.22.0 (the summary lines at the end of its output):

```text
1..133
# tests 133
# suites 0
# pass 133
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 319.085711
```

Run `node --test` with no path inside the directory; it finds every `*.test.mjs` there. For a Python tool, the equivalent is `python3 -m pytest -q`.

### 5. Make the change, with a test

Keep it to one thing. If you change the arithmetic, add a test that fails before your change and passes after it. The existing tests show the house style: each test name states the rule it pins, for example "a second tear-off layer doubles dump and tear-off hours, not the new covering".

If you change a figure, search for it everywhere in the directory first:

```bash
grep -rn "480" .
```

A number from `calc.mjs` is often repeated in the FAQ text in `index.html`, in the FAQ's JSON-LD (what search engines read) and sometimes in the explainer pages beside it. In the roofing directory, that search finds the standing-seam metal preset ($480 a square) three times: in `calc.mjs`, in the JSON-LD at the top of `index.html` and in its visible FAQ text. Change them all together, or the page contradicts itself. And bring a source: the repository's rule is that a default is either sourced or honestly labelled as a ballpark. (The roofing presets are labelled exactly that way in a comment above `MATERIAL_PRESETS`.)

Then run `node --test` again and keep the output.

### 6. Look at the page

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/` and use the page the way a visitor would. Check that the first result on load and the FAQ agree, that the no-warranty footer is still there, and, if you touched layout, that it works at phone width.

### 7. Commit and push

```bash
git add -A
git commit -m "roofing-bid-calculator: <what changed, in one line>"
git push -u origin fix-roofing-<what>
```

### 8. Open the pull request

GitHub offers a "Compare & pull request" button after the push. In the description, say:

- **what was wrong**, and how you know (a source, a reproduction with inputs);
- **what you changed**, in which files;
- **the test output**, pasted in full or as the summary lines.

Pasting the output matters. CI runs on a fork PR, but a fork runs its own branch's workflows, so a green check only proves your branch passes its own checks. Your pasted run is what the reviewer reads.

If you edited Markdown, `python3 platform/ci/check_md_links.py <files>` catches relative links that point at nothing (that script is in `platform/ci/`, so add that path to your sparse checkout first).

## What the maintainer looks for

From `CONTRIBUTING.md` and `docs/contributing/fix-a-tool.md`:

- **Small and focused.** One tool, one fix, one test. A sweeping change across hundreds of tools is very hard to review by hand.
- **Sourced.** A changed figure comes with where it is from, and, for tax and fee tools, the date you read the page, because those change every year.
- **MIT-compatible.** Only code you can license under MIT. No pasted code, copy or assets from a project under an incompatible licence; credit what is not yours. By contributing you agree your contribution is MIT licensed.
- **The disclaimer kept.** Every user-facing tool says what it is not. Removing it will not be merged.
- **No trackers.** No analytics, trackers or network calls in a browser tool. Leave `usage.mjs`, the in-browser usage counter that honours Do Not Track, as it is.
- **Nothing secret or personal** in code, tests, commits or the PR text.
- **Never fabricated.** No invented numbers, test results, reviews or user counts.

## When `main` moves on

It will. Agent sessions merge many pull requests a day, so expect your branch to be behind within hours. Bring `main` in when you are ready for review:

```bash
git remote add upstream https://github.com/duncan-haywood/oss-monorepo.git
git fetch --depth 50 upstream main
git merge upstream/main
```

Because your clone is shallow, Git may not find the common ancestor and refuse the merge as unrelated histories. Fetch more history (`git fetch --deepen=200 upstream main`) and try again, rather than fetching the whole 5 GB. Resolve any conflict, rerun the tests and push.

## Honest timing

- **A person reviews fork pull requests by hand.** The agents that work on this repository are not allowed to review, check out, run or merge a pull request from a fork. That rule protects a public repository; it also means your PR waits for the maintainer.
- **There is no promised response time.** It may be quick or it may take a while.
- **Once merged, it is live** on the next site deploy. There is no release step.

If you mainly want a figure corrected and do not mind who writes the code, an issue is often faster than a PR, because agents can act on a sourced issue. [Start here: you spotted a wrong number](2026-10-30-start-here-report-a-wrong-number.md) covers that route.

## What this guide does not cover

- Building the whole site. That needs a full checkout and `node platform/pages/build.mjs`; see `docs/contributing/setup.md`, "Build the site locally".
- Research projects, which have their own guide: `docs/contributing/research.md`.
- Steering agent sessions directly, which needs write access: `docs/contributing/steering-agents.md`.

## Where to go next

- Setup and checks: `docs/contributing/setup.md`
- The three tool shapes and a worked wrong-default fix: `docs/contributing/fix-a-tool.md`
- Ground rules: `CONTRIBUTING.md`, "Ground rules"
- The wider picture: [Start here: how to help, starting with an idea](2026-10-29-start-here-contributing.md)
- Running your own copy instead: [Start here: self-hosting](2026-10-29-start-here-self-hosting.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
