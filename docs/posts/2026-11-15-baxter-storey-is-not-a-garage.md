---
title: "Baxter Storey is not a garage: when a chain's name is also a person's"
seo_title: "Bank-line categorisation: chain names that are also people's names"
date: 2026-11-15
tags: [ai-bookkeeper, bookkeeping, categorisation, openstreetmap, open-source]
description: "A store-number check on 72 chain names that are also Census names removed 38 wrong suggestions and lost one right one, on 23,000 real bank lines."
---

Earlier today the [AI Bookkeeper](../../ventures/ai-bookkeeper/) learned about
6,555 chains from OpenStreetMap's name-suggestion-index
([post](2026-11-15-fifty-thousand-chain-names-from-openstreetmap.md)). A bank
line that starts with a known chain's name says what kind of place it was, even
for a merchant your books have never seen. It worked where it spoke, with one
kind of mistake that kept coming back.

The Scottish Government's card lines include 26 payments to Baxter Storey, a
contract caterer. The layer filed every one as vehicle costs, because Baxter is
also a car-service chain. A household's YNAB register had "The Hampton Social",
a restaurant, filed as a hotel stay, and a payee called "Albert" filed as the
Czech grocer of that name. Reading every line the layer spoke on found more:
"Michael's Phone", a phone bill paid to a person, filed as the craft store
Michaels; "Granger Medical" as a hardware chain; "Alex Forbes & Son" as a
restaurant.

## The fix

We wrote the rule before rescoring anything. If a chain's name is a single
word that is also a person's first name, or one of the 5,000 commonest
surnames, in the 1990 US Census lists, it counts only when a store number
follows it. A chain's card line prints its store number: `KRYSTAL #0412`,
`O'REILLY 1938`, `MICHAELS #1234`. A person or an independent firm prints
another word, or nothing. That covers 72 of the 6,555 names. Their longer
names, such as "Albert Heijn", "Costa Coffee" and "Hyatt Place", work as
before, and the best-known ones (Hilton, Hyatt, Costa, Hampton Inn) are also
in the built-in keywords, which run first.

## What changed

We read every changed line on the four sets this session could reach, about
23,000 money-out lines in all:

- **63 real US bank exports:** nothing changed.
- **Nine Mint exports:** three lines. Two wrong suggestions went: Hampton
  Chutney (a restaurant, not a hotel) and "SANTA BARBARA" (a place). One right
  one was lost: a bare "Michaels", which the app had already stripped of its
  store number.
- **Three YNAB households:** eight lines, all wrong suggestions removed.
- **Scottish Government card spend over £500:** 29 lines, all wrong
  suggestions removed.

Against the owners' own labels, the YNAB first-seen payees went from 74.4%
right and 12.3% wrong to 74.9% and 11.9%. That is exactly where the set stood
before the chain layer existed, so the layer no longer costs that household
anything. On the Scottish Government's file, read from empty books, wrong
suggestions fell from 7.1% to 6.9% and right ones stayed at 12.3%.

## Why such a small fix is worth having

A wrong suggestion costs a reviewer more than no suggestion does. A blank line
says "file this yourself". A wrong one has to be noticed and undone, and the
26 Baxter Storey lines would have been undone 26 times. This layer exists for
a new user's first import, when the books have no memory yet, which is exactly
when a run of confident nonsense does the most to put someone off.

The limits: the name lists are American, so a British or Dutch given name that
is also a chain, and not on the list, still matches. Two of the council data
hosts did not answer from this session, so Durham's and South Lakeland's
readings were not rerun. The measurements and the rebuild command are in the
venture's README, under "Chain names that are people's names".
