---
title: "The UAE line amount that no rule checks"
seo_title: "PINT UAE BTAE-10 and BTAE-08: line VAT and amount payable checks"
date: 2026-11-12
description: "PINT UAE makes every line state its VAT and amount payable, but no rule checks they add up. We added INV-060 and tested it on seeded faults."
tags: [ventures, einvoice-preflight, e-invoicing, UAE, oman, pint]
---

UAE businesses with revenue of AED 50 million or more go live on Peppol e-invoicing on 1 January 2027, and smaller ones on 1 July 2027 ([our UAE page](/ventures/einvoice-preflight/uae-e-invoice-mandate.html) cites the ministerial decisions). They will use the PINT UAE profile. Every invoice line in that profile states two amounts the European standard doesn't have: the line's VAT (BTAE-08) and its amount payable (BTAE-10), both inside `cac:ItemPriceExtension`. The UAE rule set requires both to be there. It never checks that they add up.

We measured that earlier today. In [einvoice-preflight](/ventures/einvoice-preflight/) we took OpenPeppol's 32 published UAE example files and moved one line amount at a time off by 7 dirhams. Then we ran our built-in checks and the official UAE rules over each changed file. A wrong amount payable drew no finding in **0 of 40** cases. A wrong line VAT drew one in 11 of 36. Our repair pass could already rewrite both figures, but nothing told anyone to run it.

So the checker now has **INV-060**. On a PINT UAE or PINT Oman file (Oman's BTOM-016 and BTOM-017 work the same way), it flags a line when:

- its VAT is more than 0.01 off the line net times the rate. The expected VAT is 0 for reverse charge, the UAE margin scheme and exempt lines.
- its amount payable is more than 0.01 off the net plus that VAT.

The 0.01 tolerance is the repair pass's tolerance. That way the checker never flags a figure the repair would leave alone, and the fix message gives the figure the repair would write. OpenPeppol's examples keep up to four decimals (999.375 at 5% is written 49.9688), so the message does too.

On the same published examples (phive-rules commit dfa902d), with each amount pushed off by 7, 0.05 and 0.02 in turn:

| Files | Correct files flagged | Line VAT seeds caught | Line amount seeds caught |
| --- | --- | --- | --- |
| PINT UAE 2026.5 (32) | 0 | 36 of 36 | 40 of 40 |
| PINT UAE 2026.3 (14) | 0 | 17 of 17 | 17 of 17 |
| PINT Oman 1.0.1 (49) | 0 | 124 of 124 | 124 of 124 |
| PINT Oman 1.0.0 (41) | 0 | 50 of 50 | 50 of 50 |

Two things went wrong on the way. First, our seeding script missed some 0.05 seeds. It turned out the script, not the check, was at fault: it rewrote a value like `524.3` with one decimal, so `524.35` rounded back to `524.3` and nothing had changed. It now writes at least two decimals. Second, PINT Malaysia uses the same `ItemPriceExtension/Amount` element but means something else by it. LHDN's own samples write 100.00 on a 5,000.00 line, so Malaysian files are left out on purpose.

Nobody has run this on a real UAE business's invoice yet, and we don't know what an accredited service provider does with an amount payable a few fils off. If you have a PINT AE file you can share, or an ASP rejection to compare, the [checker](/ventures/einvoice-preflight/) runs in your browser and the file stays on your machine.
