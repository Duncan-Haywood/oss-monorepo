---
title: "Day first or month first? Let the statement's length decide"
date: 2026-10-24
description: "A bank CSV whose dates are all 12 or under can be read two ways. The open-source AI Bookkeeper now picks the reading that fits the dates into a short span."
tags: [bookkeeping, csv, open-source, dates]
---

# Day first or month first? Let the statement's length decide

`05/03/2026` is 5 March in most of the world and 3 May in the US. When a bank CSV has no date above 12 in either
position, nothing in the text says which. The AI Bookkeeper used to fall back to
month first unless a header gave a hint.

A statement covers weeks, not months. Take `05/03`, `06/03`, `08/03`, `09/03`:
read day first, that is 5 to 9 March. Read month first, it is May to September.
The importer now measures the span both ways and, with at least four dated rows,
takes day first when it fits in 45 days or less and the other reading takes 90 days or more. The
file's result says the dates were inferred. A passed `dayFirst` still wins, and a file of two or three
rows keeps the old default, because sparse US statements can legitimately span months.

The rule is a heuristic, tested on hand-made files only (`ambiguous-dates.test.mjs`);
no real bank export was tried. Full suite: 654 pass.
