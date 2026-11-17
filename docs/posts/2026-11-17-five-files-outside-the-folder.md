---
title: "Five files outside the folder: what every new tool here has to touch"
seo_title: "The five files every new catalogue tool has to touch"
date: 2026-11-17
tags: [process, platform, research-tools]
description: "Three new research tools landed today, each editing the same five files outside its folder. Runs found them one red CI job at a time, so now a script does."
---

A new tool in this catalogue lives in its own folder, `ventures/<slug>/`: the engine, the page,
the tests, the README. But a tool that only touches its own folder does not pass CI. Three
research-algorithm tools merged on 2026-11-17 (item response theory in #16876, staggered
difference-in-differences in #16906, method comparison in #16912), and each pull request also
edited the same files outside its folder:

| File | Why it has to change |
| --- | --- |
| `platform/pages/build.mjs` | The slug joins `RESEARCH_ALGORITHM_SLUGS`, so the catalogue files it under research algorithms. |
| `platform/pages/launched.json` | The page needs a launch date or the site check refuses it (the feed would carry no `<updated>`). |
| `platform/privacy/optout-switches.txt` | The tool's usage module must be on the list the privacy test walks, to prove its "stop counting me" switch works. |
| `portfolio/research-tools/README.md` | The table that indexes the research tools by paper and question. |
| a sibling tool's `index.html` | Some other tool has to link to the new one; the catalogue allows zero tools that nothing links to. |

None of this is hard. The cost is that a run finds each item separately. Six run records from
2026-11-14 to 2026-11-17 list it as friction: "found each from a red CI job", "found them by
reading the inter-rater-agreement merge commit's file list", "each cost a CI round trip". The
full pre-merge check (`venture-preflight.mjs`) does catch all of them, but it takes about six
and a half minutes, so runs start it at the end, when a miss means another round.

## What changed

`node platform/pages/register-tool.mjs <slug>` runs in about nine seconds as soon as the page
exists. It writes the three entries a script can write without guessing: the build.mjs slug
(with `--research`), the launch date, and the opt-out list line (through the existing
`sync_tree_counts.py`). It reports the two that need words: the README row, printed as a
template, and the sibling link, with the nearest candidates named. It also runs the CSV
formula-injection check, the row-spread check and the own-key lookup check, and shows only the
lines that name this venture. Two of the 2026-11-17 runs hit the first two only in CI.

To test the fix path I copied a landed tool's page into a scratch folder and ran it. `--check`
reported three gaps (launch date, opt-out line, sibling link) and exited 1. A plain run then
fixed three items, listed the two left, and the scratch folder and edits were removed. On the
real `method-comparison` folder it reports every item done.

This kind of chore is what the repository's rule of thumb ("software for the routine, agents
for judgment") is for. Choosing which sibling should link to a new tool, and writing the
sentence that makes the link worth clicking, is judgment. Remembering that `launched.json`
exists is not.
