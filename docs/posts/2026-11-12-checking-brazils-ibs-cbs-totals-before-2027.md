---
title: "Checking Brazil's IBS and CBS totals before they cost money"
seo_title: "NF-e IBS/CBS (IBSCBSTot, vNFTot) totals check on PL_010"
date: 2026-11-12
description: "The NF-e checker now reads the tax-reform layout PL_010_V1.30 and adds up IBSCBSTot, ISTot and vNFTot against the items. Its schema layer agreed with xmllint on 4,987 of 4,987 mutated files."
tags: [ventures, einvoice-preflight, brazil, nf-e, ibs, cbs, tax-reform]
---

Brazil's consumption-tax reform adds three new taxes to every NF-e. IBS is split between states and municipalities, CBS is federal, and IS, the selective tax, applies to a list of harmful goods. In 2026 they run at test rates (0.1% IBS, 0.9% CBS), and the NF-e layout gained groups for them: `IBSCBS` on each item, `IBSCBSTot` and `ISTot` in the totals, and a per-item `vItem` that should add up to a new `vNFTot`.

Until today, [E-invoice Preflight's NF-e checker](/ventures/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) read the older PL_009_V4 schema and skipped those groups, saying so in its output. A file could carry an IBS total that matched none of its items and still come back clean.

**What changed.** The checker now builds its schema table from package **PL_010_V1.30**, the reform layout. That is three XSD files, one of them new (`DFeTiposBasicos_v1.00.xsd`), giving 193 complex types where PL_009 had 114. Before switching, we ran xmllint on all 35 files in our open-source NF-e corpus under both packages. The verdicts were identical except for one file: the reform sample, which only PL_010 accepts. So for files without the reform groups, nothing changes.

The new layout also brings three sum rules, all in exact cents:

- **BR-050:** on each item, `vIBS` must equal the state part plus the municipal part (`vIBSUF + vIBSMun`).
- **BR-051:** every field of `IBSCBSTot` must equal the sum over the items. That covers the base, the deferred and returned amounts, IBS by state and by municipality, CBS, presumed credits, monophase amounts and credit reversals. The same goes for `ISTot`.
- **BR-052:** `vNFTot` must equal the sum of `vItem` over the items that count toward the total.

**How we checked it.** We wrote a test invoice by hand at the 2026 test rates and confirmed with xmllint that it passes the real schema. Then we planted each rule's defect in it, one centavo at a time. For the schema layer, we compared our verdicts with xmllint on the real PL_010_V1.30 schemas, one random change per file. With the four old seeds, all 2,563 mutants agreed. With mutants placed only inside the reform groups, our invoice gave 969 of 969 and nfelib's reform sample 1,455 of 1,455. That is **4,987 of 4,987 in total, 2,424 of them inside the new groups**.

**What it can't tell you yet.** We found no real, internally consistent reform NF-e to test against. nfelib's sample is a layout illustration whose numbers don't add up: an item's `vIBS` is 0 next to 16 + 25, and the base total is 2,000.50 for one item of 800. The new rules flag each of those. sped-nfe's four PL_010 examples have the word "string" in every field. We did not read SEFAZ's own rejection codes for these rules, so the findings name none. The sums follow the schema's field notes ("the sum of the items should match the invoice total") and sped-nfe's totaliser. Rates, bases and the `cClassTrib` tables are not checked.

If you're producing reform NF-e files in the test environment, you can drop one on the page. It runs in your browser and nothing is uploaded, so you'll know in a second whether its totals add up. If you have a real one you're willing to share with the data removed, it's exactly what the next step needs.
