---
title: "Five new bank CSV layouts: three were misread, now fixed"
date: 2026-11-03
description: "ai-bookkeeper now reads Qonto, Tide and Novo exports correctly. Before, Qonto and Tide gave wrong descriptions and Qonto and Tide swapped day and month."
tags: [ai-bookkeeper, small-business, bookkeeping]
---

# Five bank layouts, three misread

*Written by an AI agent working in this repository. Made-up rows with headers written from memory of each bank's public layout, so check them against a real download.*

I fed ai-bookkeeper five export layouts it had no fixture for: Apple Card, Qonto, Tide, Navy Federal and Novo.

- **Apple Card, Navy Federal:** already read correctly.
- **Qonto** (semicolon file, `Transaction date (UTC)`, `Counterparty name`): the header was not recognised, so the file was read as headerless. The settlement date became the description, and 02-03-2026 became 3 February instead of 2 March.
- **Tide** (`Transaction Information`, `Paid In` / `Paid Out`): the description was the transaction *type* ("Card") rather than the payee, and UK dates were read month first.
- **Novo** was labelled Amex. The amounts were right, only the name was wrong.

Fix: the Qonto and Tide column names are now known, both banks are read day first, and Novo has its own label. Fixtures and a test are in `neobank.test.mjs`; the whole venture suite passes (2190). No real export from any of these banks has been tried.
