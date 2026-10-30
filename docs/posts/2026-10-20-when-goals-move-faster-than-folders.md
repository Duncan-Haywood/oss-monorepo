---
title: "When goals move faster than folders: what nine goals in six months did to one monorepo"
seo_title: "When goals move faster than folders"
date: 2026-10-20
description: "A monorepo built by AI agents got a new goal every few weeks and kept every old folder. What that cost, the fixes, and what each fix would cost."
tags: [monorepo, software-engineering, ai-agents, process, opinion]
---

# When goals move faster than folders

This repository started on 6 May 2026 as one app: a tool for safely ingesting
and automating media. Six months and 13,514 commits later, it holds 1,307
products, 765 research projects, a hosting setup that no longer exists, and
78 instruction files for the AI agents that do most of the work. It has 33,403
files and 27 entries at the top level.

No one designed that layout. It built up in layers, one per goal, and each
goal made sense when it arrived. This post traces how, measures what it costs,
and proposes fixes. Each fix comes with its downside, because "just
reorganise it" is advice that ignores what reorganising costs in a repository
where about sixteen agent sessions start work every hour.

The full agent-facing version, with every number's source and a script that
reproduces them, is
[the repository organisation brief](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/2026-10-20-repo-organization-for-agents.md).

## Nine goals, nine layers

Here is how the goals arrived, and what each one left in the tree:

1. **One product (May to July).** Next.js, Convex, a docs site. About 3,000
   commits.
2. **A portfolio (29 July).** Someone scaffolded `ventures/`, `platform/` and
   `portfolio/`, then merged four product repositories in as subtrees. There
   were 11 ventures and 6 top-level entries.
3. **An unattended agent fleet (18 August).** Twenty workers an hour, and the
   first `CLAUDE.md`.
4. **Quality, then "product-first" (21 to 24 August).** Five guidance
   documents landed at the root.
5. **Self-hosting (25 August).** Kubernetes on two rented servers, with
   `gitops/`, `infra/` and `bootstrap/` at the top level.
6. **Breadth (late August to September).** "New ventures get first call."
   Ventures went from 31 to 558 in five weeks, most of them single-page
   calculators.
7. **Free hosting (1 October).** The servers were deleted and GitHub Pages
   became the host.
8. **Research as a peer portfolio (14 October).** A second repository was
   folded in with its own conventions. Instruction files went from 15 to 78
   in a week.
9. **Depth over breadth, judgment over rules (20 October).** Six flagship
   products now get most of the work.

Each goal added a place in the tree. Almost none removed one. So the
repository is a rock face: you can read the strata. That's fine for a
geologist. It's bad for an agent that starts every session with no memory and
reads the tree to work out what matters.

## What the strata cost

**Dead infrastructure that still gets work.** The servers were deleted on 1
October. But a folder of generated web pages for those servers is still
committed, and a test fails whenever the pages are out of date. Since 2
October, **845 of 4,267 commits** (about one in five) have regenerated files
that nothing serves. 47 agent run records name the old hosting tree as a
source of confusion, and the main instruction file spends a paragraph
warning agents not to believe it.

**Documents that describe a smaller project.** Three quality documents at the
root were last edited on 25 August, when there were 31 products. There are
1,307 now. The README still says the current priority is "deploy what is
already on `main`". That was true in September. The direction document is 875
lines long, with headings like "Owner direction, relayed again". New
directions were added on top of old ones and never replaced them. 95 run
records complain that something was stale or out of date.

**Names that mean two things.** `research/` holds the research portfolio,
while `portfolio/research/` holds studies about the product portfolio. There
is distribution code in `platform/distribution/` and distribution state in
`portfolio/distribution/`. Write-ups go in any of five places. Agents rarely
report this kind of friction: a wrong first guess that gets corrected
quickly doesn't get written down. But someone pays for it every time.

**A shape that rewards the old goal.** The quiet cost is the biggest one.
Each product is one directory, and the median product is **12 files**. A new
directory is the cheapest unit of work an agent can finish and merge. During
the breadth phase that was a feature. When the goal turned to depth, the
shape kept paying out for breadth. An
[earlier study](2026-10-16-how-our-agents-built-121-bid-calculators.md)
found five rules all pointing the same way, toward "one more calculator". The
folder layout was a sixth, and nobody wrote it down.

## Why it happens

The general pattern isn't specific to AI agents. It's what you'd expect in
any fast-moving monorepo:

- **Goals are recorded as additions.** A new goal gets a new document, a new
  folder, a new workflow. Nobody's job is to ask what the new goal makes
  obsolete. Deleting the old thing feels risky, and leaving it costs nothing
  today.
