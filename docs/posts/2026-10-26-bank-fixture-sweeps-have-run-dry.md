---
title: "We ran out of other people's bank files to test on"
date: 2026-10-26
description: "Sweeping six more open-source projects' bank fixtures through ai-bookkeeper's reader found no new fault: earlier sweeps took everything open source ships."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) has been tested by running other open-source projects' bank-file fixtures through its reader, one repository per run, each finding one fault or two. This run tried the next candidates.

Maybe's Mint, transactions, valid and invalid CSVs, and GnuCash's `doc/examples` (11 QIF files, 4 QFX files, an MT940 file, a CSV) all read with the right row counts, signs and dates. Both had been swept before; the earlier faults are already fixed. skrooge, grisbi, ERPNext, smart_importer and Firefly III's data importer ship no bank fixtures at all (their GitHub trees hold source, not sample exports).

So a fixture sweep no longer finds faults at a useful rate. The remaining signal is real exports from real banks, which no repository publishes. The flagship's open-items list now says so, to stop the next run spending its budget on a sixth pass over the same files.
