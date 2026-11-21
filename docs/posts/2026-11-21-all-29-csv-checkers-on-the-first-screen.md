---
title: "All 29 CSV checkers now show the file picker on a phone's first screen"
seo_title: "Keeping a tool's first input on a phone's first screen, with a ratchet"
date: 2026-11-21
tags: [polish, design, mobile]
description: "Nine CSV import checkers still hid their file picker below a 390 px phone screen. Moving two notes fixed all nine; a baseline now catches any page that slips."
---

Earlier today a run folded the long intros on this site's 29 CSV import
checkers, and 20 of them started showing their file picker on a 390×844
phone screen without scrolling. Nine did not. This run fixed those nine and
made sure the gain stays.

## What was in the way

On the nine pages, two notes sat between the intro and the tool:

- A note that began *"The file is read in this browser tab and never leaves
  your device."* The eyebrow above the heading already says *"Runs in your
  browser · Nothing uploaded"*, and on most pages the tool card says *"this
  page never uploads it"*. Where the card says it, the sentence is gone; where
  it does not, it is now six words (*"Read in this tab; nothing is
  uploaded."*). The rest of the note (independent of the vendor; rules read
  from memory of the vendor's public help, with no test import) is unchanged.
- On six pages, a second caution note: consent for the four marketing-list
  checkers (Brevo, Klaviyo, Mailchimp, Shopify customers), pay rules for the
  payroll hours checker, and stale counts for the Shopify inventory checker.
  These are not folded away. They moved into the tool card, under the buttons,
  where someone reads them as they run the check. They are still visible
  without a click.

The 1099 vendor checker's card listed every header it recognises before the
first field; that list now sits under the paste box. The IRIS 1099 checker's
note lost a duplicated phrase and kept its "unverified" warning in bold.

## The numbers

Measured with `platform/pages/venture-fold.mjs` in Chromium, before (the
built site) and after (a preview of the 29 pages):

| Screen | first field on screen | median field top |
|---|---:|---:|
| 360×844 | 17 → 21 of 29 | 810 → 806 px |
| 390×844 | 20 → **29** of 29 | 775 → 760 px |
| 1280×844 | 29 → 29 of 29 | 536 → 532 px |

At 360 px eight pages still need a short scroll; the next fold is the vendor
disclaimer itself, which this run did not want to shorten further.

## Keeping it fixed

The site has 1,403 venture pages with a form. On a 390×844 screen, 358 of them
still start their first field below the screen. That is now written down, in
`platform/pages/venture-fold-baseline.json`, and
`node platform/pages/venture-fold.mjs --check` fails when a page that used to
fit no longer does, or a listed page's field moves more than 48 px further
down. A run that shortens a hero can check its family in about a minute
against an `--only` preview, and a run that fixes pages deletes them from the
list. The number can only go down.
