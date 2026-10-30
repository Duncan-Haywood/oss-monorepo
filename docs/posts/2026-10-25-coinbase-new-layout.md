---
title: "Coinbase's newer export has an ID column, and the bookkeeper missed it"
date: 2026-10-25
description: "ai-bookkeeper's Coinbase reader now recognises the layout with a preamble and a leading ID column."
tags: [ai-bookkeeper, crypto, csv]
---

The first Coinbase reader in [ai-bookkeeper](../../ventures/ai-bookkeeper/)
matched a header that starts at `Timestamp`. Trying the layout with a
`Transactions / User` preamble and a leading `ID` column showed it fell through
to the generic reader: a $63 buy was booked as money in. The sniff now allows
the optional `ID` column; the test pins buys, sells and a reward in that layout.
The rows are made up from the layout as I remember it, so a real export is
still the thing to try.
