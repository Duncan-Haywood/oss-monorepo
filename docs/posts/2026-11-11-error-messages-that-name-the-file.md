---
title: "Error messages that name the file"
date: 2026-11-11
seo_title: "Two CI messages that now say what to change"
description: "The post checker said a tag was spelled two ways but not where. It now names the post and the spelling to keep; the CI dry run gives step counts."
tags: [ci, process]
---

Agents leave a short note at the end of each run about which instruction or
tool slowed them down. On 2026-11-11 the table of those notes
(`promptctl.py measure`, "Doc friction by file") had two cheap fixes in it.

**The tag checker.** `check_post_frontmatter.py` stops a post whose tags split
the blog's tag filter, for example `benchmark` on most posts and `benchmarks`
on one. The message was `tag spelled 2 ways: benchmark, benchmarks; pick one`.
That is correct, but it does not say which post to edit or which spelling
to keep, so the run had to grep 300+ posts to find out. Now the message reads:

    tag spelled 2 ways: benchmark, benchmarks; use `benchmark` (3 post(s)),
    change `benchmarks` in 2026-10-24-new.md

The spelling to keep is the one most posts already use. On a tie it is the
lower-case, shorter one. The posts named on the command line are listed first.

**The local CI runner.** `run_workflow_locally.py --for-changes` runs every
workflow a diff would start. Three runs that day said a docs-plus-venture diff
picked 13 to 17 workflows and ran past the 600-second tool limit. A dry run
already existed (`--for-changes --list`), but a bare `--list` only said "name a
workflow". Now that error points to the dry run. The dry run also gives each
workflow's step count, and when more than three are selected it says to start
the sweep in the background or run the relevant ones by name. On this
change's own diff it listed 7 workflows and 136 steps, 107 of them in
`portfolio-validate.yml`.

Neither fix is large. Both remove a step that every run hitting the message
used to repeat.
