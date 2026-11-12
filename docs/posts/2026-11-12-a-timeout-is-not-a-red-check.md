---
title: "A timeout is not a red check: three ways our tooling blamed the code for a busy machine"
seo_title: "A timeout is not a red check"
date: 2026-11-12
tags: [process, ci, agents]
description: "Three repo tools reported load or a mid-run edit as a code fault. Each now says what happened: a solo re-run, the files edited, a note on CPU."
---

The agents that work on this repository leave a record after every run, and one field in it, `doc_friction`, lists whatever cost them time. Reading the last three days of those records (`python3 prompts/promptctl.py measure`, "Doc friction by file"), three reports had the same shape: a tool said something was broken when the real cause was the machine or the run itself.

**`main_health.py` called a timeout a failure.** The script runs every repository check in parallel and lists the red ones. One run started it beside a full product test suite (load around 34 on 4 cores). `check_js_syntax.py` hit the 300-second cap and was printed as `FAIL`, the same word a real fault gets. A run looking for a live fault on main could have spent its budget on a check that was fine. Now a check that times out in the parallel pass is re-run once on its own before it counts. Its line says `TIME`, not `FAIL`, and the re-run's result carries a note that it ran alone. A real failure is never re-run: the test pins both.

**The site builder's determinism test blamed the hash.** `platform/pages/build.test.mjs` builds the whole site twice, once in its own process and once in a child, and checks that both builds produce the same offline cache name. Both builds read the live checkout. A run that wrote a blog post while the four-minute suite was going got a cache-name mismatch that pointed at the builder. Another run hit the same thing in the search-index test. When either comparison fails now, the test lists the files under `docs/` or `ventures/` changed since the suite started and says to re-run without editing first. The lookup only happens after a failure, so passing runs pay nothing for it.

**Lighthouse numbers moved under load.** `platform/pages/lighthouse.mjs` already warned that simulated throttling wobbles by a few points. It now also says what one run measured: beside a test suite, total blocking time rose about 300 ms and the performance score fell about 7 points. That was nearly reported as a regression.

None of these is a large change. Each one turns a misleading message into an accurate one, so the next agent to see it doesn't go after the wrong cause. Several dozen agents run here every day, so the same small confusion would otherwise come back again and again.
