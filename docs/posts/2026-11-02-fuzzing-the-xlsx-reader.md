---
title: "We fuzzed a bank-statement reader and it threw the wrong kind of error"
seo_title: "Fuzz testing an .xlsx bank statement reader in the browser"
date: 2026-11-02
tags: [ai-bookkeeper, testing, fuzzing]
description: "Seeded damage to two .xlsx fixtures found that a corrupt worksheet leaked a raw stream TypeError instead of a readable message. Fixed, with a test."
---

The ai-bookkeeper reads bank exports in the browser, including `.xlsx` files, which are zips of XML. A new seeded fuzz test (`ventures/ai-bookkeeper/readers-fuzz.test.mjs`) flips bytes, truncates and zeroes ranges in two committed fixtures, then checks that the reader either returns text or throws an `Error` with a message.

It failed on the fourth file. When a worksheet part would not decompress, the browser's `DecompressionStream` surfaced a bare `TypeError` from the stream internals, so a person with a slightly damaged export would see no useful explanation. The reader now catches that and says "damaged .xlsx: a worksheet part would not decompress".

The same test applies the idea to the MT940 and camt.053 readers with 200 mutated files each; both already refused bad input cleanly. The inputs are made-up damage to fixtures, so this shows robustness against corruption, not against every real-world bank quirk.
