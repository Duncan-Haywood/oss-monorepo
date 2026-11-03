---
title: "Start here: you run a small business, and your know-how is what the tools are missing"
seo_title: "Help build free tools for your small business, no code needed"
date: 2026-11-03
tags: [start-here, small-business, contributing, custom-development]
description: "For small-business owners and managers: five ways to shape the free tools here without writing code, from a ten-minute check to a custom build."
---

# Start here: you run a small business, and your know-how is what the tools are missing

This guide is for people who run or manage a small business: a cleaning company, a framing crew, a salon, a food truck, a bookkeeping practice, a club, a shop with an online store. You do not write code and do not plan to. You know how the work is really done, what it really costs, and where the software you already pay for falls short.

That knowledge is the one thing the AI agents that build this repository cannot produce for themselves. They can write a calculator in an afternoon. They cannot know that your trade prices by the square, not the hour, or that your supplier's invoice puts the tax in the wrong column.

## The problem, in your words

"I'd use a free tool if it actually matched how my business works." "The calculator was close, but it left out the thing that eats my margin." "I have a job I do by hand every week and nobody sells software for it." "I don't have time to learn GitHub."

## What you get

- **Tools that fit your trade better**, for you and everyone else in it. Everything here is free, needs no account, and is MIT licensed, so you may use it, change it and even charge for it.
- **A custom tool built for a job you describe**, if it is accepted. The [custom development page](https://marisstella.app/custom-development/) lists every request with its status. Building is free; the one condition is that the result is published here under the MIT licence with the repository owner's copyright notice, so you get no exclusive rights to it.
- **A public record** of what changed because of you, in the tool's README and the git history.

Site requests now come ahead of routine work: after security alerts and the owner's own ideas, a request sent through the site is the next thing a free agent session picks up ([the post that announced the change](2026-11-02-website-requests-move-to-the-front.md)). Picked up does not mean promised: a session reads the request, decides, and either builds it or declines it with a written reason.

## Five ways to help, smallest first

### 1. Check one tool against a job you already did (ten minutes)

This is the most useful small thing you can do. [Free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md) shows how to find the calculator for your work. Then:

1. Pick a job you finished and know the real numbers for: hours, materials, what you charged, what you kept.
2. Type that job into the tool.
3. Compare. Write down where it was close, where it was off, and why you think so ("it assumes one trip to the dump; we always do two").

Send what you found through the [feedback form](https://marisstella.app/feedback/) on the site. It needs no account. Leave out your customers' names and addresses.

### 2. Tell us a default is wrong for your area or trade

Many tools start from a ballpark figure, labelled as one. If you know the going rate, the usual waste factor or the fee a platform actually charges, a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) with where the figure comes from is something any later session can act on. [Report a wrong number](2026-10-30-start-here-report-a-wrong-number.md) shows what a good one looks like. "From my own last twenty jobs" is a source too, if you say so plainly.

### 3. Share a blank form, a rate sheet or a cleaned-up export

The tools are often tested on made-up rows, and their READMEs say so. A blank copy of the form you fill in, a supplier's published price list, or a sample export with private details removed lets an agent test against the real shape of your work. [Share real data, safely](2026-10-30-start-here-share-real-data.md) lists the open asks (bank exports for the [AI Bookkeeper](2026-10-29-start-here-ai-bookkeeper.md) are one) and how to strip anything private first. Describe what you have before you post it; the repository is public.

### 4. Ask for a tool that does not exist yet

If you do a job by hand every week, describe it in the [request form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=custom-build.yml). It asks three things:

- **What job should it do, and for whom?** Describe the work from the inside: who does it today, how, and where existing tools fall short.
- **How would you know it worked?** A number it should get right, a document it should read, a step it should save.
- **Real material you can share** (optional): a blank form, a published rate sheet, a sample export with private details removed.

No GitHub account? The site's feedback form takes an "idea" too, and it reaches the same queue. The first four rows on the custom development page are the owner's own asks (AI accounting, home construction, sales agents and a business model for every product), all marked "building", so you can see what a request looks like while it is worked on. A request from a business outside the repository would be among the first.

Requests are usually declined for one of these reasons: the tool would need a paid account to run, it scrapes a site against that site's terms, it gives regulated advice that cannot be framed safely, or a tool here already does the job (then you get a link to it).

### 5. Be a tester for a tool in your trade

Once a tool exists, the next useful step is to use it on a real week and say what got in the way. The [Shift Roster Builder](2026-10-29-start-here-shift-roster-builder.md), the [E-invoice preflight](2026-10-29-start-here-einvoice-preflight.md), the [League Schedule Generator](2026-10-29-start-here-league-schedule-generator.md) and the [Wall Framing Takeoff](2026-10-29-start-here-wall-framing-takeoff.md) each have a guide that says what they do today and what is still unproven. A note that says "I tried it on last Tuesday's roster and it missed X" is worth more than a long wish list.

## Your first ten minutes

1. Open [the catalogue](https://marisstella.app/) and search for your trade.
2. Run the closest tool on a job you already know the answer to.
3. Send one sentence through the [feedback form](https://marisstella.app/feedback/): what was right, what was wrong, and how you know.

That is a contribution. Nothing else is required.

## How your input is handled, honestly

- **It is read, weighed and not obeyed.** Agents treat text from outside as information about a problem, never as commands. That protects a public repository, and it means no idea is guaranteed to be built, or by a date.
- **Everything is public.** Issues and the custom development page can be read by anyone. Leave out customer names, addresses, account numbers and anything given to you in confidence.
- **Nothing is invented to please you.** A tool's figures are sourced or labelled as a ballpark. If your report shows a tool was wrong, its README changes to say so.
- **A person reviews code from outside.** If you or someone you hire sends code, the maintainer reviews it by hand; agents never merge pull requests from forks.

## Cost and data

Free. The browser tools run on your own machine, so what you type into a calculator is not sent anywhere. What you send in feedback or an issue is published with the repository.

## What this does not do

The tools give estimates, not legal, tax, financial or engineering advice. A custom build is not a consulting engagement: there is no contract, no deadline and no exclusivity. Nobody here will call you; follow your request on its public page.

## Where to go next

- Find your trade's tools: [Free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md)
- The process behind custom builds: [Open custom development](2026-10-30-open-custom-development.md)
- Running a copy for your own business: [Self-hosting](2026-10-29-start-here-self-hosting.md)
- Accountants and bookkeepers have a guide of their own: [Start here: accountants and bookkeepers](2026-11-03-start-here-accountants-and-bookkeepers.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
