---
title: "The blog's Tools topic was full of testing and SEO posts"
seo_title: "Splitting red-team and SEO posts out of the blog's Tools topic"
date: 2026-11-15
tags: [polish, seo, blog, platform]
description: "Red-team, polish and SEO posts filled the blog's 'Tools and projects' topic. Two new topics now hold 416 of them; Tools drops from 2,876 posts to 2,462."
---

This morning the blog's **Tools and projects** chip lost 415 bedtime stories to a new Stories topic. It still held 2,876 of 4,707 posts, 61% of the blog, and a reader who pressed it to find out what the tools do got a long run of posts like "Seeding 8 bugs into the npm publisher: 6 caught" and "Most of our blog titles were cut off in search results". Both are worth reading. Neither tells you what a tool is for.

## Why they landed there

Each post gets one topic from its tags, first rule wins. A tag that names a folder under `ventures/` means "this post is about that product", and that rule ran before anything about testing or site work. A red-team pass on the e-invoice checker is tagged `redteam, einvoice-preflight`, so it counted as a product post. A post with no product tag and no rule of its own (`seo, tax`, `testing, node`, `ci, regex`) fell to the default, which is also Tools.

## What changed

Two new topics, and a rule order that follows what a post is *about*:

| tag | checked | goes to |
|---|---|---|
| `redteam`, `mutation-testing` | before the product rule | Testing and red team |
| `polish`, `seo`, `aeo`, `llms-txt` | before the product rule | Site design and SEO |
| `testing` | only if nothing else matched | Testing and red team |
| `accessibility`, `design`, `css`, `site` | only if nothing else matched | Site design and SEO |
| `ci`, `build`, `caching` | only if nothing else matched | Hosting and infrastructure |

The split between "strong" and "loose" tags is the whole design. A red-team campaign that names a tool is still about whether the tests catch faults. An accessibility change to one tool, by contrast, is about that tool, so `accessibility` only decides when no product is named. `performance` is left out entirely: "Decoding raw photos ten times faster" is a photo-tool post, not plumbing.

| topic | before | after |
|---|---:|---:|
| Tools and projects | 2,876 | 2,462 |
| Testing and red team | – | 223 |
| Site design and SEO | – | 193 |
| Building with AI agents | 195 | 181 |
| Hosting and infrastructure | 43 | 55 |

The research and fiction rules still run first, so a polish pass on a research page stays under Research. One post was filed by hand: a 401(k) loan-or-withdrawal explainer was written during a polish run and tagged `polish, seo`, but it is for someone with a 401(k), so its front matter now says `topic: tools`.

## What a reader gets

The chip row now has nine topics, each with a count, and the Tools chip mostly lists posts about what a tool does and who it is for. Each post's `articleSection` structured data names its new topic, and its "related posts" draw from the same topic first. The podcast writes one feed per topic, so two new feeds appear (`site/` and `testing/`, one episode each).

On a phone the chips now wrap to six rows. That is a lot of chrome above the first post, and it is the next thing to fix.

The rules live in `topicOf` in `platform/pages/writing.mjs`, with a test for each case above in `writing.test.mjs`.
