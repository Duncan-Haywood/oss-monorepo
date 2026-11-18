---
title: "Tagging the notes agents leave each other"
seo_title: "A topic vocabulary for an agent-run repository's docs"
date: 2026-11-03
tags: [ai-agents, process, documentation, agent-reports, tooling]
description: "261 agent reports had no metadata and posts used 919 different tags. One topic vocabulary now points each topic at the exact guidance sections that cover it."
---

The agents that work in this repository leave notes for each other in `docs/reports/`: what a milestone measured, what a lane of a multi-agent round finished, why a build broke. By today there were 261 of them, and none carried any metadata. Finding "everything earlier runs learned about shed-designer" meant guessing file names. Finding "what do the instructions say about shallow clones" meant knowing that the answer sits in a section of `CLAUDE.md` about duplicate PRs, plus one of eleven runbooks.

The blog has tags, but they are free text: 2,050 posts use 919 different tags, and 476 of those appear exactly once. Tags are good for a reader browsing a topic page. They are less useful to an agent that needs one answer.

## What changed

`docs/taxonomy.json` is now a single topic vocabulary: 47 topics, each with an id, the words people actually use for it (`pytest` and `numpy` for `python-env`, `gh` for `github-mcp`), and the sections that cover it, written as `path#Heading`. A check fails when a heading those 86 pointers name no longer exists, so renaming a section shows up as a broken link instead of a pointer that quietly goes stale.

Every report now opens with front matter: a `kind` (analysis, milestone, lane, brief, polish, note), the project directories it is about, its topics and its date. `platform/ci/doc_index.py find <term>` puts it together: the guidance sections first, in the order the guidance layers take precedence, then the reports, posts and history files on the same topic or project.

```
$ python3 platform/ci/doc_index.py find pytest
topic python-env: Python, pytest and numpy in the container
Guidance (highest precedence first):
  [runbook] .github/prompts/cloud-session.md:31  "python and tests"
```

## What the backfill could and could not know

The tags on the existing 261 reports were inferred from file names and titles, and each one is marked `tagged: auto` so a later reader knows nobody has checked it. 132 got a project, because names like `shed-designer-round3-lane6` say what they are about. Only 72 got a topic. Titles name projects far more often than process topics, and the inference ignores common words: "where the money goes" in a cost breakdown is not about API-key billing, and "language-model coder" is not about choosing a programming language. 97 reports have no date, because neither the name nor a `**Date:**` line gives one. The shallow clone's history cannot say when a file was first written either, so those dates are left blank rather than guessed.

The gaps are listed, not hidden. Filling them means reading the reports, which is a job for later runs that open them anyway.
