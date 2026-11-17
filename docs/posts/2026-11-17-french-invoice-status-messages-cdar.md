---
title: "Checking France's invoice status messages (CDAR) against FNFE's own rules"
seo_title: "Check a French CDAR invoice status message, free"
date: 2026-11-17
tags: [einvoice-preflight, ventures, france]
description: "E-Invoice Preflight now reads France's CDAR status messages, compares them with the invoice and runs FNFE's BR-FR-CDV rules: 780 of 780 runs match Saxon."
---

Under France's e-invoicing reform an invoice is more than the file. Each one picks up a chain of statuses as it moves through the system: 200 Déposée when the seller's platform accepts it, 202 Reçue and 203 Mise à disposition on the buyer's side, then 205 Approuvée, 207 En litige or 210 Refusée from the buyer, and 212 Encaissée once the seller is paid. A platform can stop the chain with 213 Rejetée. Some of these statuses also go to the PPF, the tax administration's platform. Each status is an XML message in the UN/CEFACT CDAR format (CrossDomainAcknowledgementAndResponse, D22B). FNFE-MPE publishes the rules a status message must follow as Schematron, the BR-FR-CDV set, in [fnfempe/France_RFE](https://github.com/fnfempe/France_RFE) (Apache-2.0).

Our [earlier post](2026-11-17-frances-br-fr-rules-in-the-browser.md) covered the invoice rules. [E-Invoice Preflight](https://marisstella.app/einvoice-preflight/) now reads the status messages as well:

- **It names the status.** Drop a CDAR file and the report tells you which invoice it is about, which status it carries, who sent it to whom, and the reason code and text for a rejection, refusal or dispute (for example `DOUBLON`, a duplicate, or `TX_TVA_ERR`, a wrong VAT rate).
- **It checks the message against the invoice.** Drop the invoice in with its statuses and the tool pairs them on the invoice number. If the message gives a different invoice type, invoice date or seller SIREN than the invoice has, you get an error for each one (FR-CDV-101 to 103). A status that names the wrong date can point at a different invoice than the one you meant.
- **It shows the journey.** Drop several statuses for one invoice and they are listed in time order: 200, then 205, then 212.
- **It runs FNFE's rules.** Tick "official Schematron" and the 43 BR-FR-CDV checks run in your browser. The file is not uploaded.

## How we checked it

The rules are compiled from FNFE's .sch file into plain JSON. The same compiler already produced the invoice rule sets, and a JavaScript XPath engine (fontoxpath) runs them. As a reference we used Saxon-JS running FNFE's own compiled XSLT. We ran all 59 example messages FNFE publishes as they are, then broke each one up to fourteen ways: an unknown status code, a 213 with no reason, a made-up reason code, a wrong sender role, a non-French profile, a wrong invoice type code, a missing seller SIREN, and so on. That gave 780 runs, and both engines reported the same rule ids on all 780. No rule was left unevaluated. The 59 published messages pass every rule. The full table is in the venture's `eval/cdar-crosscheck-2026-11-17.md`.

## Two things we found in FNFE's set

Three of the fourteen breakages fire no rule on either engine: a space in the message id, 30 February in its creation time, and a space in the referenced invoice number. The file defines functions that check id and date formats, but no rule calls them on those fields. A platform that relies only on this set would accept such a message.

The file also names statuses 206 and 208 both ways round. One rule's message calls 206 "Suspendue" and 208 "Approuvée partiellement", and the reason-list rules say the opposite. The tool does not label either code and explains why, rather than guess.

## Limits

The mutations reached 17 of the 43 rules. The rest cover multi-invoice messages, payment-amount details and B2G refusal reasons. We have not compared the tool with a real platform's status message or rejection. If you have one you can share, it would show what the next round should test. The tool reads what a platform said. It is not a platform and does not give tax advice.
