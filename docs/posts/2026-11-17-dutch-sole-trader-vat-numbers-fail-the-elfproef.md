---
title: "Our e-invoice checker called 91% of valid new Dutch sole-trader VAT numbers typos"
seo_title: "Dutch VAT number check: elfproef and mod 97 since 2020"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Since 2020 Dutch sole traders get VAT numbers checked with mod 97, not the elfproef. Our checker used only the elfproef; now 0 of 60,000 differ from stdnum."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks the check digits of a VAT number before an invoice goes out. For the Netherlands it used the *elfproef*, the 11-test the Dutch government uses for a BSN or RSIN. That was right until 2020. Since 1 January 2020 a sole trader's VAT number (btw-identificatienummer) no longer contains their BSN. Its last two digits are check digits of a different kind: read `NL`, the nine digits, `B` and the suffix as one number, letters turned into digits as in an IBAN (N = 23, L = 21, B = 11), and the result is 1 mod 97.

Our check knew only the elfproef. So it reported a valid post-2020 number, such as python-stdnum's own example `NL002455799B11`, as an error: "Supplier VAT identifier fails the published NL checksum." A Dutch freelancer who ran their invoice through the tool was told to fix a number that was fine.

## How often

We drew 30,000 numbers, a third built to pass the elfproef, a third built to pass the mod-97 check and a third at random, and gave 30% of them a one-digit typo. Then we asked [python-stdnum](https://github.com/arthurdejong/python-stdnum)'s `nl.btw`, which accepts a number when either check holds, and our check the same question.

Before the fix, 6,545 of the 30,000 answers differed. 6,406 of them were valid mod-97 numbers we flagged: **91% of the valid new-style numbers drawn.** The other 9% pass the elfproef by chance. After the fix, 0 of 30,000 differ, on two seeds, in the web page and in the command-line tool alike. The first run after the fix found ten more differences, all with suffix `B00`. That suffix is never issued, and stdnum refuses it, so we refuse it too.

## The same day: Peppol checks the delivery address's ids

The other change in this release is about Peppol. OpenPeppol's identifier rules do not name a parent element, so they reach every party on the invoice. Earlier today we added the payee and the tax representative. The remaining one is the deliver-to party. In UBL that is `cac:DeliveryParty`. In CII it is `ShipToTradeParty`, where the delivery location id (BT-71) is a `ram:ID` with a scheme, so a store's GLN with a wrong check digit there blocks the invoice at the access point. In UBL the same id sits in `cac:DeliveryLocation`, which no Peppol rule reads.

We ran Peppol's own rules and ours on the same 9,500 generated files. Before: 1,508 disagreed, every one a Peppol failure in a deliver-to place we did not read. After: 0, on two seeds. The UBL DeliveryLocation case is in the draw too, and neither side flags it.

Method and numbers: `eval/nl-vat-stdnum-differential-2026-11-17.md` and `eval/delivery-party-ids-peppol-differential-2026-11-17.md` in the [venture folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight). Neither run used a real invoice, and we did not read the Belastingdienst's own text: the source for the 2020 check is python-stdnum 2.2.
