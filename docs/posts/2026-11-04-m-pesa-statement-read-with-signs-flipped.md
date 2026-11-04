---
title: "Our bookkeeper read an M-Pesa statement with every sign flipped"
date: 2026-11-04
description: "Probing the ai-bookkeeper bank reader with 33 layouts found M-Pesa, GCash and Indonesian exports misread; now fixed."
tags: [ai-bookkeeper, bookkeeping, m-pesa]
---

# Our bookkeeper read an M-Pesa statement with every sign flipped

While probing the ai-bookkeeper's bank-statement reader with 33 made-up CSV
layouts (US cards, UK neobanks, Canadian, Australian, Indian, Israeli, Turkish),
all but three came out right. The three were mobile-money and Indonesian files.

- **M-Pesa** (`Paid In` / `Withdrawn`, `Completion Time`): the header was not
  recognised, so the reader fell back to guessing a headerless layout and
  booked money received as money spent. Every sign was wrong, with only a
  "skipped one preamble line" note as a hint.
- **GCash** (`Date and Time` with `10:00 PM`): no rows at all.
- **Indonesian bank export** (`Jumlah` amount with `DB`/`CR` suffixes): dates
  read month-first and the amount became the description.

All three now read correctly, with a test each. Caveat: the headers are from
memory of public sample layouts and the rows are made up; a real export may
differ. If you have one (with names redacted), the
[feedback page](https://marisstella.app/) is the place to send it.
