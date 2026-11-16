---
title: "Two local CI false alarms, traced to a trigger block and a commit hash"
seo_title: "Two local CI false alarms traced to their causes"
date: 2026-11-16
tags: [process, tooling, ci]
description: "A research diff ran the whole site build locally, and a commit hash read as a post count. Both came from rules that matched more than they should."
---

Sessions in this repository check their own changes with `platform/ci/run_workflow_locally.py --for-changes`. The script reads the GitHub Actions workflows, works out which ones the diff would start, and runs their read-only steps on the local machine. Two kinds of complaint kept turning up in run records, and this week both were traced to one rule each that matched too much.

## A research diff ran the whole site build

Fifteen run records between 10 and 16 November said much the same thing. A research change started the catalogue's site build and its site-builder test suite on the local machine. That took ten minutes or more and often finished with no verdict, while the PR's own CI was green in under four.

The site workflow, `portfolio-pages.yml`, has two triggers. On a pull request it runs only when the diff touches a site input: products, posts, the research homepage and a few others. Plain research READMEs aren't in that list. It also runs on every push to `main`, with no path filter, because every merge redeploys the site.

The local script asked whether any trigger matched. The push trigger has no path filter, so it matched every diff. But that trigger only fires after the merge. It never runs on the change being checked.

Now, when a workflow has a `pull_request` trigger, the script judges the diff by that trigger alone. A workflow that only runs on push still uses its push filter. `portfolio-pages.yml` is the only workflow in the repository that has a filtered PR trigger and an unfiltered push trigger, so it's the only one whose selection changes. A change to `research/_audit/README.md` now starts 6 workflows instead of 7.

The saving is smaller than fifteen complaints suggest. All 300 merges to `main` since 14 November touched a post or a product, and both still start the site build. That's correct, because the PR's CI builds the site for them too. So the time is saved mostly on research sweeps run before the post is written. What's fixed is that the local tool now picks the same workflows as the PR, which is the point of having it.

## A commit hash that read as "86540 post"

One session got a local failure from the site check that the same job didn't give on CI. It said `engineering/index.html` held a count written without a thousands separator: "86540 post".

The engineering page lists recent commits. When a commit has no PR number, it prints the first eight characters of its hash, then the title in the next column. The check strips HTML tags before it looks for counts. So a hash ending in `…86540`, next to a title that starts "post front matter…", becomes the text "…86540 post front matter". The count rule looks for four or more digits followed by a counted noun, and it didn't require the digits to begin a word.

Which commits lack a PR number depends on the clone, so the failure appeared in some local builds and not others. The digits must now start a word, and two new test cases cover a hash followed by a title.

## What's left

A post still starts the full site build locally, and that build is slower here than on CI. The front matter check runs first, so a bad post still fails within seconds. The rest of the build is a cost the PR's CI covers anyway.
