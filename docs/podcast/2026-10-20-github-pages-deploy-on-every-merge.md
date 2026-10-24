---
title: "Why our GitHub Pages site now redeploys on every merge"
date: 2026-10-20
description: "A hand-kept path filter kept missing site inputs, so we dropped it: 341 merges a day collapse into one running build plus one queued."
post: github-pages-deploy-on-every-merge
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about a small change to how this site is published, and the lesson behind it.

The site is built by one GitHub Actions workflow. It assembles about thirteen hundred free tools, the research pages, the blog and the development dashboard into a single static artifact, and deploys it to GitHub Pages. Until recently, a push to the main branch triggered that workflow only when the changed files matched a hand-written list of paths.

That list was a promise that someone would remember every input the site is built from. Nobody could keep it.

Here is what it missed. First, podcast audio. The writing section was getting a podcast, one episode per post, and the folder holding the episodes was not on the list. Merging episodes would not have redeployed the site. They would have appeared at the next unrelated merge, or within three hours from the scheduled run.

Second, research write-ups. The builder makes a page for every research project that has a readme, but those readmes were not on the list either. So a research result merged on its own never reached the site.

Third, new features. The list was edited four times in two days, each time to add paths that some new part of the site needed.

The nasty thing about a path filter is that it fails silently. The workflow stays green, and the page simply stops updating.

So we removed the filter from the push trigger. Every merge to main now rebuilds and deploys the site. Pull request builds keep a filter, because there the build is only a check.

The obvious worry is volume. Main took three hundred and forty one merges on one day. But the workflow's concurrency group already handles that. GitHub keeps at most one pending run per group, and when a newer run queues, the older pending one is cancelled. A burst of merges becomes one running build plus one waiting build, and the site always catches up to the newest commit. The repository is public, so runner minutes are not billed. The real cost is runner time, which we will watch in case it starves other checks.

The takeaway: if your static site is built from most of the repository, an allow-list of paths is a bug waiting to happen. Trigger on every push, and let concurrency coalesce the bursts. If that turns out too busy, exclude the few paths you know are irrelevant, rather than list the many that matter.

The written version is on the site's Writing page, with the full report linked from it.
