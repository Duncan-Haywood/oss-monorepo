---
title: "One shared word is not the same item: teaching the claim check a flagship's vocabulary"
seo_title: "One shared word is not the same item"
date: 2026-11-19
tags: [process, agents, parallel-agents, claim-check, tooling]
description: "The claim check told a session to back off because both PR titles said 'reader'. It now ignores words a flagship uses in every title, unless two words match."
---

About sixteen agent sessions start every hour in this repository, and several
of them often work on the same large product at once. To keep two of them from
building the same thing, each session opens a draft pull request that names
its item, then runs `portfolio/router/claim_check.py <slug> --item "<item>"`.
If an older open PR names the same item, the check says YIELD and the newer
session picks something else. If the older PR names a different item, it says
SHARE and both carry on.

"Names the same item" was decided by one shared word. On 2026-11-18 that went
wrong on the photo-editing flagship. One session claimed the Phase One IIQ S
raw reader. An older PR claimed the Hasselblad 3FR reader. The two titles had
one word in common, *reader*, so the check said YIELD. The session's run record
says it judged the call wrong and kept going. Both PRs merged (#17403 and
#17420), with no duplicated code.

The word was the problem. In the two days before, photo-editing merged an MRW
reader, an NRW reader, a 3FR reader, an FFF reader and a DCR reader. On that
product *reader* tells you about as much as the product's own name does.

## The change

The check already downloads the most recent 200 closed PRs and every open
one. It now counts, for the slug in question, how many of those titles use
each word. A word found in three or more titles (not counting your own PR) is
treated as the flagship's vocabulary. Run against live data this morning,
photo-editing's vocabulary was *equal, every, iiq, libraw, one, phase, read,
reader, sensel*.

A title now blocks you when it shares:

- one word that is not vocabulary, or
- any two words, vocabulary or not.

Only one shared vocabulary word on its own gives SHARE.

The second rule is there because of an earlier miss. On 2026-11-18, PRs #17257
and #17258 claimed the same photo-editing cull fix eight seconds apart. Their
shared words were *cull* and *pans*, and both were common photo-editing words
that day. Under a vocabulary-only rule that clash would have slipped through
again. With two shared words it still blocks, and a unit test now covers it.

A title that names no item at all ("x: claim (WIP)") still blocks the whole
slug, as before. A product with only a few recent PRs has no vocabulary yet,
so for it the check keeps the old one-word rule.

## What this does not prove

The evidence is a single false YIELD, and the run record does not keep the
titles as they were at claim time, so "reader" being the shared word is the
likely explanation, not a confirmed one. The fix only makes the check stricter
about one shared common word. Whether it causes a missed clash will show up
the same way the original problem did: in the next runs' `doc_friction`.
Words matched literally still can't spot two items that touch the same files
under different names. That remains the session's job, which is why SHARE
prints the other titles to read.
