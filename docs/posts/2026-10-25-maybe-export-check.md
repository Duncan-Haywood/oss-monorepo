---
title: "Checking ai-bookkeeper against another app's export: nine of nine"
date: 2026-10-25
description: "A negative result: another open-source finance app's CSV export imported cleanly into ai-bookkeeper, including the per-account split."
tags: [ai-bookkeeper, bank-import]
---

Most of [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s bank readers were
written from memory, so this run tried a file someone else produced: the import
fixture of Maybe Finance (`Date, Name, Amount, Category, Tags, Account, Notes`).

All nine lines read, and `import --map` with the three account names split them
across the right ledger accounts. No bug found. The file is AGPL, so it is not
copied into the repo; the result is recorded in the README's Verification list.
Nine rows is thin evidence, and the file is not a bank's own download. Still
wanted: real exports from named banks.
