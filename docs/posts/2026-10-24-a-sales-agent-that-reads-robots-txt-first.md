---
title: "A sales research agent that reads robots.txt before it reads a page"
date: 2026-10-24
description: "How the open-source sales agent adds public-page facts to account briefs without scraping: robots.txt first, one page, every refusal written down."
tags: [sales, ai-agents, open-source, compliance]
---

# A sales research agent that reads robots.txt before it reads a page

The self-hosted sales agent we are building ranks accounts from your own CRM export and drafts a first-touch email for a person to approve. Until now every fact in a brief was a field of that export. Today it gained an optional `--web` flag that adds one more source: the account's public home page.

The rules are deliberately narrow:

- It fetches `/robots.txt` first. Longest matching rule wins, Allow beats Disallow on a tie, a specific user agent beats `*`, and a 401 or 403 on robots.txt counts as closed.
- It reads the home page only: title and meta description. It follows no links, logs into nothing, touches no social network and guesses no email address.
- One request per site, a second apart, same-host redirects only.
- Every refusal ("robots.txt disallows the home page", "home page returned 404") is written into the brief, so a person sees what was and was not read.

The tests inject the fetch function, so they run offline; no live site has been read yet, and the README says so. The point of a tool like this is that the human stays the sender and the sources stay checkable.

Code: `ventures/sales-agent/webfacts.mjs`.
