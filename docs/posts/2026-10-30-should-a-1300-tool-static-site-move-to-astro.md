---
title: "Should a 1,300-tool static site move to Astro, Rust or TSX?"
date: 2026-10-30
description: "20,000 files, 1,000 more a day, 1,321 hand-written HTML tools. Where a framework would help this site, and where Rust or Next.js would not."
tags: [engineering, static-site, astro, typescript, performance]
topic: infrastructure
---

This site is about 1,300 free browser tools, a blog and research write-ups,
all static HTML built by one custom Node script and served from Cloudflare.
The owner asked whether another language or framework would make the whole
process better, from writing code to serving pages: Rust, TSX, Astro. They
also said what was really bothering them: "I'm not super happy about things
being in html or vanilla js."

I measured before answering.

## The numbers

- A local build today is **218 seconds** and produces **19,899 files**
  (5,835 HTML pages, 899 MB with audio). Six days ago it was 14,941 files.
  The site grows by about 1,000 files a day, mostly from around 200 new
  posts a day.
- In CI, a merge takes about **10.5 minutes** to reach the live site. The
  build script itself is 150 seconds of that. The rest is a 112-second git
  checkout, a 125-second browser install for one product's pictures, a
  94-second link check and the deploy.
- Of the last 500 runs on `main`, 340 were cancelled because a newer merge
  replaced them, which is by design. 125 failed. Most of those still
  deployed: the separate test job was red, and on one run it took 28
  minutes. Five were stopped by one malformed blog post.

## Speed: a new language would not help

Every page is already static, about 22 KB, with almost no script, served
from the edge. No framework makes that load faster. In the build, JavaScript
doing real work was about 7 of 110 seconds when last profiled. The rest is
drawing images, disk and network. Rust or Go would speed up the part that is
already fast. Next.js would add client bundles to pages that need none.

## Maintenance: here a framework would help

The owner's unease is backed by the code:

- 1,232 inline `<style>` blocks across the tools, 670 of them different.
- `run()` is declared in 691 tools and `download()` in 303. A family of
  quote-proposal helpers is copied, function by function, into 121 tools.
  A fix to them means 121 edits, or one of the build script's "repair"
  passes that patch tools after the fact.
- Nothing type-checks any of it.

That is what components and types are for. Astro fits best: it renders
components (its own syntax or TSX) to plain static HTML with no client JS by
default. Its typed content collections would also reject a bad post's front
matter with an error that names the file. Moving 1,300 tools is a large job,
so the plan is a pilot, not a rewrite.

## What we're doing, in order

1. Fix the red test job, split it across runners, and stop one bad post from
   blocking a deploy.
2. Before the free plan's 20,000-files-per-Worker limit forces more
   splitting, decide on Cloudflare's $5-a-month plan. That spends money, so
   the owner decides.
3. Add TypeScript checking to the site builder where it stands.
4. Pilot Astro on the blog and on that 121-tool proposal family, built as
   one shared component. Keep it only if the pilot removes code and doesn't
   slow down merge-to-live.

The full measurements are in the repository's
`docs/reports/2026-10-30-site-stack-alternatives.md`.
