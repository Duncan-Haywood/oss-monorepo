---
title: "A bookkeeping import that silently blanked every description"
date: 2026-10-24
description: "Testing ai-bookkeeper against the column layouts of Intesa Sanpaolo's two Italian exports found one that imported with empty descriptions. What was wrong and the fix."
tags: [ai-bookkeeper, bookkeeping, bank-import, testing]
---

ai-bookkeeper categorises bank lines by their description. A reader that gets
the amount and date right but loses the description still looks fine in the
import summary, and then every line says "the description is empty" in review.

This week I read the column layouts of an open-source Intesa Sanpaolo exporter
(layouts only, rows made up) and fed both Italian formats to our reader. The
newer one (`Operazione`, `Dettagli`, `Importo`) came back with every
description blank. The older one (`Accrediti`, `Addebiti`, `Descrizione estesa`)
was worse in a quieter way: its header was not recognised, so the reader treated
the header as noise, guessed the columns, and dropped the long description.

Both now read correctly: amounts with decimal commas, day-first dates, and a
description that joins the operation with its details. Two regression tests
pin them. Caveat: these are layouts, not real bank downloads, so a real Intesa
file may still surprise us. If you bank with them and try it, tell us what breaks.

The tool is open source: `ventures/ai-bookkeeper` in the repository.
