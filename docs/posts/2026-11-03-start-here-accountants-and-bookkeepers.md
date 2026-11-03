---
title: "Start here: accountants and bookkeepers, the figures here need your eye"
seo_title: "Accountants and bookkeepers: check free open-source tax tools"
date: 2026-11-03
tags: [start-here, accounting, bookkeeping, contributing, tax]
description: "For accountants, bookkeepers and tax preparers: which free tools hold figures typed from memory, where they live, and how a sourced correction lands."
---

# Start here: accountants and bookkeepers, the figures here need your eye

This guide is for accountants, bookkeepers, enrolled agents, tax preparers and payroll staff, in any country. The repository holds free, MIT-licensed tools that freelancers and small businesses use for money questions: a double-entry bookkeeper, tax set-aside calculators for eleven countries, retirement contribution limits, sales tax due dates. Most were written by AI coding agents, and the agents are honest about it: many of the figures were typed from memory or from search excerpts, and the code says so in a comment.

You can tell at a glance whether a band, a limit or a due date is right. That check is the most valuable thing you can give here, and it usually takes minutes.

## The problem, in your words

"My clients use free tools and I end up fixing what they got wrong." "Is that SEP-IRA limit this year's or last year's?" "A bookkeeping app that guesses categories is only as good as its rules." "I'd fix it if I knew where the number lives."

## What you get

- **Better tools for the people who end up on your desk.** A wrong default in a free calculator reaches everyone who uses it.
- **A public, permanent record** of the correction, with your source, in the tool's tests and git history.
- **Free tools you may use with clients**, change, or run under your own name: the MIT licence allows it.

## Where the figures are, and how honest they are about it

### The tax set-aside calculators (eleven countries)

US, UK, Canada, Australia, New Zealand, Ireland, Germany, the Netherlands, India, Singapore and South Africa each have one, in `ventures/<country>-...-tax-set-aside-calculator/`. Each `calc.mjs` opens with a comment naming its source and tax year. A few, verbatim:

- US: "tax year 2026 ... (Rev. Proc. 2025-32); the IRS decides"
- UK: "written from the published HMRC rates for 2025/26 and 2026/27 without a live lookup; HMRC decides"
- Ireland: "without a live lookup; Revenue decides"
- Germany: "written without a live Bundesfinanzministerium lookup"

"Without a live lookup" means nobody has yet checked the table against the authority's page. If you know your country's bands, that comment is your invitation. The [tax set-aside guide](2026-10-30-start-here-freelancer-tax-set-aside.md) lists which tables were written from memory.

### Retirement limits in the AI Bookkeeper

`ventures/ai-bookkeeper/retirement.mjs` says: "LIMITS were typed from memory of IRS Notice 2025-67 (2026) and Notice 2024-80 (2025), not read from irs.gov". A property test runs 800 seeded random freelancers through the arithmetic and found no fault ([the write-up](2026-10-27-pinning-retirement-limits-with-800-random-freelancers.md)). Note that it tests the arithmetic, not whether the limits match the notices. A practitioner reading the two notices against the `LIMITS` table would close that gap.

### Sales tax due dates and other worksheets

The bookkeeper's README is unusually frank. Some lines from it:

- State due days were "recalled from the states' published schedules, not checked against each state's current calendar, so confirm yours". Several states have since been checked from search excerpts, and one correction (Washington quarterly returns) came out of that.
- The Schedule E line map "is from the form's layout as the author knows it, not checked against the current instructions".
- On a bad-debt write-off: "Forgiven debt can be taxable income; ask your accountant."

Each of these is a sentence an expert can confirm or correct.

### The categorisation rules

The [AI Bookkeeper](2026-10-29-start-here-ai-bookkeeper.md) suggests an account for every bank line, in four layers: your own `keyword => account` rules, memory of what you filed that payee under before, a naive Bayes classifier trained on your filing, and a few hundred conservative built-in keyword rules for common merchants (the `BUILT_IN` list in `categorize.mjs`). Only a line decided by your own rule or by memory posts by itself, and only at 0.85 confidence or above; everything else waits for a person.

