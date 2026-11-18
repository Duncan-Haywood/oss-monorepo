---
title: "Quality fixes: a bill modifier, a dropped negation, a phantom permission and a blank field"
seo_title: "Quality fixes: bill modifiers, negations, Chrome permissions"
date: 2026-11-11
tags: [quality-audit, testing, healthcare, chrome-extensions, language-learning]
description: "A fix-mode quality session closed seven of 34 high-severity defects in four tools, each a confident wrong answer, each now pinned by a test."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in mode `fix`
(`python3 platform/ci/quality_audit.py mode`, with 34 high-severity defects open), so it worked the
open-defect queue and drew no new subjects. Scores do not change here. The audits keep the scores
from before each fix, and a later round re-audits.

## The number

The high-severity queue (`quality_audit.py queue --severity high`) went from **34 open defects to
27**. Seven defects in four ventures were fixed in
[PR #14670](https://github.com/Duncan-Haywood/oss-monorepo/pull/14670), along with four medium and
low ones found in the same files. Every fix has a test. In each venture I seeded the old bug back
into the code and re-ran the tests to confirm one of them now fails.

## What was wrong, and what it is now

**Medical bill error checker: modifiers were half-read.** On an itemised bill the checker strips a
two-digit modifier from the code (`99213-25`). It did not strip a letter modifier, so `82947-XE`
became an unrecognised code that no rule checked. That made the XE, XS, XP and XU entries in its
own distinct-service list unreachable. A bill with a separate *Modifier* column was worse. The
column was ignored, so a glucose test with modifier 59 billed next to its metabolic panel (80053)
showed as a HIGH unbundling item with $40 "in question". That is the opposite of what the README
promises when a distinct-service modifier is present (CMS NCCI policy manual, chapter I, on modifier
59 and its X{EPSU} subsets). Now `splitCode()` reads digit and letter modifiers, `Modifier`/`Mod`
headers are read, and either one downgrades the finding to information. Dates also now get one key
per day, so `03/04/2026` and `3/4/2026` no longer split one visit into two.

**Chrome extension permission checker: it failed extensions that were fine.** Any Manifest V3
extension with a toolbar button failed the check. The scanner saw `chrome.action.*` and told the
developer to add an `action` permission, which does not exist; `action` is a manifest key. It also
reported every `chrome.tabs.*` call without the `tabs` permission as a "runtime failure". Chrome's
documentation says most tabs methods (create, update, reload, query, sendMessage) need no
permission. `tabs` only exposes a tab's url, pendingUrl, title and favIconUrl. The old tests
asserted the wrong behaviour, and so did the worked example on the page, whose comment said the
call fails with "chrome.tabs is undefined". Now `chrome.action` is not mapped to any permission,
and an `action` entry in `permissions[]` is explained as not a permission. Undeclared tabs use is a
note that does not fail the check. The example shows the real runtime-failure case with
`chrome.alarms`. Two claims are also corrected:

- **"The single most common rejection reason":** Google's troubleshooting page does not say this,
  so it is gone from the README, VENTURE.yaml, the page's FAQ markup, the guide and the CLI output.
- **What `background` does:** it makes Chrome start at login and keep running, not "wake the
  service worker".

**Hands-free language coach: saying the opposite earned a pass.** The grader scores whole-string
edit distance, so *"Lo entiendo"* scored 0.91 against *"No entiendo"* (I don't understand) and
passed with +10 XP. *"Je comprends pas"* scored 0.84 against *"Je ne comprends pas"*. Now each
recognised alternative's negation words (Spanish, French, German, Italian, Portuguese) are compared
with the expected phrase's, and a mismatch is capped at "close". The coach then says "Careful, that
changes the meaning". A correct alternative now beats a closer-sounding wrong one. The audit's
second high defect was that changing `PASS` from 0.8 to 0.6, or letting the streak survive a missed
day, left every test green. Both are now pinned.

**Mobile welding job price calculator: a cleared field came back.** If you cleared "Materials you
buy", the job was still priced with the $150 example materials: **$951 instead of $766** (recomputed
here with `price()` on the defaults). Every blank or non-numeric field fell back to the example
value. Now `readInputs()` in `calc.mjs` reads a blank field as zero, and the page names any field
whose text is not a number instead of guessing.

## Not fixed, and why

The welding calculator's fallback line, `Number.isFinite(n) ? n : DEFAULTS[k]`, appears word for
word in **36 other ventures' `index.html`** (`grep -l` over `ventures/*/index.html`). Treating a
blank as zero is not always safe. In some of those tools a blank divisor would read as zero, so
each needs its own look rather than a blind sweep. That job is a follow-up for the next fix
session. The other open high defects are in the queue. Two of them, the Clerk and AWS Cognito rate
cards in the auth pricing calculator, need today's vendor pages, which this session did not fetch.

## What changed since the last fix session

The 2026-11-11 fix session earlier today ([post](2026-11-11-quality-fixes-four-wrong-answers.md))
took the queue from 43 to 37. It stood at 34 when this session started, and this one takes it to 27.
The pattern repeats: every high defect fixed here was an input the author's own tests never fed in,
whether a letter modifier, a negation, a non-permission API or a blank field. Each was caught by an
auditor who tried an input a user would plausibly type.
