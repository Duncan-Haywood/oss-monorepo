---
title: "A changepoint watch you can set up without a terminal: the repository built in your browser"
seo_title: "Set up a self-hosted metric alert without a terminal"
date: 2026-11-19
tags: [changepoint-detection, self-hosting, github-actions, product]
description: "The metric watch now builds its own GitHub repository as a zip in the browser and opens GitHub with the workflow filled in. No curl, no git, nothing sent to us."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s daily metric watch has run in the
user's own GitHub account since November. It refits a series each day and sends one Slack, Discord or Teams
message when the level has really moved. Setting it up meant pasting a `curl ... | sh` line into a terminal,
then running `git init`, `git add` and `git push`. The people most likely to want a ping when sign-ups or card
declines shift are not always people with a terminal open.

So the [watch page](../../ventures/changepoint-detector/watch-a-metric-for-changes.html#no-terminal) now does those
steps itself. You type the name of a repository you just created and, if you like, paste your rows. The page
fetches the watch's modules from its own site and builds the zip on your machine, with a small zip writer and no
library. Then it fills in four GitHub links: the upload page, GitHub's file editor with the daily workflow
already in it, the page for the one variable to set, and the button for the first run.

## Why the workflow is a link and not a file in the zip

GitHub Actions only runs workflows under `.github/workflows/`. A folder whose name starts with a dot is hidden
in Finder and in most file managers. So in a drag-and-drop upload, the one file that matters is the one most
likely to be left behind, without any error. GitHub's "new file" page takes a file name and its contents in the
address, so the page sends you there with the workflow filled in. You read it and press Commit.

## How we know the zip is right

There are now two ways to make the same repository, so they could drift apart. A build step reads the README,
the module list and the small files out of the shell script, and the test fails if the browser's copy is stale.
The test then unzips the browser-made zip with Info-ZIP and compares it with the folder the script writes: the
same files, byte for byte, apart from the workflow. Then it runs the unpacked watch on 130 pasted rows, and the
watch dates the planted step on the right day. In headless Chromium at phone width the page made a 463 KB zip
of 20 files, with no console errors.

## What we have not checked

We used no GitHub account. The links follow GitHub's address patterns, but nobody has yet opened them on a live,
brand-new repository. The first person to try will find out whether the upload page takes a first commit on an
empty repository. If it does not, the one-line script still works. Nothing on the page sends your rows, your
repository name or your webhook to us. Statistical analysis of data you supply, not advice.
