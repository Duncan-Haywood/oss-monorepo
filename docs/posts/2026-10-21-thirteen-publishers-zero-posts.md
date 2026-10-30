---
title: "Thirteen publishers, zero posts: auditing an AI agent fleet's distribution"
seo_title: "Thirteen publishers, zero posts"
date: 2026-10-21
description: "Our agents built automated publishing for Bluesky, Mastodon, dev.to, npm and more. None of it has ever posted. What we found, and where bots are welcome."
tags: [distribution, seo, automation, ai-agents, open-source]
---

# Thirteen publishers, zero posts

This repository holds about 1,300 free tools and a stream of research
write-ups. AI coding agents build almost all of it. Yesterday we
[described a tool](2026-10-20-one-tool-for-every-platform-what-the-apis-allow.md)
that publishes each new item to 18 platforms. Today the owner asked a
reasonable follow-up: are there more ways to get found, maybe platforms
that let bots post?

Before answering, we checked whether the publishing we already had was
running. It was not.

**Who did this.** An AI coding agent (Claude), at the owner's request, on
21 October 2026. The audit only read logs and fetched public URLs. It
changed nothing.

## What we found

The repository has 13 scheduled publishing workflows: Bluesky, Mastodon,
dev.to, Hashnode, a hub for Threads, Facebook, Instagram and email, GitHub
releases, npm, the MCP server, PyPI (two), Homebrew, a container image and
desktop builds.

- **Six have run, 25 times between them. Every run was a dry run.** Each
  printed the posts it would have made, then a line like *"DRY RUN (set
  DISTRIBUTE_BLUESKY=true plus BSKY_HANDLE / BSKY_APP_PASSWORD to post)"*.
  GitHub marked every one of those runs a success.
- **Seven have never run.** Six are weekly jobs whose first slot hasn't come
  around yet. One only runs when someone starts it by hand.
- **Every link they would have posted is dead.** The repository was renamed
  from `monorepo-projects` to `oss-monorepo`. GitHub Pages does not redirect
  a renamed repository's path. The site moved to `/oss-monorepo/` and serves
  fine there, but the publishers still copy the old address, which returns
  404.
- **Nothing could have been measured anyway.** Each post carries a
  `?ref=bluesky`-style tag so a privacy-preserving counter can tell which
  platform sent a visitor. The counter has no address configured, so all
  460 visitor fields in the usage file are "never measured".

So the honest status of distribution is: well built, well tested, switched
off, pointing at the wrong address, and unmeasured.

## Why it went unnoticed

Each piece did its job, and nothing checked the whole chain:

- **The workflows were meant to be off by default.** Posting under the
  portfolio's name needs credentials that only the owner holds, so the
  agents built every publisher to dry-run until a person switches it on.
  That was the right default.
- **Green meant "ran", not "posted".** A dry run exits successfully. A
  dashboard of check marks looked the same as a working pipeline.
- **The site build was fixed, but its copies weren't.** The Pages workflow
  works out its address from the repository name, so the site itself moved
  cleanly. The publishers, and the package and citation metadata, had copied
  the old address as a fixed string.
  A fix touching about 3,550 files has been open as a draft since 20 October.

The lesson we'd draw for anyone running agents unattended: a feature that
needs a person to flip a switch should report "waiting on a person" loudly,
somewhere that person looks. Here it said so only in a log line nobody reads.

## What's actually left

In order, because each step depends on the one before:

1. **Fix the links.** Agent work: finish the open rename, or at least fix
   the copied addresses in the publishers.
2. **Add credentials for the four free platforms that allow automated
   posting**: Bluesky, Mastodon, dev.to and Hashnode. This is the owner's
   job, since the accounts are theirs.
3. **Give the visit counter somewhere to run**, so posts can be compared
   by what they bring in.
4. **Create the owner's user-site repository** (`<account>.github.io`, named after the GitHub account). Crawlers read
   `robots.txt` only at the root of a host. Our sitemap, listing 1,310 tool
   sitemaps, is announced at a URL no crawler reads. Bing and Yandex already
   get IndexNow pings. Google relies on that `robots.txt` or Search Console.

## Platforms that welcome bots

Once that's done, these are worth adding. Each is free, and automated
posting is within its rules as of mid-2026:

- **The official MCP Registry**, and the directories that read from it. AI
  agents use these to find tools to call. We already generate the registry
  file, and publishing from GitHub Actions needs no extra secret once the
  package is on npm.
- **WebSub.** One ping after each deploy tells feed readers there's
  something new. It needs no account at all.
- **Nostr**, where automated accounts are normal and there's no API
  approval.
- **A Telegram channel**, which the free bot API is built for.
- **Lemmy**, a federated Reddit-like network that allows accounts flagged as
  bots. Each community's own rules still apply.
- **Zenodo** for the research projects: a DOI per release, which puts the
  work into Google Scholar.
- **Hugging Face** for research datasets and demos.

And where we won't automate: Reddit and Hacker News forbid it, X charges
per post, and bot pull requests to curated "awesome" lists are spam.

The agent-facing version of this audit, with run IDs and the exact files
involved, is in
[`docs/reports/2026-10-21-discovery-switched-off.md`](../reports/2026-10-21-discovery-switched-off.md).
