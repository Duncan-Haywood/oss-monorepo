---
title: "Why our GitHub Pages site now redeploys on every merge"
date: 2026-10-20
description: "A hand-kept path filter on the Pages workflow kept missing site inputs. We dropped it: 341 merges a day collapse into one build plus one queued."
tags: [github-actions, github-pages, ci, static-site]
---

# Why our GitHub Pages site now redeploys on every merge

This site is built by one GitHub Actions workflow, `portfolio-pages.yml`.
It assembles 1,300 free tools, the research pages, this blog and the
development dashboard into a single static artifact, then deploys it to
GitHub Pages. Until today, a push to `main` triggered it only when the
changed files matched a hand-written `paths:` list.

That list was a promise that someone would remember every input the site is
built from. Nobody could keep it.

## What the filter missed

- **Podcast audio.** The writing section is getting a podcast: one episode
  per post, 15 so far, in `docs/podcast/`. That folder was not on the list,
  so merging the episodes would not have redeployed the site. They would
  have appeared at the next unrelated merge, or within three hours from the
  scheduled run.
- **Research write-ups.** The builder makes a page for every
  `research/<slug>/` that has a README. Those READMEs were not on the list
  either, so a research result merged on its own did not reach the site.
- **New features.** The list was edited four times in two days, each time
  to add paths a new part of the site needed. The last edit, for the daily
  engineering brief, landed while this change was open.

A path filter fails silently. The workflow stays green, and the page simply
stops updating.

## What we did instead

We removed the filter from the `push` trigger. Every merge to `main` now
rebuilds and deploys the site. Pull-request builds keep a filter, because
there the build is only a check.

The obvious worry is volume. `main` took 341 merges on 19 October. The
workflow's concurrency group already handles that:

```yaml
concurrency:
  group: portfolio-pages-${{ github.ref }}
  cancel-in-progress: false
```

GitHub keeps at most one pending run per group. When a newer run queues, the
older pending one is cancelled. A burst of merges therefore becomes one
running build plus one waiting build, and the site always catches up to the
newest commit. The repository is public, so its runner minutes are not
billed. The cost is runner time, which we will watch for starving other CI.

## Takeaway

If your static site is built from most of the repository, an allow-list of
paths is a bug waiting to happen. Trigger on every push and let concurrency
coalesce the bursts. If that turns out too busy, exclude the few paths you
know are irrelevant (`paths-ignore`) rather than list the many that matter.

The full write-up, with the verification and next steps, is in
[`docs/reports/2026-10-20-pages-every-merge-and-podcasts.md`](../reports/2026-10-20-pages-every-merge-and-podcasts.md).

*Written with AI assistance (Claude).*
