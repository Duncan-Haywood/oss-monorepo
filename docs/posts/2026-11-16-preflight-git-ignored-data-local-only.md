---
title: "The preflight that failed on a file CI never sees"
date: 2026-11-16
tags: [process, ci, tooling, agents]
description: "venture-preflight now lists git-ignored files the local build would publish and stops counting check.mjs failures on them, since CI's checkout lacks them."
---

Every venture change in this repository runs `node platform/pages/venture-preflight.mjs <slug>` before it merges. It builds the whole site locally and runs `check.mjs` over it, so a run learns about a broken page in six minutes rather than one CI round later.

On 2026-11-15 a changepoint-detector run fetched a public evaluation set into `ventures/changepoint-detector/utsa-data/`. The venture's own `.gitignore` lists that directory, so git never saw the data. The site builder did, though. `copyTree` walks the directory on disk, not the git index, so it copied a `.ppt` from the dataset into the local site. `check.mjs` then failed the preflight because nothing says how the site should serve `.ppt`. CI starts from a fresh checkout with no such directory, so it would have passed. The run lost a preflight round finding this out, and moved the data out of the venture to get past it. Its run record notes that the venture's other fetch scripts (`tssb-data/`, `has-data/`) default to the same kind of place.

## Why not skip ignored files in the build

That was the run's suggestion, and it would be wrong. Some ignored paths are build outputs that CI makes and the site must publish. The root `.gitignore` lists `ventures/einvoice-preflight/browser/` and shed-designer's generated size pages, and the deploy serves both. A builder that skipped everything git ignores would drop them from the live site.

## What changed

- **A note in the fast step.** In step 1b (seconds, before the build) the preflight now asks git for the ignored, untracked paths under the venture, using `git ls-files --others --ignored --exclude-standard --directory` and `git check-ignore -v`. It keeps the ones the build would publish, using the builder's own rules (`copiesDir`, now exported from `build.mjs`, and `isPublishable`). It leaves out any path whose rule is a root `.gitignore` line naming `ventures/`, since those are CI's build outputs. It prints what is left: "1 git-ignored file(s) under ventures/changepoint-detector that this local build publishes and CI's checkout lacks".
- **Demoted failures.** In step 2, a `check.mjs` failure on this slug whose path is one of those files is printed as a note and does not fail the preflight. Real failures on the slug still do.

To check it, I planted `utsa-data/x.ppt` and ran the preflight. Step 1b listed the file. Two unit tests in `platform/pages/venture-preflight.test.mjs` cover the filtering (a CI output rule, `__pycache__`, a `.py` and a dot-directory are all dropped) and the demotion, including a venture that publishes from a subdirectory. The test numbers and the full build's output are in the run record.

## Two smaller fixes in the same PR

- `pyenv.py` used to end every successful call with "pyenv: shell variables not kept between commands?". Four run records said it read like an error. It now says "ok", gives the path, and offers the `-- <args>` form as a tip.
- `quality_metrics.py` described fix mode as "fix the queue, then re-audit". The quality README says the re-audit belongs to a later round, and three runs reported the contradiction. The tool now says the same as the README.
