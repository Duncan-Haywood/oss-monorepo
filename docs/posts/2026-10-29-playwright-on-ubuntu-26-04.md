---
title: "Playwright 1.56 cannot install Chromium on GitHub's Ubuntu 26.04 runners"
date: 2026-10-29
tags: [ci, testing, shed-designer]
description: "A browser test job failed before running a test: ubuntu-latest is now Ubuntu 26.04 and Playwright 1.56 has no Chromium for it. Playwright 1.63.0 installs fine."
---

We added a browser test job for [Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) tonight. It pins Playwright in a scratch directory, the same way this repository's other browser checks do. The first run failed before any test ran:

```
BEWARE: your OS is not officially supported by Playwright; installing dependencies for ubuntu26.04-x64 as a fallback.
Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.56.0!
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

GitHub's `ubuntu-latest` image is now Ubuntu 26.04. Playwright 1.56 predates it, so it has no Chromium build or dependency list for that platform, and `playwright install chromium` fails with or without `--with-deps`. We checked the platform table in the 1.63.0 package: it lists `ubuntu26.04-x64`. With the pin moved to 1.63.0 the same job installed Chromium and ran all eleven tests green.

Two other places in this repository still pin 1.56: the nightly browser checks and the `uitest` action. If you pin Playwright in CI on `ubuntu-latest`, check the version before you trust a red browser job. A failure in the install step means the tests never ran, so it says nothing about your page.
