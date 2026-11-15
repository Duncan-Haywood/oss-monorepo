---
title: "Our tender checker read a required bid bond as waived"
date: 2026-11-15
tags: [redteam, tender-bid-readiness, testing, procurement]
description: "One 'not required' anywhere in a sentence marked every signal in it as waived. A red-team run fixed it clause by clause and seeded 20 faults."
---

The [tender bid readiness checker](https://marisstella.app/tender-bid-readiness/)
reads a pasted solicitation and lists seven signals a bidder must not miss:
the deadline, bonds, insurance, licences, a mandatory site visit, the
submission channel and the question period. Since a quality audit on
2026-11-12 it also says when the text appears to *waive* one ("A bid bond is
not required"), so a bidder isn't told to chase a bond nobody asked for.

Today's red-team run found that the waiver check looked at the whole
sentence. Paste this:

> A 5% bid bond and proof of insurance are required, but a site visit is not required.

and the page said the bond and the insurance were "Stated as not required".
The "not required" belonged to the site visit. A bidder who trusted that line
and skipped the bond would have had the bid rejected, which is the costliest
mistake this tool can make. Two more inputs went wrong the same way:

- "A bid bond is required while insurance is not required." waived the bond.
- "Firms with no local office will be required to attend the mandatory site
  visit." matched the "no ... will be required" waiver pattern, so a mandatory
  visit read as optional.

A third, milder one went the safe way: "No pre-bid site visit will be held."
was not seen as a waiver, because the word pattern stopped at the hyphen in
"pre-bid".

## The fix

The check now reads the clause that holds the keyword, not the sentence.
Words like *but*, *however*, *whereas*, *while* and *although* start a new
clause. Inside a clause, a stated requirement ("is required", "must
provide", "shall submit") outweighs a waiver, so a mixed clause such as "A
bid bond is required and insurance is not required" reports both as found.
That errs on the side a bidder can afford: being told to check something
that turns out to be optional. "required to attend" no longer counts as a
waiver, and hyphenated words count as one word. Shared waivers still work:
"A bid bond and insurance are not required" waives both.

## What the tests caught

The run also seeded 20 faults, one at a time, with `prompts/redteam.py`:
10 in the [UCR fee calculator](https://marisstella.app/ucr-fee-calculator/)
and 10 in the tender checker. The UCR suite caught 9 of 10, and the one
that got through changes a fee on a row the page never shows, so it cannot
matter. The tender suite caught 5 of 10. The five that got through were
real holes: "SF 30" on its own was never tested, nor how far a "no ... will
be held" waiver reaches, nor how long the quoted evidence runs, nor the
message shown when every signal is found. Each now has a test, and each of
the five faults fails the suite. Across both files, 14 of 19 faults that
could matter were caught before the fix and all 19 after.

The checker is still a keyword reader, and the page says so: green means a
phrase was found, not that a requirement is met. Read the solicitation and
its addenda yourself. The run record with every seeded fault is
`prompts/runs/2026-11-15-session_01E5sJKmMRkNpZrXdD1mYhYj.json`.
