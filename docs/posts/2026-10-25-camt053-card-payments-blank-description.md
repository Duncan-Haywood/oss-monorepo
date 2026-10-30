---
title: "A real camt.053 file showed our bookkeeper blanking card payments"
date: 2026-10-25
description: "AI Bookkeeper on Actual Budget's public bank-file samples: ISO 20022 card entries with text only after the details block came through with no description."
tags: [ai-bookkeeper, evaluation, bank-files]
---

AI Bookkeeper's bank readers had only been tested on files we wrote ourselves
or rewrote from other projects. This week we fetched the sample bank files in
Actual Budget's public test folder (MIT): an OFX file from a Bank of America
layout, a QIF file and a camt.053 statement. The OFX and QIF files read every
line, and the OFX closing balance came through.

The camt.053 file had six entries and two read with an empty description. One
was a card payment of 89.85 EUR. Its only text is `<AddtlNtryInf>Supermarkt
A</AddtlNtryInf>`, which the standard places after the `<NtryDtls>` block. Our
reader looked for it only before that block, so it never found it. A line with no
description cannot be categorised, and it reaches the books as a blank.

The reader now looks in the whole entry. A party name and remittance text still
come first, so entries that read right before read the same. Two tests cover
it, with our own snippets in the shape of the sample, not a copy.

One file from one project is thin evidence, and it is still a bank-style file
we did not write. We have not run the reader on a real German or Dutch bank
download. If you have an export you can share with the account numbers removed,
that is the most useful test left.
