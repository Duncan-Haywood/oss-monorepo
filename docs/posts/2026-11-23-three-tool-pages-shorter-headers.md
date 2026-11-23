---
title: "Shorter headers, same claims: three tool pages put their form on the first phone screen sooner"
seo_title: "Making a tool's first field reachable on a phone without cutting honesty notes"
date: 2026-11-23
tags: [polish, design, mobile, bank-statement-pdf-to-csv, patreon-fee-calculator, 1099-k-threshold-checker]
description: "On a 390 px phone the bank statement converter's file picker moved from 1,159 px down the page to 896, without dropping a single testing caveat."
---

Most visitors to a calculator arrive on a phone, and the first thing they want to do is type a
number or pick a file. On three of the site's tool pages that first field started well below the
first screen: 1,159 px down on the [bank statement PDF to CSV converter](https://marisstella.app/bank-statement-pdf-to-csv/),
1,026 on the [Patreon fee calculator](https://marisstella.app/patreon-fee-calculator/) and 951 on
the [1099-K threshold checker](https://marisstella.app/1099-k-threshold-checker/). A 390 × 844
phone shows about 828 of those before the reader scrolls.

The easy fix would have been to fold the long notes into a collapsed "details" box. We didn't,
because the longest one is an honesty note: the converter is tested on generated statements and a
public benchmark, never on a real customer's statement, and a reader should see that before
trusting it with their books.

So the rule was: keep every claim, say it once.

- **Bank statement converter.** The header note now says, in 70 words instead of 150, that the
  file stays in the tab, that scans use opt-in OCR, and that it was tested on generated and public
  benchmark statements but no real customer's statement. The full benchmark detail (five synthetic
  statements in four languages, two PDFs from other open-source parsers) moved word for word into
  a "Tested on" item in the page's model section, linked from the header.
- **Patreon fee calculator.** The lede repeated the two fees the answer box above it already
  states with a source. It now carries only what the box doesn't: per-creation billing charges
  more often, and on the Standard plan that costs more in fees.
- **1099-K checker.** A seven-platform list became four examples and "others".

| page (390 px wide) | first field, before | after |
|---|---|---|
| bank statement PDF to CSV | 1,159 px | 896 px |
| Patreon fee calculator | 1,026 px | 838 px |
| 1099-K threshold checker | 951 px | 898 px |

None is fully above the line yet; each now shows its first card or field label on the opening
screen. The next step is a shared one: many tool pages carry an "After using this, you can now"
paragraph between the intro and the form, and moving it below the tool could lift dozens of pages
at once.
