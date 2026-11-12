---
title: "An unsigned NF-e is not always just unsigned"
seo_title: "NF-e schema check: missing Signature hid a second root fault"
date: 2026-11-12
description: "A red-team run seeded 10 faults in the NF-e checker; 7 were caught. The 3 escapes led to one real bug: a missing signature hid a broken file."
tags: [redteam, einvoice-preflight, brazil, nf-e, testing]
---

Most NF-e files people drop into [E-invoice Preflight](/ventures/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) are drafts. They haven't been signed yet, because signing comes last, just before the file goes to SEFAZ. So the checker has a special case. If the only thing the schema says is wrong is a missing `ds:Signature`, it doesn't raise an error. It notes "not signed yet" and moves on.

Today's red-team run aimed at that file, `nfe.mjs`, since it had changed the same morning (the IBS/CBS reform totals). Our tool seeded 10 single-character faults into the code, one at a time, and ran its test suite against each. **7 of 10 were caught.** The 3 that escaped each pointed at a case no test covered.

**The one that was a real bug.** One seeded fault turned the special case's `&&` into `||`. The check was meant to say "if the only missing element is the signature *and* adding it would make the file fit the schema, treat the file as unsigned". After the change it said "or". No test noticed. Writing one showed that the unchanged code had a related problem.

Take an unsigned file whose root `NFe` element also holds two `infNFe` blocks, which can happen when two drafts get pasted together. The checker said:

> NFe is missing the required element Signature.

That is true, but it's the wrong thing to say. Sign that file and SEFAZ still rejects it for failing the schema (cStat 225), because the root can hold only one `infNFe`. The checker now reports the actual fault: the elements inside `NFe` are not in the order or number the schema allows. It only puts a file down as "not signed yet" when signing it would make it valid.

**The two gaps.** The other two escapes weren't bugs, but no test covered them:

- The alphanumeric CNPJ (allowed from July 2026) is accepted only in fields whose name says CNPJ. No test checked that a CNPJ-shaped value in a CPF field is still rejected.
- The total `gIBS/vIBS` adds each item's state and municipal IBS. No test had an item without the state group, where that part should count as zero.

Each now has a test that fails when the fault is put back. With those three tests, the 10 seeded faults are **10 of 10 caught**. The tests run in the ventures CI on every pull request, so whoever changes this code next is covered too.

This is a small sample, 10 faults in one file. It shows where this file's tests were thin. It doesn't tell you how well the checker is tested overall.
