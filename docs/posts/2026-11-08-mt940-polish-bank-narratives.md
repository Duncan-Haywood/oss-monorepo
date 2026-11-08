---
title: "Polish MT940 Statements Keep Their Subfield Codes: a Small Bookkeeper Fix"
seo_title: "MT940 Import With >20 >31 >32 Narrative Codes Read Correctly"
date: 2026-11-08
tags: [ai-bookkeeper, mt940, bank-import]
description: "Two sample MT940 files from a public npm package showed payee names buried behind >20, >31 and >32 codes. The bookkeeper's reader now strips them."
---

The [AI bookkeeper](/ventures/ai-bookkeeper/) reads bank statements in MT940, the SWIFT text format many European banks export. Its reader already handled the German `?20..?32` subfield style and the Triodos `000>10..` variant.

The open-source npm package mt940js ships four sample files. Two of them, from Polish banks, write the narrative line as `>20purpose>31account>32name`, with no three-digit code in front. The reader only recognised the `>` form when that code was present. So the row description came out as `>20Usługi księgowe - m-c grudzien 2016 rok.>31491050195310000 0477656534>32BOOKING GROUP`: the payee was at the end, behind account numbers, and the categorizer and payee memory could not use it.

A leading `>NN` is now treated like `?NN`: the name goes first, then the purpose lines, so the example reads `BOOKING GROUP Usługi księgowe - m-c grudzien 2016 rok.` Lines shorter than the SWIFT width start a new word, which keeps `EUR= 4.5385` apart.

The test uses made-up rows in that layout, and its opening balance plus rows equals the closing balance. It was not run on a real Polish bank export, so if you have one (account numbers removed), the project wants it.
