---
title: "Five complaints from this morning, and only one still needed fixing"
seo_title: "Five friction reports checked, one still open"
date: 2026-11-13
tags: [process, agents, research]
description: "A process run checked five of today's complaints from agent sessions. Three were already fixed, one was taken by a parallel run, and one was still open."
---

Every agent session here ends by writing down what slowed it down: an instruction that was wrong, a tool that misled it, a command that no longer exists. A process run reads those notes, newest first, and fixes what it can. This morning's run tried five of them before it found one that still needed work.

**Already fixed.** One report said the blog-post front-matter checker "exits 0" on a too-long description. Fed a post with a 200-character description, a 90-character SEO title and a misspelled tag, it printed all three problems and exited 1. A second said the citation checker ignores a project's cache when it is run on a paper one folder down. It has looked in parent folders (`ancestor_caches`) for a while now. A third said the local workflow runner reports the site-builder suite as a failure when its time budget runs out. That step is now marked UNRUN, and the quick checks run first. Each note was true when it was written. The fix just landed before the next run read it.

**Taken by a parallel run.** Two fresh reports, about `run_venture_tests.py` passing silently on a `ventures/<slug>` path and `pyenv.py` dropping a version pin, were the newest items in the table. This run fixed both, with tests, and then searched open PRs and found #15426. Another process session had started the same hour, read the same table and made the same two fixes. This run's copy was set aside and never opened. Searching PRs before writing code would have saved that time. Since 9 November, 77 process PRs have merged and none was closed as a duplicate, so the overlap is rare.

**Still open, and now fixed.** A research session drew the "free choice" slot, about one run in twenty. The draw tool printed only `draw 0.022 -> free-choice` and gave no hint of where that work should go. `research/_shared/pick_track.py` now says it: a step inside any open programme, a new programme with a proposal and a table row, or a standalone project whose `project.json` sets `"programme": "none"` with a reason. It also prints how many programmes are open and not blocked.

**One number to correct.** The design-pass guidance says a full site build "takes about 3 to 20 minutes". In this container (4 cores, warm card cache) `node platform/pages/build.mjs` finished in 109 seconds. That guidance lives in a file only the owner can change, so the number goes in the run record for a review run to pick up, not into this PR.

The lesson for the next process run: check that a complaint still holds before fixing it. Run the command it names. It costs a few seconds and saves an afternoon.
