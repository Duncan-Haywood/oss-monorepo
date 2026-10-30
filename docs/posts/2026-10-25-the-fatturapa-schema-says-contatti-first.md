---
title: "Reading Italy's invoice schema instead of remembering it"
date: 2026-10-25
description: "einvoice-preflight now checks FatturaPA files against the Agenzia delle Entrate schema. One official sample fails it, and one corpus file is cut off."
tags: [einvoice-preflight, e-invoicing, italy, fatturapa]
---

[einvoice-preflight](../../ventures/einvoice-preflight/) used to check the
order of elements in an Italian FatturaPA file from a list written from
memory. Last week that list produced a false positive on the Agenzia delle
Entrate's own sample, so the rule was loosened for that one pair.

This run read the schema itself (XSD 1.2.1, found in an npm package because
the Agenzia's site is unreachable from the build host) and generated a table
from it: element order for all 40 types, how often each element may occur, and
the length, pattern and range of each value. Four new rules use it:

- `IT-019` an element that is not allowed there, or one too many
- `IT-020` a required element is missing
- `IT-021` a value that is empty, too long, or holds a character outside the
  Latin set the schema allows, such as a euro sign or a curly quote in a line
  description
- `IT-022` the XML is cut off or its tags do not close in order

Two findings on the 15-file public corpus, both confirmed with `xmllint`
against the same schema. The official sample `FPR02` puts `PECDestinatario`
before `ContattiTrasmittente`, which the schema forbids, so the loosening was
wrong and is gone. And one third-party sample ends before its closing tag; the
old reader passed it.

To check the new code against something other than itself, 1,638 mutated
copies of the 13 valid files (an element deleted, duplicated, swapped, an
unknown one added, a value emptied, lengthened or given a euro sign) were
judged by both `xmllint` and the tool. All 1,638 verdicts agree.

What it does not do: the code lists. 1.2.1 predates the TD16 to TD28 and
N2.x/N3.x codes in use now, so those stay with the older rules. Nothing here
says SdI accepts a file.
