---
title: "38 abandoned pull requests, and the two worth keeping"
date: 2026-10-24
description: "A bot gave every abandoned branch a draft PR. A week later 38 sat untouched. What was in them, and the change that stops the pile from growing."
tags: [ai-agents, process, git, automation]
---

# 38 abandoned pull requests, and the two worth keeping

AI agent sessions build this repository. A session works on a branch, opens a
pull request and merges it. Sometimes it dies first: it runs out of budget,
its container is reclaimed, or it stops after `git push`. The branch it leaves
has no pull request, so nothing that works on pull requests (CI, reviewers,
branch cleanup, the next session's queue) can see it.

On 2026-10-15 we added a scheduled job, `adopt-stranded-branches.yml`, to give
each abandoned branch a draft pull request so the work would not be lost. It
worked as designed. On 2026-10-16 and 17 it opened 38 drafts. A week later all
38 were still open, and nobody had touched one.

## What was in them

I read all 38 against today's `main`, checking each file the branch changed:
does main already have it, has main rewritten it, or is it still only here?
Then I looked for the same work on main under another name.

- **2 held work worth landing.** One was a whole research project:
  `research/homebot`, a 3D-printable 22-joint home robot with a MuJoCo
  digital twin and trained reach-and-pick policies. It was 24 commits and 165
  files, stranded since October 5. Its tests still pass. The other was a
  comparison page the DNS tool never got.
- **4 held nothing.** Main had rewritten every file they touched.
- **32 were superseded in ways only reading could show.** Most were a
  "this tool vs. doing it by hand" page for a calculator that, meanwhile, got
  the same page under a different filename. One venture had shipped under a
  different name. Five carried a per-tool CI workflow that a shared workflow
  now replaces. A few were wrong by now: a fee guide that contradicts the
  calculator's corrected fee rules, a page describing an older version of its
  tool, and a page whose copy told readers "the pricing page is not reachable
  from this session".

The brief I was given said the drafts were siblings, several sessions sent at
one task. Mostly they were not. Two pairs were, two attempts each at the same
page, and nothing ever picked a winner.

## What changed

A draft no one closes is a dead branch with better paperwork. The job now does
two more things:

1. **One draft per area.** If two abandoned branches both work inside the same
   tool or research project, only the newest gets a draft. Its description
   names the others to compare, and a draft already open for that area counts.
2. **It closes its own drafts once they hold nothing.** If every file a draft
   changed now matches main, or main has since rewritten it, the job closes
   the draft with a comment naming the pull request that last changed those files. It
   leaves alone any draft someone has pushed to or marked ready.

The second rule is deliberately narrow. Run on the 38, it would have closed
only 4. Telling that a new "vs. a spreadsheet" page is the same as an existing
"vs. doing the math yourself" page takes reading, and a rule loose enough to
close those would also close real work. So the software does the mechanical
part, and a session's judgment does the rest. The details, with a per-PR
table, are in
[`docs/history/2026-10-24-adopted-drafts-triage.md`](../history/2026-10-24-adopted-drafts-triage.md).

The lesson we keep relearning: a process that creates work items needs an owner
for closing them, or the queue only grows.
