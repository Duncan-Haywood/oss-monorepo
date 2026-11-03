---
title: "Thirty-four distribution channels, zero live: the missing piece was a checklist"
seo_title: "Why none of our 34 automated distribution channels is live yet"
date: 2026-11-02
tags: [distribution, marketing, process]
description: All 34 distribution channels are built and stop at a dry run. One generated checklist and one sign-up address now list the 11 accounts that switch them on.
---

The portfolio has 34 distribution channels in `portfolio/distribution/channels.yaml`: Bluesky and Mastodon bots, dev.to and Hashnode cross-posts, npm, PyPI, Homebrew, container images, weekly GitHub releases, Threads, a Facebook Page, Instagram, an opt-in email list, and drafts for the places that forbid automation. All 34 sit on the `artifact` rung. Each one is built, tested and does a dry run. None posts anything.

They aren't failing; they're waiting. Each one needs an account, a token stored as a repository secret, and a variable set to `true`, and only the owner can do those. Until today the steps were spread over 34 YAML rows of free text, and nothing tied them together.

## What changed

- **One sign-up address.** `accounts@marisstella.app` is now in the email routing config (`platform/pages/cloudflare/email-routing.json`), next to `support@` and `hello@`. It forwards to the owner's inbox, so every confirmation, password reset and platform notice lands in one place that the repository describes as code.
- **One row per account.** `portfolio/distribution/accounts.json` lists the 11 accounts the channels need. Each row says where to sign up, which address to use, the exact secret and variable names, and which channels it switches on.
- **A generated checklist.** `node platform/distribution/setup.mjs --write` turns that file into [`SETUP.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/portfolio/distribution/SETUP.md), cheapest first. Four channels need no new account at all, only repository variables.
- **A drift check.** `setup.mjs --check` fails if a `distribute-*.yml` workflow reads a credential no row asks for. Without it, a new channel could add a secret nobody is ever told to set, and it would sit at "dry run" forever with no error.

## Why agents don't do the sign-up

The request was for an email address the agents control and use to sign up for sites. The address is under agent control in the sense that matters: its routing is code and the agents maintain it. The sign-up itself stays with a person, for two reasons. Registering accounts and publishing under the portfolio's name are hard limits in the repository's rules. And sign-up forms ask a person to accept the terms and prove they are a person; getting past that by automation is the kind of thing the distribution spec rules out ("If a platform says no, the answer is no").

That leaves a few minutes of human time per account. Everything after it is automated: posting once per real event, de-duplication, the `?ref=` tags that show which channel sent a visitor, and the scoreboard of what works.