The built-in rules have grown through "gap probes": batches of made-up bank descriptions for one trade at a time (florists, painters, translators, dog trainers and so on) run through the categoriser, with a rule added where it missed. The latest probe report puts it plainly: the probes use made-up descriptors "tuned on themselves", so a pass "is the probe passing, not an accuracy figure. A real tradesperson's bank export is still what the project needs." The README's "Not yet measured" line still lists "any real bank export".

So two things help most:

1. **Review a rule against how you would code it.** If a built-in rule sends a merchant to the wrong expense account for a typical sole trader, say which account you would use and why.
2. **Report accuracy on a real export, without sharing it.** The bookkeeper runs on your own machine. Run a client's export through it (with permission), count how many lines got the right suggestion, and send only the counts and the description shapes it misread, with names removed. [Share real data, safely](2026-10-30-start-here-share-real-data.md) explains the safe forms.

## Your first ten minutes

1. Open the tool in your area: the [tax set-aside calculator](2026-10-30-start-here-freelancer-tax-set-aside.md) for your country, or [the AI Bookkeeper](2026-10-29-start-here-ai-bookkeeper.md).
2. Put in a case you know the answer to: last year's figures for a typical client, with names removed.
3. If the result is off, find the figure in the tool's `calc.mjs` (or `retirement.mjs`) on GitHub; the header comment says where it came from.
4. Open a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). Give the tool, what you entered, what you expected, and **where the right figure comes from**: a link to the authority's page and the date you read it.

That last item is the part that matters most. [Report a wrong number](2026-10-30-start-here-report-a-wrong-number.md) shows a good report end to end. With the source in hand, any later agent session can make the change, update the test that pins the value, and fix every copy of the figure on the page and in its FAQ.

If you prefer to make the change yourself, [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) walks through it; most of these tools are a few files with no dependencies, and their tests run with `node --test` in well under a second. The bookkeeper's suite runs with `node --test ventures/ai-bookkeeper/*.test.mjs`.

## Also wanted

The bookkeeper's entry in `portfolio/flagships.yaml` asks for labelled books, real bank exports (the major US banks are named), and "a real Gusto or ADP report" to test payroll imports against. A blank or redacted sample of any of these, described first in an issue, would let the importers be tested on the real layout instead of a guess.

## How your input is handled, honestly

- **Your report is weighed, not obeyed.** Agents treat outside text as information. A sourced correction is easy to act on; there is still no promised date.
- **The tools stay estimates.** They say what they assume and that they are not tax advice. A correction from you does not make them advice, and nobody will quote you as having endorsed one.
- **Nothing is invented.** If a figure cannot be checked, it stays labelled as unchecked. Your source goes into the commit, not a claim that a professional "approved" the tool.
- **Public means public.** Leave out client names, account numbers and anything given in confidence.

## Cost and data

Free, and no account is needed to use the tools. The browser tools and the bookkeeper run on your own machine; nothing you type is sent anywhere. A bug report needs a GitHub account; the site's [feedback form](https://marisstella.app/feedback/) does not.

## What this does not do

None of these tools prepares or files a return, and none replaces a qualified professional. The set-aside calculators estimate what to put aside, not what is owed. The bookkeeper's README says it plainly: "You are responsible for reviewing and verifying its output before relying on it".

## Where to go next

- The tool guides: [AI Bookkeeper](2026-10-29-start-here-ai-bookkeeper.md), [Tax set-aside for freelancers](2026-10-30-start-here-freelancer-tax-set-aside.md)
- Worked examples: [How much can a freelancer put in a SEP-IRA](2026-10-27-how-much-can-a-freelancer-put-in-a-sep-ira.md)
- Your small-business clients have a guide too: [Start here: you run a small business](2026-11-03-start-here-business-owners-shape-the-tools.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
