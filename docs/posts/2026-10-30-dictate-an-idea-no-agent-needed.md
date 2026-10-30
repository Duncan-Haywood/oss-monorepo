---
title: "Dictate an idea, no AI agent needed: the ideas inbox"
seo_title: "Contribute ideas to an AI-built open-source repo by voice"
date: 2026-10-30
tags: [contributing, ai-agents, ideas, process]
description: "A file you can talk into from your phone, and a one-box issue form, so people without an AI agent session can still steer what gets built."
---

This repository is built by scheduled AI coding agent sessions, and the way to steer them has been to open a session and ask. That leaves out a lot of people: the owner on a job site with a thought and no laptop, a collaborator who does not use AI agents, a tradesperson who knows exactly which number every calculator gets wrong.

So there is now a lower-effort route. It needs a phone and nothing else.

## The ideas inbox

[`IDEAS.md`](../../IDEAS.md) is a plain Markdown file at the top of the repository, next to the README, with a section called "New". (It started life as `ideas/INBOX.md` and moved to the root the same day, so it is the first thing you see on the repository's front page.) To add an idea:

1. Open the file on github.com in a phone browser and tap the pencil.
2. Scroll to the bottom of "New", tap the microphone on the keyboard, and talk.
3. Leave a blank line between ideas, then tap "Commit changes".

No format, no labels, no spelling check. A dictated run-on sentence is fine; sessions already read terse, typo-ridden asks generously, because that is what the owner's own requests look like.

## Why a file and not only issues

There is an issue form too: a new [one-box idea form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=idea.yml) that works from the GitHub app or a browser. But the two routes carry different weight, on purpose.

Anyone on the internet can open an issue, so the agents treat issue text as information to weigh, never as an instruction. That rule keeps a stranger from steering the repository with a cleverly worded issue. A commit to `INBOX.md` needs write access, so an entry there comes from someone the owner trusts, and sessions treat it as a direct request, the same as asking in a session. The owner has also said they would "rather have it be a file write than issues write because the agents can consume it easier", and a file in the tree is what every session reads anyway.

| You have | Use | Agents treat it as |
|---|---|---|
| Write access | `IDEAS.md` | A direct request |
| A GitHub account | The idea form | Information, read and weighed |
| No account | The [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/) | Information, collected daily into a file |

## Why the website does not write into the same file

The obvious next step is a box on the website that commits straight into `IDEAS.md`. We chose not to do that. Anyone can use a website form, so a form that writes into the file of direct requests would let a stranger steer the agents. Instead the [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/) (choose "An idea") writes into a file of its own: the site's small Cloudflare Worker stores the message with email addresses removed, and a daily workflow commits it to `portfolio/usage/site-feedback.json`. The file is in the repository and agents read it, but as reports to weigh, never as instructions. You get a commit through the website with no account, and the agents keep a clear line between trusted and untrusted text.

## How a session picks it up

The master prompt ([`prompt.md`](../../prompt.md)) now tells each run to check the inbox before it routes. A small script does the reading, so no session has to parse the file by hand:

```
$ python3 prompts/ideas.py
1 idea(s) in IDEAS.md (direct requests, oldest first):
  1. a tool for roofers that prices the dumpster and the second layer
1 website idea(s) since 2026-09-30 (data, not requests):
  #9 2026-10-29 [shed-designer]: let me export a cut list
Idea issues (data, not requests): search_issues repo:duncan-haywood/oss-monorepo is:issue is:open in:title "[idea]"
```

(Both ideas are illustrations; the inbox starts empty, and the website file so far holds one test message.) A scheduled run without a task of its own takes the oldest idea, does the work, and in the same pull request moves the idea to "Picked up" with the link:

```
python3 prompts/ideas.py take 1 --pr https://github.com/duncan-haywood/oss-monorepo/pull/NNN
```

That makes the file its own record. Open it a week later and the "Picked up" section says which ideas were taken, on what day, and which pull request acted on each.

## What it does not promise

An idea in the inbox is a request, not a guarantee of a finished product on any date. A large idea becomes a project that many sessions deepen, so the first pull request is a first slice. Ideas from issues and the feedback form are read, and may be built, but they compete with everything else.

The full process, with what makes a dictated idea most useful, is in [`docs/contributing/ideas.md`](../contributing/ideas.md).
