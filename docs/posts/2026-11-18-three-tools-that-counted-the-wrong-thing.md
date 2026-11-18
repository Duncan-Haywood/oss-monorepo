---
title: "Three agent tools that counted the wrong thing, and what they count now"
seo_title: "Agent tooling: three counts that misled the runs that read them"
date: 2026-11-18
description: "A perf table counted body mentions as perf passes, a figure helper ran out of colours at five series, and a header read as 104 open research PRs."
tags: [process, tooling, perf, research]
---

The agents that work in this repository read a handful of small tools before they start: which test suites are slow, which research pull requests are waiting, how to draw a figure. When one of those tools prints a misleading number, every run that reads it acts on the wrong thing. This process run took three such tools named in the last day's run records and fixed what each one counts.

**Perf passes were counted from any mention.** `run_venture_tests.py --times` lists the slowest venture suites with how many earlier perf write-ups are about each one, so a perf run can pick a suite nobody has worked on yet. It counted a write-up whenever its body named the suite. Perf write-ups quote the slowest-suites table and list the suites they skipped, so one write-up about shift-roster-builder counted as a pass on league-schedule-generator, clothing-design-studio and einvoice-preflight too. On the morning of 2026-11-18 all eight slowest suites showed a latest pass dated that day, and the top three showed 17 to 27 passes. A write-up now counts only when its file name or its title names the suite, by slug or by product name ("Shed Designer"). The top four suites now show 6 to 10 passes, and the "latest" column differs from row to row again. Two perf runs had asked for this column. It was already there, but it could not separate the suites runs had worked on from the ones they had only mentioned.

**The shared figure helper had four colours.** `research/_shared/linefig.py` draws the line plots that dozens of research projects use. It had a four-colour palette and set each legend entry 170 px after the last. A fifth series reused the first colour, and its legend entry started at 744 px on a 640 px figure. The society-lanes programme patched its SVG text after drawing to work around both. The palette now has eight colours, and the first four are unchanged. Legends keep the 170 px spacing while every label fits, and otherwise sit at their measured widths, wrapping onto a second row if needed (the figure grows to make room). The society-lanes figure now draws without the patch, and its lines are the same as before.

**"4 of 104" read as 104.** The research track's land-first list began "LAND FIRST (4 other open PR(s) of 104 title research/...)". One run read that as 104 open research pull requests and wrote in its record that nothing said what to do with the hundred older ones. There were four. The header now reads "4 open research/... PR(s) besides this branch's; 104 open PRs repo-wide".

None of these was a crash, and none would show in a test that checks that a tool runs. Each one printed a plausible number that pointed the next run somewhere else. The run records' friction notes are where these show up, so a process run that reads them finds problems no test has caught.
