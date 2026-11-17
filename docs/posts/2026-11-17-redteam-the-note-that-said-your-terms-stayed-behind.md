---
title: "Red team: the note that said your payment terms stayed behind when they hadn't"
seo_title: "Shareable contractor bid links: why the 'too long' note disagreed with the link"
date: 2026-11-17
tags: [red-team, testing, bid-calculators, proposals, mutation-testing]
description: "On 108 bid calculators, the warning that a proposal term was too long for a link measured different text from what the link carried. One shared helper and one test over all 109 copies fixed it."
---

About a hundred of the bid calculators on this site can put a job in a link:
door size, labour, travel, and the five terms of the offer (deposit, how long
the price holds, what is not included, the payment terms and notes). A prose
term over 512 characters is left out of the link whole, never cut in half, and
the page tells the sender which one stayed behind so they can send it another
way.

That warning was sometimes wrong. The encoder removes the control characters
that no proposal should print (form feeds, vertical tabs and the like, which
come along when text is copied out of Word or a PDF) before it checks the
512-character limit. The warning checked the raw text. A payment-terms clause
of 510 printable characters plus a few pasted control characters therefore
went into the link, and the page still told the sender it had been left out and
should be sent separately:

```
encodeTerms({ paymentTerms: 'x'.repeat(510) + '\u0007'.repeat(10) })
  -> "paymentTerms=xxx…" (523 characters: the clause is in the link)
overlongTermsNote(same)
  -> "your payment terms is too long to fit in a link and stayed behind …"
```

That sentence had a second, smaller error: "payment terms" and "notes" are
plural, so "is" and "send it" were wrong whenever one of those two was named
alone.

## Where it lived

The rule is in 109 files. Each venture directory is published on its own, so
shared code is copied into each venture rather than imported across the tree.
61 of the copies are `proposal-terms.mjs`, which a sync test holds identical
to `platform/proposal/terms.mjs`. The other 48 are `share.mjs` files built on
the shared bid spec, and those have no canonical file to sync against.

## The fix and the guard

Each copy now has a single `cleanTermText` function used both for measuring
and for carrying, so the two can't drift apart again. The verb agrees with the
label. Fixing one copy would leave the other 108 wrong, so the new test,
`platform/proposal/overlong-agrees.test.mjs`, imports every file that exports
`overlongTerms`. It checks that a term that travels is not flagged, that a
513-character term is flagged, and that the note's grammar fits the term it
names. Before the fix it failed on all 109 copies. After the fix, the
`platform/proposal` suite (116 tests) and all 108 affected venture suites
pass.

## The seeded faults

The run also seeded 24 faults into
`garage-door-bid-calculator/proposal-terms.mjs`, the file the draw picked.
The venture's tests caught 20. The other 4 cannot change behaviour. Two
examples: changing `after < 0` to `after < 1` makes no difference, because
`after` is either -1 or at least 8, and the loop above the line already
guarantees the `&` check that a flipped `&&` would skip. So the suite caught
every fault that can affect behaviour. The defect above wasn't found that way.
It turned up while reading the code and asking whether two functions that
should agree actually did.
