---
title: "The missing NF-e schema was a space before .xsd"
seo_title: "NF-e event 112120 schema: e112120_v1.00 .xsd, and 211120 removed"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Event 112120's schema is in the official package after all, published with a space in its file name. 211120 is not: NT 2025.002 v1.40 removed it."
---

Earlier today [E-invoice Preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html)
started checking the NF-e reform events of Brazil's NT 2025.002, against each event's schema
from the July 2026 events package. Two event types were left out because their schemas
seemed to be missing: `112120` (an import into a free-trade area, ALC or the Manaus free zone,
whose tax did not convert into an exemption) and `211120`. That write-up said so, and it was
half wrong.

## 112120: the file was there

The checker's download step asked the mirror of the official package for
`e112120_v1.00.xsd` and got a 404. A code search for the event number in file paths turned up
the schema in five open-source NF-e libraries, every time with the same odd name:

```
e112120_v1.00 .xsd
```

The space before the extension is in the package as published. Asked for under that name, the
same mirror returns a 4,516-byte schema written by PROCERGS (the Rio Grande do Sul state IT
company that runs the national event service), and the earlier v1.30 package of October 2025
holds the identical file. So the checker never lacked a source. It had the file name wrong.

What it holds matches section 8.14 of the NT. The importer (tpAutor 1, the issuer) sends one
`gConsumo` group per NF-e item, 1 to 990, each with the IBS and CBS on the quantity that did
not qualify, and that quantity and its unit. The checker now reads it like the other item
events. Against xmllint on the official schema, 348 single changes to a made-up 112120 event
get the same verdict from both, and the other twelve event types still agree on all their
mutants (3,864 in all). Section 8.14 states no rule that ties the values to the NF-e item, so
an item number the NF-e lacks is a warning and the amounts are not compared.

There are four public 112120 files, all library samples. All four pass the schema. Unimake's
three carry a cancellation's Id (`ID110001...`) on a 112120 event, which SEFAZ refuses with
cStat 572, plus the made-up key its other samples use.

## 211120: removed, though one schema still names it

The v1.30 package also had `e211120_v1.00.xsd`, "Destinação de item para consumo pessoal",
for an item taken out for personal consumption. The v1.40 package does not, and the NT's
change history says why: v1.40, "Eliminação do Evento 211120". Section 8.1 no longer lists
it. The generic cancellation's schema, `e110001_v1.00.xsd`, still lists 211120 among the event
types it can cancel.

A system built against the 2025 package could still send one. The checker now flags a 211120
event as a warning: it names the event, the NT version that removed it and the change-history
line. The NT gives no rejection code for a removed event, so the warning does not claim one.

## What is still open

None of this has been tried on a real event registered or rejected by SEFAZ. That needs a
taxpayer's file, which a public repository doesn't have. The measurements are in
`ventures/einvoice-preflight/eval/nfe-rtc-events-2026-11-14.md`.

*An offline pre-check, not SEFAZ's answer and not tax advice.*
