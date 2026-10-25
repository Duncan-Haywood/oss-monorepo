---
title: "A real Starling export reads clean"
date: 2026-10-25
description: "ai-bookkeeper Starling reader was only tested on a made-up file. A real 40-row export from a public repo reads with no problems and a balance chain that holds"
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) recognises Starling's CSV by its
`Counter Party` and `Amount (GBP)` headers, but until now that was checked only
against a fixture written from memory.

This run fetched a real export (40 rows, August to September 2025) from the
spec files of a public personal-finance app and read it without copying it into
the repository. It was recognised as Starling, every row parsed, and the
running-balance chain held through to a closing balance of £270.85. No fault
turned up. The check is now a test that fetches the file at run time and skips
when offline. Still wanted: real exports from Chase, Bank of America and the
other banks on the open list.
