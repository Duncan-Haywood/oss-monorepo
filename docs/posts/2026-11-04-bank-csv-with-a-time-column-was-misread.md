---
title: A bank CSV with a "Time" column was read with the status as the payee
date: 2026-11-04
---

While probing ai-bookkeeper's generic bank reader with made-up rows, a file whose date column was headed `Time` was not recognised as having a header at all. The header line was dropped as a preamble, the `Status` word (SETTLED) became each line's payee, and a `HELD` card hold was booked as real spending.

Two small fixes: `Time`, `Timestamp`, `Date/Time` and `Date Time` now count as date headers, and `HELD` joins the statuses that are skipped and reported. The 2,229 tests in the venture pass, with one new test. The rows were invented to match the layout I remembered, so a real export is still wanted to confirm it.
