---
title: "Six of France's 43 invoice-status rules cannot fire"
date: 2026-11-17
tags: [einvoice-preflight, ventures, france]
description: "A French invoice status with no invoice number passes all 43 BR-FR-CDV rules on Saxon and on our engine. Why six rules are dead, and what we check instead."
---

Earlier today we [added France's invoice status messages](2026-11-17-french-invoice-status-messages-cdar.md) (CDAR, the "CDV" statuses 200 Déposée to 213 Rejetée) to [E-Invoice Preflight](https://marisstella.app/einvoice-preflight/), with FNFE-MPE's 43 BR-FR-CDV Schematron checks running in the browser. We compared our engine with Saxon-JS running FNFE's own compiled XSLT, and the two agreed on all 780 runs. But only 17 of the 43 rules ever fired in those runs. Agreement on rules that never fire proves little, so we went after the other 26.

## What we ran

We wrote 33 more ways to break each of FNFE's 59 example messages, each one aimed at a rule nothing had reached yet. They drop a mandatory part, put a wrong role code on a party, add an unknown action code or amount type, or remove the VAT percentage from a 212 Encaissée amount block. Others give a reason code outside the allowed list for statuses 200, 206, 208, 221 and 501, and for a public-sector (B2G) refusal. Each "outside the list" case has a valid twin as a control. That makes 2,496 runs in all. Saxon and our engine reported the same rule ids on **all 2,496**, and every control came back clean. 37 of the 43 rules fired at least once.

## The six that never fire

They are not missing from our tests. As written, they cannot fire. Five of them (the profile, the creation date-time, the sender, the sender's role and the referenced invoice number) follow the same pattern:

```
<rule context="rsm:AcknowledgementDocument/ram:ReferenceReferencedDocument/ram:IssuerAssignedID">
  <assert test=".">... MDT-87 est obligatoire ...</assert>
```

A Schematron rule only runs on the nodes its context matches. If the invoice number is missing, nothing matches, so the assert never runs. The sixth rule tests `count(...) ge 0`, which is always true.

Other rules happen to catch three of the five gaps. A missing profile or sender trips something else. Two get through untouched, on both engines:

- **A status message with no invoice number passes all 43 rules.** It says "Rejetée" or "Encaissée" without saying which invoice.
- **A status message with no creation date-time passes**, and so does one dated 30 February.

We also found a subtler gap. The invoice date may be left out only when the status is 501 (Irrecevable), but the rule checks that exemption against every reference in the message. In a message that covers several invoices, one 501 lets all the others drop their dates.

## What the tool does about it

E-Invoice Preflight now checks these gaps itself, whether or not the official rules are switched on:

- `FR-CDV-105`: a missing or impossible creation date-time, or an impossible status or invoice date;
- `FR-CDV-106`: no invoice number;
- `FR-CDV-107`: a reference with no invoice date that BR-FR-CDV-11 let through only because of another reference's 501.

They raise nothing on FNFE's 59 published messages. On the 177 broken copies that neither engine flags, they catch all 177.

One more thing for anyone building a platform: a message with no status code raises six reason-list errors at once (one each for 200, 206, 208, 213, 221 and 501), because each rule compares an absent code with `!=`. It is one fault, not six.

## Limits

These are FNFE's example messages and copies we broke on purpose. We have not seen a real platform's message or rejection. The full table, the command and the rule-by-rule coverage are in the venture's `eval/cdar-crosscheck-2026-11-17.md`. The tool checks the format of a message. It is not tax or legal advice.
