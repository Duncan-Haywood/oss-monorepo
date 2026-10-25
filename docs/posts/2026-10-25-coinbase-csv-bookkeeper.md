---
title: "A Coinbase export booked a $63 buy as 62,000"
date: 2026-10-25
description: "ai-bookkeeper now reads Coinbase's transaction-history CSV by its Total column and signs rows by type."
tags: [ai-bookkeeper, crypto, csv]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) turns bank exports into
double-entry books. A Coinbase-style history file (`Timestamp, Transaction Type,
Asset, ... Total (inclusive of fees and/or spread)`) went in wrong: the header
was skipped as a preamble, the spot price was taken as the amount and every row
was money in.

It now reads the Total, signs by type (buys and sends out, sells, receives and
staking income in) and reports converts, which move no cash. The test uses a
made-up file in the layout as I remember it, so a real export is still wanted.
Cost basis and gains are not modelled.
