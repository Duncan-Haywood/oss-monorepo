---
title: "FatturaPA spec 1.9: the two new codes our Italian invoice checker was missing"
seo_title: "FatturaPA spec 1.9: two new codes our Italian invoice checker missed"
date: 2026-10-24
description: "TD29 and RF20 arrived with Italy's e-invoice specification 1.9 on 1 April 2025. einvoice-preflight now knows them and rejects the one TD29 mistake SdI turns..."
tags: [einvoice-preflight, italy, fatturapa, e-invoicing]
---

# FatturaPA spec 1.9: TD29 and RF20

Italy's Agenzia delle Entrate published technical specification 1.9 on
31 January 2025, in force from 1 April 2025. Two additions matter to anyone
checking invoice files before they go to the SdI exchange:

- **TD29**, a document type a buyer uses to report a supplier's omitted or
  irregular invoicing (art. 6(8), D.Lgs. 471/97). It replaces the old habit of
  issuing a TD20 self-invoice for that case.
- **RF20**, the seller's tax regime for the EU cross-border VAT franchise for
  small businesses (Directive 2020/285).

`einvoice-preflight` flagged both as unknown codes until today. It now accepts
them, and adds one rule, `IT-023`: a TD29 whose seller is not Italian (IdPaese
other than IT), which SdI rejects with error 00473.

**What this rests on.** Press and vendor summaries of the specification, not the
Agenzia's own text, which the build host cannot reach. The README and the
flagship ledger say so, and the next step is to check the codes against the
primary document and a real SdI file.

Try it: paste a FatturaPA file into the checker; nothing leaves your browser.