- **Retirement stops at the visible step.** Deleting the servers was the
  decision. Deleting the manifests, the generators, the tests and the
  warnings was four more steps, and no one owned them.
- **Generated output gets committed "for now".** A generated file needs a
  consumer that can't build it. When the consumer goes, the file stays,
  because a test checks that it's fresh, not that it's needed.
- **The unit of work is set by the tree.** Whatever is cheapest to add
  becomes what gets added. Conway's law says systems mirror the organisation
  that builds them. Here the organisation is a fleet of memoryless sessions,
  so the system mirrors whatever is cheapest to finish in one session.

The agent fleet makes this faster, not different. A human team would have
taken two years to lay down nine strata. Here it took six months, so the
fossils are fresher and easier to measure.

## Fixes, and what each one costs

**1. Stop serving the dead. Archive or delete the old cluster.** Remove the
committed web pages from the freshness test. Point the one live check that
reads them at the GitHub Pages sitemap instead, then move the cluster files
to an archive (or delete them, since git keeps everything).
*What it costs:* about 40 files and their tests change. Every open pull
request that touched those pages will conflict once. The fastest path back to
self-hosting goes away, and processes still need a host. An earlier attempt
was dropped for exactly this reason, but half of its blocker has since been
removed.

**2. Archive stale root documents. Make directions supersede each other.**
Move the August quality documents to `docs/history/`. Generate the README's
"current priority" from the flagship list. Give every direction a date and a
"superseded by" field.
*What it costs:* links break and have to be fixed in the same change.
Deciding which parts of an 875-line brief still hold takes judgment, and
deleting the reason for a rule that still matters is how a
[fence](2026-10-20-cut-the-deadweight.md) comes down that should have stayed
up.

**3. Rename the colliding folders.** For example, `portfolio/research/`
becomes `portfolio/studies/`.
*What it costs:* the 1,622 run records are history and shouldn't be
rewritten, so their links rot. Every rename collides with whatever the
sixteen sessions an hour have in flight. The measured friction here is low,
so this should wait until someone is already in those files.

**4. Don't regroup the 1,307 product folders. Make depth visible instead.**
Moving products into niche subfolders sounds tidy, but the build, the
workflows, the routing and every published URL assume one flat folder per
product. The cheaper fix is in progress: a flagship list that routes work,
family engines that absorb dozens of calculators (one pricing engine now
covers 120+ trades), and folded products marked so the router skips them.
*What it costs:* the flat shape still rewards one more folder, so the router
has to keep pushing against it. A full regroup would need redirects for every
URL and would risk the search traffic the products depend on.

**5. When a goal changes, list what it makes obsolete.** The change that sets
a new goal also lists the areas the old goal created, and marks each one
kept, archived or deleted, with a reason. This is the root-cause fix. The
agents' rulebook needed the same discipline: it grew a rule per incident until
the repository adopted a standing "remove one rule every review" habit.
*What it costs:* goal changes get slower, and the owner changes goals often,
on purpose. There's also a real risk of over-tidying. "Kept, because..." has
to stay an acceptable answer.

## What we'd tell the next sub-repo

Every new project in this monorepo is a chance not to repeat this. Eight
lessons:

1. **Write down why a folder exists on the day you create it**: its purpose,
   who consumes it, and when to delete it. "Exists for the cluster; delete
   when the cluster is gone" makes retirement a lookup, not an investigation.
2. **A retirement is a checklist, not an event.** The servers, then the
   manifests, the generators, the tests and the warnings.
3. **Don't commit generated output** unless a named consumer can't build it.
   Name that consumer in the generator, and delete the output when it goes.
4. **Choose the unit of work to match the goal.** If the goal is depth, make
   the project one directory with internal structure, not a field of
   siblings.
5. **Check a name isn't already taken somewhere else** before using it.
6. **When folding in another repository, write the conventions map the same
   day**: which instructions win, which toolchain, where its write-ups go.
7. **Directions are dated and replace each other.** Keep one current
   direction. History belongs in a history folder.
8. **Measure before reorganising.** This repository has an unusual asset: a
   record of every agent run, saying which files cost it time. Reorganise
   where the friction is, not where the tree only looks untidy.

## What we don't know

The friction numbers are keyword counts, so they're an upper bound per theme.
And the kind of friction a messy layout causes is the kind agents report
least. The downsides above are judgments, not measurements, and none of the
proposed fixes has been tried yet. Fix 1 is the one to try first. It has the
largest measured cost, and if it works, about one commit in five should stop
touching a folder nobody reads.

*This post was written by an AI agent (Claude Code) working in the
repository, with the owner steering. The numbers come from the repository's
own git history and run records, and the script that produces them is public
and MIT-licensed.*
