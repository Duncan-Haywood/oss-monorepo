---
title: "Quality fix: published packages pointed at a host we left, and a Python 3.11 module on a 3.9 floor"
seo_title: "Quality fix: package homepages on the retired host"
date: 2026-11-14
tags: [quality-audit, platform, distribution]
description: "A fix-mode session closed three defects in platform/distribution: stale package homepages, a tomllib import on Python 3.9, and a Homebrew string cut mid-escape."
---

This session ran the quality programme in `fix` mode (`python3 platform/ci/quality_audit.py mode` drew it; no high-severity defects were open, so it took mediums from the queue). It closed three of the six defects in the [2026-11-07 audit of `platform/distribution`](../../portfolio/quality/audits/2026-11-07-distribution.json), the code that turns the repository's tools into npm, PyPI, Homebrew, store and desktop packages. The audit's scores were given before these fixes and stay as they are; a later round re-audits.

## Every package would have shipped a dead-end homepage

The site moved to `https://marisstella.app/` on 2026-10-30. The old github.io address only redirects. But `bluesky.mjs` and `hub/compose.mjs` still defined `BASE_URL` as the github.io one, and everything else imported it: npm `homepage`, PyPI `Homepage`, the Homebrew formula, the MCP registry entry, the Android and desktop manifests, and the 21 committed GitHub Action READMEs. An npm or PyPI release can't be edited after publish, so each package would have carried the old address until its next version.

The fix moves `BASE_URL` to the served host and keeps one definition, which the hub now re-exports. The reverse-DNS app ids (`io.github.duncanhaywood.<tool>`) had been built from the first label of the site's hostname. Changing the host would have quietly renamed every Android, iOS and desktop app id to `io.github.marisstella.*`. They now come from a separate `PUBLISHER` constant, the GitHub owner. A test pins one id so a future host move can't rename them. The social-post metrics reader now recognises both hosts and files old posts under the new page, so readings for one tool stay together.

Regenerating the action READMEs (`ghaction.mjs --write`) rewrote only the docs link in each. `versions.mjs --write` bumped 10 npm tools one patch version, because their shipped `package.json` changed.

## A module the declared Python can't import

The PyPI builder's allow-list of stdlib imports included `tomllib`, which arrived in Python 3.11. The generated `pyproject.toml` declares `requires-python = ">=3.9"`. A tool that imported `tomllib` would therefore install on 3.9 and 3.10 and fail on first run. `tomllib` is off the list now, and the floor is a named constant, `PYTHON_FLOOR`. A test checks each listed module against the floor.

## A Homebrew description cut in the middle of an escape

`homebrew.mjs` escaped the description for Ruby, then cut it to 80 characters. With 79 plain characters followed by a quote, the cut kept the backslash and dropped the quote it escaped, so the `desc "..."` line ended early. It now cuts first and escapes after.

## Did the tests catch the old code?

`platform/ci/quality_mutate.py` put each old line back in a private copy. The new `published-host.test.mjs` failed both times: once with `tomllib` back in the allow-list, and once with escape-then-cut. The distribution suite passes with these changes (run output in this PR's run record).

## Still open

The audit's other three defects are low severity. Two are still open:

- The import allow-list admits `os` and `shutil`, so `os.system` gets through.
- The Homebrew `test do` block only checks that the binary exists.

The third said the `ios.test.mjs` catalogue test took over four minutes. It no longer reproduces: today the whole suite, `node --test '*.test.mjs'`, ran 248 tests in 10.6 s, all passing. Some earlier change fixed it, so this session didn't. The next re-audit should close it. All three are in `python3 platform/ci/quality_audit.py queue`.

Two generated files were already stale on `main` before this change: `node platform/distribution/citation.mjs --check` reports `CITATION.cff` and `research/CITATIONS.bib`. This PR leaves them alone: their `url` line already names the served host, so what is stale is something else.
