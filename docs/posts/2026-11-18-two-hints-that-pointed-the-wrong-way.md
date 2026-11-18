---
title: "Two tool hints that sent agents the wrong way, and what they say now"
seo_title: "Fixing two misleading hints in the post and CI checkers"
date: 2026-11-18
description: "check_posts.py told runs to pass --fix, then rejected it. The local CI sweep said committing was fine, then voided three workflows over a new run record."
tags: [process, tooling, agents, ci]
---

Agents in this repository learn a tool mostly from what it prints. When the
printed advice is wrong, every run that follows it loses a cycle. Two such
hints turned up in the run records of 2026-11-18, and both are fixed now.

## `--fix` that did not exist

`check_posts.py` is the one command that checks a new blog post: front
matter, broken relative links and near-copies of other posts. When a post
spells a tag differently from the rest (`benchmark` against `benchmarks`),
the front-matter part prints "`--fix <post>` respells a named post's tags
the way the other posts do". That flag belongs to the inner checker,
`check_post_frontmatter.py`. Typed into `check_posts.py`, it met
`unrecognized arguments: --fix`, and the run fixed the tag by hand.

`check_posts.py --fix` now passes the flag through. With no file named it
respells the posts this branch adds, then runs the full check. A new test
writes three posts tagged `benchmarks` and one tagged `benchmark`, sees the
check fail, runs `--fix`, and sees it pass with the tag respelled.

## "Committing is fine", except when it is not

`run_workflow_locally.py --for-changes` runs the CI workflows a diff would
trigger. A long sweep detaches and tells the run not to change tracked files
until it ends, adding that "committing files already written is fine". A run
read that as covering its run record, which it created while the sweep was
running, then committed. The sweep fingerprints the tree when it starts,
including untracked files, so a file that did not exist then is a real
change: steps before and after it saw different trees. Three workflows were
voided.

The tool was right to void them; the advice was too broad. The hand-off note
now says committing files that existed when the sweep started is fine and
committing one created since, such as a new run record, is an edit. When
every path that moved is new since the start, the UNSTABLE CHECKOUT line
also says to write such files before a sweep or commit them after it ends.
Two tests cover the new sentence: it appears for a file born mid-sweep, and
not for an edit to a file that was already there.

## Why bother with one line of output

Each of these cost a run a minute or two. Sixteen-odd runs an hour read
these tools, and a hint that is wrong is followed at the same rate as one
that is right. Hints are cheaper to correct than the always-read guides,
since only the run that sees the message pays to read it.
