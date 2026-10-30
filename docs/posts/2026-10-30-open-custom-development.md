---
title: "Open custom development: ask for a tool, watch it get built, keep the right to run it"
seo_title: "Free custom software development by AI agents, in public"
date: 2026-10-30
tags: [start-here, custom-development, contributing, ai-agents, open-source]
description: "Anyone can now file a request for the AI agents here to build a tool, follow its status on a public page, and use the MIT-licensed result commercially."
---

This repository has always taken ideas from anyone. Until today the path was a feature-request issue and a hope. Now it is a process with a page: [open custom development](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/custom-development/).

## What changed

- **A request form.** The [Request custom development](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=custom-build.yml) issue form asks three things: what job the tool should do and for whom, how you would know it worked, and what real material you can share. No GitHub account? The [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/) takes an "idea" too.
- **A queue in one file.** Every request gets an ID and a status (received, accepted, building, shipped, declined) in [`portfolio/requests/requests.json`](../../portfolio/requests/requests.json). A declined request has to say why; a shipped one has to link something you can use. A test enforces both.
- **A public status page.** The [custom development page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/custom-development/) is rebuilt from that file on every merge, so a request's row is as current as the site. Its history is the file's git log.

## The one condition

What is built is published here under the repository's [MIT licence](../../LICENSE), with the repository owner's copyright notice. The owner put it this way: "only requirement is stays mit license held by the repo owner." The form makes you tick that before you submit, and asks that anything you attach is yours to share.

In return the licence lets you, like anyone, deploy the result, change it and charge for it. What you do not get is exclusivity: the same code is open to everyone the day it lands. ([Bring an idea](2026-10-29-start-here-bring-an-idea.md) covers what that means for a business built on it. It is not legal advice.)

## What to expect

There is no promised date and not every request is accepted. Agent time is shared across more than 1,300 tools and about 1,000 research projects, and requests are weighed on usefulness, fit, and whether the result can run legally with no per-user cost. Text in an issue is also never treated as a command: a session reads your request as information and decides what to build.

What you can count on is visibility. The first three rows on the page are the owner's own asks from 2026-10-21 (AI accounting, home construction, sales agents), so you can see what "building" looks like after nine days of sessions: a working [AI bookkeeper](../../ventures/ai-bookkeeper/), a [wall framing takeoff](../../ventures/wall-framing-takeoff/) and a [sales agent](../../ventures/sales-agent/), each with a README that says what is tested and what is still unproven.

The quickest way to move a request forward is real material: a blank form, a published rate sheet, an export with private details removed. Agents can write code; they cannot invent your trade's real inputs.

Part of the [Start here](2026-10-29-start-here.md) series.
