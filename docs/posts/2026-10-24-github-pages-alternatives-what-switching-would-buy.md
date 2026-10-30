---
title: "Alternatives to GitHub Pages for a 15,000-file static site: what switching or adding would buy"
seo_title: "Alternatives to GitHub Pages for a 15,000-file static site"
date: 2026-10-24
description: "Our site is 738 MB of a 1 GB Pages cap, and 56% of it is podcast audio. What Cloudflare Pages, Netlify, Vercel, storage and a custom domain would change."
tags: [github-pages, hosting, static-site, cloudflare]
---

# Alternatives to GitHub Pages: what switching or adding would buy

This repository publishes about 1,300 free browser tools, the research
write-ups, this blog and three podcasts as one static site: a GitHub Pages
project site under `/oss-monorepo/`. AI coding agents build nearly
all of it. One GitHub Actions workflow, `portfolio-pages.yml`, rebuilds and
redeploys the site on every merge to `main`. A free Cloudflare Worker
(`platform/edge/`) sits beside it and takes the two requests a static host
cannot: the feedback form and a cookieless page-view count.

The owner asked what the alternatives are, and what we would gain or lose by
switching hosts or adding to this setup. To answer with numbers rather than
opinions, I built the site the way the workflow does and measured it.

## What the site is today

Built on 24 October 2026 with `node platform/pages/build.mjs`, the output is:

| Measure | Value |
|---|---|
| Total size | **738 MB** |
| Files | **14,941** |
| HTML pages | 4,238 |
| MP3 files | 76, **414 MB (56% of the site)** |
| PNG images (mostly share cards) | 2,735, 146 MB |
| HTML | 114 MB |
| Largest file | 16 MB (one podcast episode) |

The audio is the story. All 76 episodes were added on or after 20 October:
33 for this blog's podcast, 19 for *Saints by Candlelight*, 24 for *Hearth
and Horizon*. Average size is about 5.4 MB, so the roughly 260 MB left under
the cap holds about 48 more episodes. At the rate since 20 October that is
weeks, not years.

## What GitHub Pages does well for us

- **It costs nothing and needs no new account.** The repository is public,
  so its Actions minutes are not billed, and Pages itself is free.
- **Merging is publishing.** No branch to push by hand, no box to patch.
- **No visitor data lands on our disk.** Many tools take a contractor's
  prices or a bookkeeper's vendor list, and their pages promise the data
  stays on the device. A host with no server code makes that easy to keep.
- **It survived what the alternatives did not.** We ran a two-server
  Kubernetes cluster as a second home for a month. It went down on
  4 September and was deleted on 1 October ([the full
  story](2026-10-20-moving-from-kubernetes-to-github-pages.md)). Pages kept
  serving throughout.

## Where it pinches

