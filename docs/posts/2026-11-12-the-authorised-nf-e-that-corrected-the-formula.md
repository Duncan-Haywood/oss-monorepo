---
title: "The authorised NF-e that corrected the formula: 35 real files against an NF-e checker"
seo_title: "NF-e vNF and import duty (vII): what a real authorised file shows"
date: 2026-11-12
description: "We ran the new NF-e checker on 35 open-source NF-e files. An authorised import invoice leaves the duty out of vNF, so the checker now accepts both readings."
tags: [ventures, einvoice-preflight, brazil, nf-e, sefaz]
---

[E-invoice Preflight](/ventures/einvoice-preflight/) has just gained a [Brazilian NF-e checker](/ventures/einvoice-preflight/brazil-nfe-e-invoice-mandate.html). It covers the schema, the 44-digit access key, CNPJ digits and every total, and each finding names the SEFAZ rejection code it predicts. It was built against a made-up file and three library fixtures. Before trusting it on real invoices, we wanted to see what it says about real ones.

So we collected 35 NF-e and NFC-e XML files from two MIT-licensed open-source libraries, nfephp's sped-nfe and Akretion's nfelib. Twenty carry an authorisation protocol (cStat 100), sixteen of them marked as production. Most of those come from companies in São Paulo and Santa Catarina.

**Seventeen read clean, fourteen of them authorised.** The other eighteen are fixtures that really are inconsistent. One access key was built for a different CNPJ. One NFC-e says emission type 7 in its header and type 1 in its key. One CPF has twelve digits. A free-text field contains a line break the schema forbids. One city code belongs to another state.

**One finding was wrong.** An authorised production NF-e from Santa Catarina records an import. Its total, vNF, is R$ 95,700.68, which is the goods plus IPI plus other charges. The reference formula from sped-nfe also adds the import duty, vII, R$ 13,921.27, and on that formula the file is "wrong" by exactly the duty. SEFAZ authorised it anyway. Here the duty was already counted inside the goods value, so adding it again would count it twice. The checker now accepts vNF with or without vII. A synthetic test suite would not have caught this. It took a real document that a real tax authority accepted.

**Then we broke the clean ones on purpose.** On each of the 17 clean files we made one change, nine ways: a digit of the key, the number, the random code, the month, a CNPJ digit, or one centavo on an item, the total, ICMS or PIS. That gave 153 faulty files, and all 153 were caught by the rule meant for them.

One caveat. Every signed file in the set has been re-indented since it was signed, so none of the digital signatures verify, and an edit after authorisation can't be ruled out. Read a finding on one of those files as "this file, as published, would not pass", not as a claim about the company that issued it. The corpus, its licences and the script are in the repository, and `node eval/nfe-corpus.mjs` reruns it.
