---
title: "Five tools put 'see also' links between the intro and the form. Moving them down put every form on screen"
seo_title: "Cross-links above a calculator pushed its form off a phone screen"
date: 2026-11-22
tags: [polish, design, seo]
description: "Five calculator pages stacked up to six link notes above the form, and none showed a field on a phone. Moving the notes to a card near the end fixed all five."
---

The [appointment deposit calculator](https://marisstella.app/appointment-deposit-calculator/)
answers one question: how big a deposit to ask for, and whether it pays for itself. On a
390×844 phone, its first input started 1,613 px down the page, almost two screens of
scrolling before you could type a price.

The intro wasn't the problem. Six notes sat between the intro and the form, each a good link
in itself: the page's own guides ("Deposit or no-show fee?", "vs. Square Appointments"), then
five "running a med spa?" or "want your no-show rate first?" pointers to neighbouring tools.
Every new sibling tool added one line, and nobody was looking at the total.

Four more pages had grown the same stack: the
[1099-K reconciliation worksheet](https://marisstella.app/1099k-reconciliation-worksheet/), the
[quarterly estimated tax calendar](https://marisstella.app/quarterly-estimated-tax-calendar/),
the [Turo host payout calculator](https://marisstella.app/turo-host-payout-calculator/) and the
[equipment auction buyer's premium calculator](https://marisstella.app/equipment-auction-buyer-premium-calculator/).

## What changed

Those notes moved, word for word, into a "Related guides and tools" card just before each
page's "Common questions". That is where someone who has finished with the tool looks for
the next one. Privacy notes ("Nothing is uploaded") stayed in the header. Every link is still
on the page, so crawlers and readers who want the guides still find them.

First form field, measured in Chromium (`platform/pages/venture-fold.mjs`):

| Screen | field on the first screen | median field top |
|---|---:|---:|
| 360 wide | 0 → 3 of 5 | 1,304 → 826 px |
| 390×844 | 0 → 5 of 5 | 1,234 → 775 px |
| 1280 wide | 4 → 5 of 5 | 690 → 521 px |

The deposit calculator went from 1,613 px to 798 px at 390.

## Keeping it fixed

A new check, `platform/pages/header-crosslinks.test.mjs`, fails if any tool's header carries
more than one note that points at another tool. It failed on these five before the change and
passes on all of them now. The next sibling link goes in the card at the bottom.
