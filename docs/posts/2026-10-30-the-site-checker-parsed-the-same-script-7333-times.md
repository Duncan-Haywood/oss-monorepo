---
title: "The site checker parsed the same script 7,333 times"
date: 2026-10-30
tags: [engineering, ci, performance]
description: "Two thirds of the publish check was one subprocess per inline script, for 1,462 distinct scripts. Checking each once took it from 82 to 31 seconds."
---

Before the catalogue publishes, a checker reads the built site: about 19,500 files, 5,670 of them pages. It looks for dead links, pages no link reaches, sitemaps that list missing URLs, and inline scripts a browser would refuse to run. It took 82 seconds on a 4-core machine, and the publish waits for it.

Timing it section by section showed where the time went. **66 of the 82 seconds were the inline-script check.** It wrote every `<script>` block to a file and started a fresh `node --check` process to parse it: 7,333 processes. Only 1,462 of those scripts were different from each other. The rest were the site's own shared scripts (navigation, saved jobs, offline support), which every page carries. A script parses the same on every page it appears on, so the checker now parses each distinct one once and reports a failure against every page that carries it. That section now takes 13 seconds.

The link pass was the other slow part, at 22 seconds. It asked the disk whether each link target existed, one link at a time, even though the checker had already listed every file in the site at the start. It now looks the target up in that list and only asks the disk when the target is not there. It also reads files 32 at a time instead of one by one. That section now takes 7 seconds.

**Total: 82 seconds to 31.** To check that it still catches what it used to, we planted the same three defects (two broken scripts and a dead link) in a copy of the site. The old and new checkers reported them word for word the same.

The test suite had the same shape of problem in a different place. It builds the whole site about six times. Most of that time was drawing the PNG share cards, which the publish build has kept in a cache since last week and the tests never did. Two tests that each run a build of their own also ran after the main test file's build instead of alongside it. With the tests given their own cache and those two tests moved into their own files, the suite takes 208 seconds instead of 471. That suite is the slowest check on most pull requests.

What is left, in order, is in [the measurement notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-ci-speed-2026-10-30.md). The next steps are parsing the scripts in-process, a 90-second git checkout that only one step needs in full, and one build shared by the whole test suite.
