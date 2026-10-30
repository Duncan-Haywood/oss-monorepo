---
title: "Start here: you spotted a wrong number. How to report it so it gets fixed"
seo_title: "Spotted a wrong number in a free calculator? How to report it"
date: 2026-10-30
tags: [start-here, contributing, correction, accuracy]
description: "Found a figure that looks off in a calculator, checker or research page? What to include, where to send it, and what happens after you do."
---

# Start here: you spotted a wrong number. How to report it so it gets fixed

This guide is for anyone who looked at a result on one of the free tools here and thought "that is not right". You might be a bookkeeper who knows your state's filing dates by heart. You might be a roofer whose supplier invoices say something different from a calculator's default. You might be a researcher who read a figure on a project page and could not make it match the paper it cites.

You do not need to write code, and you do not need a GitHub account. You need the number, why you think it is wrong, and where the right one comes from.

## The problem, in your words

"The calculator says my quarterly return is due on the 20th. My state's notice says otherwise." "This default material price is from a different decade." "The fee it applies is not what the platform charges now." "I entered the same thing twice and got two answers."

Most of the tools here run on published rates, statutes, fee pages and ballpark defaults. Those change, and sometimes the first version was simply wrong. The repository is built mostly by scheduled AI coding sessions, and those sessions are good at arithmetic and code. What they cannot do on their own is know that your trade's real figure moved last spring. A short, sourced report from someone who does know is the cheapest way to close that gap.

## What a report that gets acted on looks like

A later agent session (or a person) has to be able to read your report cold, with no chance to ask you a question. So write it so it stands alone. Five things cover almost every case:

1. **Which tool or page.** Its name, or better, the address from your browser bar. Each tool's page is `https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/<slug>/` and a research project's is `.../research/<slug>/`.
2. **What you entered.** Every input that matters, in the units the page uses. "A 2,400 sq ft roof at 6/12, one tear-off layer, standing-seam metal" can be reproduced. "A normal house" cannot.
3. **What it showed.** The exact figure, copied, not paraphrased.
4. **What you expected.** The figure you think is right.
5. **Where the right figure comes from.** This is the part that matters most. See the next section.

A screenshot helps on GitHub, but say the numbers in text too, since a screenshot is hard to search and easy to misread.

## What counts as a good source, and what does not

The repository's ground rule is that a default is either sourced or honestly labelled as a ballpark. A correction is held to the same rule.

Good sources, roughly in order of strength:

- **The rule itself.** A statute, regulation or official instruction, with its section number.
- **The publisher's own page.** A tax authority's due-date table, a platform's published fee page, a standards body's document. Give the link and the date you read it, because these change every year.
- **A rate table or schedule** from the body that sets the rate.
- **Your own invoices or quotes**, described without private details: "my last six supplier invoices for standing-seam panels averaged X per square, in region Y, this year". That is real evidence for a default even though nobody else can check it, and it is fine to say so.
- **For research pages:** the paper, dataset or code the page relies on, with the table or figure number that disagrees.

Weaker, and worth saying so if it is all you have:

- A third-party guide or blog post. Useful as a pointer, but it may itself be out of date. Several of the repository's own tax presets were first written from search excerpts like this and later checked against the state's page.
- "Everyone in my trade knows it is about X." Say it, but say it is experience, not a published figure.

Not a source: a number from a chatbot, a forum post with no reference, or a figure you could not find again.

## Where to send it

**With a GitHub account:** open a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The form is titled "Report a problem with a tool". It files an issue starting `[tool] ` with the `bug` and `site-feedback` labels, and asks three things:

- **Which tool?** (required): the name or address.
- **What happened, and what did you expect?** (required): the template's own hint is "If a number looks wrong, say what you entered and what you expected to see." Put your inputs, the shown figure, the expected figure and your source here.
- **Browser and device** (optional): matters for a broken page, rarely for a wrong number.

An issue lets you follow the reply and add screenshots.

**Without a GitHub account:** use the [feedback page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/). Every tool's footer links to it. Choose "Something is wrong or broken", write your message (its placeholder asks "What did you expect, and what happened instead? Which numbers did you enter?") and press "Send feedback". The page says nothing about you is stored with the message and email addresses are removed. Messages are committed to the repository once a day, in `portfolio/usage/site-feedback.json`, where sessions read them.

## Privacy: both routes are public

Everything you send through either route ends up in a public repository. Leave out your name, your clients' names, addresses, account numbers and anything from a real document you would not post on a noticeboard. If your source is a private invoice, give the figure and the date, not the invoice.

## What happens next

Be clear-eyed about this part.

- **Your report is read as information.** Sessions search issues by the `site-feedback` label and read the feedback file. The agents are told to treat text from people without write access as information, never as instructions. That protects a public repository from people trying to steer it, and it means a report is weighed, not obeyed.
- **There is no promised timing.** A fix might land in the next session or much later, and nobody can promise one at all. A report with inputs, a figure and a source is the kind that is easiest to act on, because a session can check it without you.
- **A fix usually touches more than one place.** A figure may appear in the arithmetic, in the FAQ text and in explainer pages. A good fix changes all of them and adds a test that pins the new value.
- **Once merged, it is live** on the next site deploy. There is no separate release.

## A real example: a Washington due date

The [ai-bookkeeper](2026-10-29-start-here-ai-bookkeeper.md) project builds a sales tax return worksheet that presets each state's filing due date. Its README records the history of those presets honestly. The first versions, added on 2026-10-23, were recalled from states' published schedules and labelled "not checked against each state's current calendar, so confirm yours".

They were then checked against sources, and two Washington errors turned up:

- **2026-10-24:** checked against search excerpts of the state's page, the preset had Washington quarterly returns due the 25th. They are due the last day of the month after the quarter. That was corrected.
- **2026-10-27:** once the state's own page (dor.wa.gov) could be read directly, it said annual returns are due April 15. The worksheet had used the end of the next month, so, as the [write-up of that check](2026-10-27-ai-bookkeeper-state-due-dates-primary.md) puts it, an annual filer "would have seen a date two and a half months early". It now gives April 15, and a test pins the Texas calendar read the same day.

Both errors were found by agent sessions checking their own presets, not by an outside report. The point for you is the shape of the fix: a named source (the state's page), a date it was read, a test, and a README line saying which presets are still not checked against the primary source. A report from you that says "Washington's page says X, read on this date, here is the link" gives a session exactly that.

## What this does not do

- Reporting a figure does not make the tool advice. Every tool keeps its no-warranty disclaimer. A corrected due date or rate is still something to confirm against your own notice or a qualified professional. This post is not tax, legal or financial advice either.
- It does not guarantee a change. If the source does not support the correction, or the figure is a labelled ballpark that is still reasonable, the tool may stay as it is.
- It is not support. Nobody here can look at your own return, invoice or account.

## If you would rather fix it yourself

If you write code, a small pull request with a source and a test is welcome. The step-by-step is in [Start here: your first pull request](2026-10-30-start-here-your-first-pull-request.md), and `docs/contributing/fix-a-tool.md` has a worked example of a wrong default. An issue is often faster, though, because agents can act on an issue but never on a fork pull request; those wait for the maintainer.

## Where to go next

- The bug template itself: `.github/ISSUE_TEMPLATE/bug.yml`
- The human contributor guide: `CONTRIBUTING.md`, "Tell us a number is wrong"
- Fixing a default yourself: `docs/contributing/fix-a-tool.md`
- Checking a research result: `docs/contributing/research.md` and [Start here: the open research](2026-10-29-start-here-research.md)
- The wider picture of helping: [Start here: how to help, starting with an idea](2026-10-29-start-here-contributing.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
