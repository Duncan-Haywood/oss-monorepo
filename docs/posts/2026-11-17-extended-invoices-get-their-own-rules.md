---
title: "Every one of FNFE's extended example invoices failed our checker. Now they pass, for the right reason"
seo_title: "Validate Extended-CTC-FR and Factur-X EXTENDED invoices, free"
date: 2026-11-17
tags: [einvoice-preflight, ventures, france, factur-x]
description: "E-Invoice Preflight now runs FNFE's EXTENDED-CTC-FR and Factur-X 1.09.2 EXTENDED rules on extended invoices: 175 of 175 runs match Saxon."
---

France's e-invoicing reform allows three formats: UBL, CII and Factur-X. Each comes in a plain EN 16931 flavour and an extended one. The extended profiles exist for invoices the European standard cannot express. A marketplace bills for several sellers on one invoice. A building contractor groups lines under a heading with sub-lines below it. Some line allowances change the sums in ways EN 16931 does not model. Germany's ZUGFeRD EXTENDED is the same Factur-X profile under another name, and many German suppliers send it.

Until today, [E-Invoice Preflight](https://marisstella.app/einvoice-preflight/) checked an extended invoice against the plain EN 16931 rules, plus France's BR-FR rules when the file was French. That was the wrong yardstick. We ran FNFE-MPE's 15 published extended examples (UBL, CII and Factur-X; multi-vendor, sub-line and self-billed invoices) and every one failed. Each got between 4 and 16 findings. Many were fatal: the sum of line nets does not match (BR-CO-10), a GROUP line has no quantity or price (BR-22, BR-26), more than one seller. Those are exactly the things the extension allows. A checker that rejects the format's own examples is worse than no checker, because people learn to ignore it.

## What changed

FNFE-MPE publishes a base rule set for each extended profile in [fnfempe/France_RFE](https://github.com/fnfempe/France_RFE) (Apache-2.0). EXTENDED-CTC-FR is a modified copy of the EN 16931 rules, in UBL and CII, and Factur-X 1.09.2 EXTENDED covers CII. The checker now reads the profile id in the invoice (BT-24). When it names Extended-CTC-FR, Factur-X EXTENDED or ZUGFeRD 2.0 EXTENDED, that profile's base runs instead of the EN 16931 base, and the French BR-FR rules still run after it. All of it runs in the browser; the invoice is not uploaded.

There was one snag. The Factur-X rule file does not list its codes inline. It looks them up in a side file, `FACTUR-X_EXTENDED_codedb.xml`, that holds 53 code lists and 8,491 codes. The browser's XPath engine cannot open side files, so on a first run 30 to 40 checks per invoice were silently skipped. The build step now copies each list into the rule that uses it. No check is left out.

If a copy of the page is missing the extended rule file, the check says "unavailable". It does not fall back to the EN 16931 verdict.

## How we checked it

As a reference we used Saxon-JS running FNFE's own compiled XSLT for each base. We ran each of the 15 examples as published, then broke each one up to eleven ways: an unknown type code, currency, unit, country or VAT category, a line net off by 10, a tax total off by 1, a missing seller name, and so on. That gave 175 runs. Both engines reported the same rule ids on all 175, 43 distinct ids in total, and no check was left unevaluated. The 15 published files pass.

Made-up examples only go so far, so we also took the public [ZUGFeRD corpus](https://github.com/ZUGFeRD/corpus), pulled the XML out of its 99 "correct" PDFs and kept the 13 files that name an extended profile. These are vendor samples from intarsys, symtrax and Mustang. Under the old EN 16931 base, four of them got fatal BR-CO-12 and BR-S-08 findings that neither the Factur-X rules nor Saxon raise. Those are gone now. What is left is real: these samples date from 2019 to 2021, and some of their codes have since been retired. The clearest case is electronic address scheme 9958 for a German Leitweg-ID, which is now 0204. The old checker caught those under EN 16931 rule ids, and the new one still catches them. Our engine and Saxon agree on all 13 files.

## What we have not checked

None of these files came from a real French platform (PA), and we have not compared a real platform rejection. The Factur-X rules' own messages are terse ("Value of '@schemeID' is not allowed"). The report shows where in the file the problem is and adds a generic fix, but it does not yet name the code list. The full tables are in the venture's `eval/extended-base-crosscheck-2026-11-17.md`.

If you send or receive extended invoices, [drop one in](https://marisstella.app/einvoice-preflight/) and tick "official Schematron". If a platform rejects a file the checker passes, we would like to see the rejection.

*This is a free, open-source pre-check, not legal or tax advice. A platform's or tax authority's own validator has the final word.*