From [GitHub's published limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
and our own measurements:

1. **A 1 GB cap on the published site.** We are at 74% of it, and the audio
   is the fastest-growing part. Nothing in the build checks the total today,
   so the first warning would be a failed deploy.
2. **No custom HTTP headers.** This one has a measured cost. The site's
   on-device assistant runs a small language model with llama.cpp compiled
   to WebAssembly. It can use several CPU threads only when the page is
   cross-origin isolated, which needs the COOP and COEP headers, and Pages
   cannot send them. In our benchmark
   ([`docs/reports/2026-10-21-wasm-on-the-site.md`](../reports/2026-10-21-wasm-on-the-site.md))
   a 100-word answer took **37.7 s on one thread and 10.7 s on four**. Every
   visitor gets the slow number.
3. **A project subpath, not a domain root.** Crawlers read `robots.txt` from
   the host root, which belongs to a different repository, so the
   `Sitemap:` line our build writes is never seen there. A custom domain
   fixes this; it needs the owner's registrar.
4. **No server-side anything.** No logs, no redirects beyond a meta refresh,
   no form handling. The Worker already covers forms and counts.
5. **Soft limits we have not measured against:** 100 GB a month of bandwidth
   and a 10-minute deploy timeout. Our visitor count has only just been
   switched on, so how close we are to the bandwidth line is unknown, not
   zero.

## The alternatives

### Switch the whole site

| Host | What we would gain | What we would lose or risk |
|---|---|---|
| **Cloudflare Pages** | Custom headers and redirects (`_headers`, `_redirects`), so the four-thread assistant becomes possible. Same account the Worker already uses. | [The free plan allows 20,000 files per site](https://developers.cloudflare.com/pages/platform/limits); we have 14,941, so this is 75% full too, just on a different axis. Deploys move off GitHub's built-in token to a Cloudflare API token. The free plan's 500 builds a month would not survive hundreds of merges a day, so we would have to keep building in Actions and upload the result. |
| **Netlify** | Headers, redirects, forms. | Its newer free plan is metered in credits and, per third-party summaries, pauses every site when they run out. With a 738 MB site and an unknown amount of traffic, that is a real chance of an outage we cannot predict. Check Netlify's own pricing page before relying on any figure. |
| **Vercel (Hobby)** | Headers, redirects, serverless functions. | [Vercel's docs restrict Hobby to non-commercial personal use](https://vercel.com/docs/plans/hobby). The site has a Sponsors link and the portfolio hopes to earn, so this is the wrong plan, and Pro costs money. |
| **Our own server again** | Full control. | We tried it. It was the part that failed. Back to patching, paying and on-call. |

None of these is a free upgrade. Cloudflare Pages is the only one that would
remove a limit we can measure today (headers) without adding a paid plan,
and it swaps the size cap for a file-count cap we are already close to.

### Add to Pages instead

| Addition | Gain | Cost |
|---|---|---|
| **Move podcast audio off the site** (GitHub release assets, Cloudflare R2, or the Internet Archive) | Takes the site from 738 MB to about 324 MB, which ends the cap problem for the foreseeable future. Episodes stop being rebuilt and re-uploaded on every merge. | Audio URLs change, so the three podcast feeds need a one-time rewrite. Release assets keep everything on GitHub with no new account. [R2's free tier](https://developers.cloudflare.com/r2/pricing/) is 10 GB of storage with no egress fees, but enabling it may need a payment method on the Cloudflare account, which is the owner's call. |
| **A custom domain** (`marisstella.dev`) | Crawlers read our `robots.txt` and sitemap, the tools stop carrying a GitHub account name in every link, and the old DNS records, which the ask queue last recorded as pointing at an IP address handed back to the server company, stop doing so. | An owner action at the registrar. Already queued as `pages-custom-domain` in `portfolio/ledger/asks.yaml`. |
| **Serve one page from Cloudflare** (just the assistant, at a `workers.dev` address) | Four threads where they matter, without moving 14,941 files. | A second origin to keep in step, and the assistant's page would live at a different address from the rest of the site. |
| **A size check in the build** | A failing test at, say, 900 MB, instead of a failed deploy at 1 GB. | A few lines in `platform/pages/check.mjs`. |

## What we recommend

Stay on GitHub Pages, and add to it rather than switch.

1. **Move the audio first.** It is 56% of the site and all of the recent
   growth. GitHub release assets are the default: [each file may be up to
   2 GiB](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
   and there is no new account to open.
2. **Add the size check**, so the next cap we approach turns a test red.
3. **Point the custom domain at Pages** when the owner can. It is the one
   change that helps search and closes a security risk at the same time.
4. **Treat the threaded assistant as a scoped experiment**, on a single
   Cloudflare-served page, not as a reason to move the whole site.

A full switch to Cloudflare Pages becomes worth it only if a second feature
needs headers, or if the Pages bandwidth limit starts to bite. The visitor
counter that went live this week is how we will find out.

## What this post did not measure

- Bandwidth. The page-view counter has only just been turned on; there is no
  reading yet, which is not the same as no traffic.
- Whether a logged-out stranger receives the site. Our sessions' network
  proxy blocks `github.io`, so we cannot fetch the live page ourselves.
- Any host's behaviour under our real deploy pattern. The comparisons above
  come from each provider's published limits, not a trial deploy.

The measurement steps are in
[`docs/reports/2026-10-24-hosting-alternatives-measured.md`](../reports/2026-10-24-hosting-alternatives-measured.md).

*Written with AI assistance (Claude).*
