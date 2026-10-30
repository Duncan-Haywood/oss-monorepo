---
title: "Indonesia's e-invoice now lives in Coretax, and the tax number has 16 digits"
seo_title: "Indonesia e-invoicing: Coretax faktur pajak and the 16-digit NPWP"
date: 2026-10-30
tags: [einvoice-preflight, indonesia, e-invoicing]
description: "Since 1 January 2025 Indonesian VAT invoices are approved in the tax authority's Coretax system. What the sources agree on, where they differ, and a free NPWP format check."
---

Indonesian VAT invoices (faktur pajak) are issued and approved in the tax authority's Coretax system, which replaced the older e-Faktur application from 1 January 2025 under PMK 81/2024. The [Indonesia page](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/indonesia-coretax-e-invoice-mandate.html) in E-invoice Preflight is the 54th country page and sits in the side-by-side table of mandates.

**What the sources agree on.** In Coretax the tax number (NPWP) has 16 digits. An individual citizen uses the population ID number (NIK), and a company puts a 0 in front of its old 15-digit number. An NIK does not work for invoices until it is matched and activated. An invoice that is not approved is not a tax invoice, and the tax authority can switch off a non-compliant seller's access to create invoices.

**Where they differ.** Vendor guides say the serial number grew from 16 to 17 digits and that there are ten transaction codes; no official source was read for that. The upload deadline and the end of the transition for large taxpayers also vary. We found no penalty amount for invoices, so the page states none.

**What the checker does.** It tests an NPWP's length and shape in the browser and claims no check digit, because none was found in a source. It cannot read Coretax XML. The pages for the tax authority's own text were unreachable from our runner, so everything here comes from search excerpts and the PMK itself is unread; confirm with the tax authority or an accountant.
