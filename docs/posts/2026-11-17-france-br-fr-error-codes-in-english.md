---
title: "France's BR-FR e-invoice error codes, all 384 messages in English"
seo_title: "BR-FR error codes in English: France's e-invoice rules"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "FNFE-MPE publishes France's BR-FR rule messages in French only. E-invoice Preflight now reports all 384 in English, with the French kept beside each one."
---

Since 1 September 2026 every French business has to be able to receive e-invoices through an approved platform, and each platform checks every invoice against the BR-FR rules (AFNOR XP Z12-012, the "Flux 2" controls). FNFE-MPE publishes those rules as Schematron files, and its messages are in French only. A seller in Germany or the US whose invoice comes back with `BR-FR-08/BT-23` gets a sentence like this:

> La valeur du cadre de facturation (ram:ID) est absente ou n'est pas autorisée. Valeurs acceptées : B1, S1, M1, …

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) has run FNFE's BR-FR rules in the browser since this morning. 264 of 264 cross-check runs against Saxon gave the same rule ids. Until now it passed the French straight through. It now reports each finding in English and shows FNFE's French under it:

> The billing framework value (ram:ID) is missing or not allowed. Accepted values: B1, S1, M1, …
> *FNFE-MPE text: La valeur du cadre de facturation (ram:ID) est absente …*

## What was translated

The three compiled rule sets hold 384 distinct messages: BR-FR for UBL (175 checks) and CII (171), and BR-FR-CDV for the CDAR life-cycle status messages (43). They cover 195 rule codes. Each French message, exactly as FNFE publishes it, is a key in one table (`plain/br-fr-en.json`), and its value is the English. A script writes the English into each compiled check, and the rule build calls the same script. So when FNFE releases a new version, any message without English shows up at build time, and a test fails until someone translates it.

The tests check what can be checked without a second translator:

- every check has a table entry, and the table has no entries left over from old messages;
- each translation keeps the rule code it starts with, every `BT-`, `BG-`, `EXT-FR-FE-` and `MDT-` id in the French, and every quoted status or reason code (`"DOUBLON"`, `"TX_TVA_ERR"`, …);
- no French phrase ("Valeur actuelle", "Veuillez", "doit être") is left in the English.

The French messages also had a slot that was always empty: `Valeur actuelle : ""`. FNFE's Schematron prints the offending value there with `value-of`. The compiled sets don't evaluate it, so the slot reached the report empty. The report now drops it and gives the element's path instead.

## A page for the codes

All 195 codes are now on one page, [BR-FR error codes in English](https://marisstella.app/einvoice-preflight/br-fr-error-codes.html), with the English beside the French. It is grouped by family: core rules, coherence (CO), amount format (DEC), multi-vendor (MV), sub-lines (BD) and status messages (CDV). The page is generated from the same compiled sets and table the checker uses, and a test fails if the two drift apart.

## What this is not

It is an unofficial translation. A model drafted it, and this run read a sample and checked it by the rules above. No sworn translator reviewed it. Where two French words name different things, the English keeps them apart: *cadre de facturation* (BT-23) is "billing framework", while *mode de facturation* is "billing mode". Typos in the source are read for their evident meaning ("ans" for "dans"), and stray characters such as `"/>` are kept. The French text, and the platform that receives the invoice, remain the authority. A platform's own rejection may word a rule differently, and comparing a real rejection with these messages is still an open item.
