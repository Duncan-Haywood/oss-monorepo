---
title: "Our Peppol rules were a release behind, and the Danish ones had never run"
seo_title: "Peppol BIS Billing 3.0.22: France profiles, Slovak 384, and testing a Schematron port"
date: 2026-11-14
tags: [einvoice-preflight, ventures, peppol]
description: "Updating the checker to Peppol BIS 3.0.22 meant running OpenPeppol's own unit tests against our compiled rules. They found 124 assertions we failed, all Danish, from one compiler bug."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice in the browser before it is sent. Part of that is running the official Schematron rules: EN 16931, Germany's XRechnung, and the Peppol BIS Billing 3 rules. Browsers do not run XSLT 2, so we compile each rule file into plain JSON once and evaluate the XPath with fontoxpath.

That design has two ways to go wrong. The JSON can be stale, and the compiler can be wrong. This week both were true.

## A release behind

The Peppol rules in the checker were compiled from OpenPeppol's repository in March: release 3.0.20. OpenPeppol published 3.0.21 in May, **mandatory from 17 August 2026**, then a hotfix, 3.0.22, on 4 November. For three months, a file checked here was judged by superseded rules.

Some of the differences matter to real senders:

| What you send | 3.0.20 said | 3.0.22 says |
|---|---|---|
| ProfileID `urn:peppol:france:billing:regulated` | fail (PEPPOL-EN16931-R007) | pass |
| ProfileID `urn:peppol:bis:billing_with_response` | fail (R007) | pass |
| Type code 384 (corrected invoice) between two Slovak companies | fail (P0112) | pass |
| `...poacc:billing:3.0::2.1` as the specification id | pass | fail (R004) |
| A Danish P number that is not ten digits | warning | error |
| A Dutch KVK number that is not eight digits | nothing | warning |
| An invoice in BGN | EU rules fail it | Peppol fails it too (Bulgaria is on the euro) |

The French row matters most. From September 2026 every business in France must be able to receive e-invoices, and OpenPeppol added those two temporary profiles for French traffic. Every invoice using them would have been told it was wrong.

## Testing the port with the publisher's own tests

Updating the JSON takes one command. Knowing the compiled rules behave like the originals is the hard part. OpenPeppol ships unit tests next to its rules: over a thousand small documents, each tagged with the rules that must pass, fail as an error, or fail as a warning. So we wrote a runner that feeds every one of them to our compiled rules and checks each tag.

We ran it on the **old** rules against the **old** release's own tests first. That should have been a clean pass. It was 775 out of 899.

Every one of the 124 misses was Danish. None of the 14 Danish rules (DK-R-002 to DK-R-017) fired, on any file.

## One line of Schematron semantics

Schematron rules can declare variables:

```xml
<let name="DKSupplierCountry"
     value="concat(ubl-creditnote:CreditNote/cac:AccountingSupplierParty/.../cbc:IdentificationCode,
                   ubl-invoice:Invoice/cac:AccountingSupplierParty/.../cbc:IdentificationCode)"/>
<rule context="ubl-invoice:Invoice[$DKSupplierCountry = 'DK']">
```

Our compiler has no runtime variables. It pastes the value wherever `$DKSupplierCountry` appears. But a pattern-level `let` becomes a global XSLT variable, worked out once **from the document node**. Pasted into the predicate, the same path was worked out from the `Invoice` element. From there, `ubl-invoice:Invoice/...` finds nothing, the country is an empty string, and the Danish rules are skipped as if the seller were foreign. The Icelandic rules use the same pattern and were also silent.

The fix is small. A variable whose value reads the document by a relative path is now pasted as `root(.)/(value)`. Constants and absolute paths are left alone. After it, the runner reports **1,048 of 1,048** assertions agreeing on 3.0.22.

The same fix reached rule sets we had not suspected. XRechnung's CII rules for the Clean Vehicles Directive hang on a relative variable and could never fire. The NLCIUS and seven PINT jurisdiction sets changed too. ZATCA, Romania's CIUS-RO, Portugal's CIUS-PT and the EN 16931 base came out byte-identical. And the corpus of good example files from the national rule authors gives exactly the same results before and after, so the fix adds findings only where a rule had wrongly stayed quiet.

## What we take from it

A port of someone else's rules is only as good as the evidence that it behaves like the original. "It compiles, and the example invoices pass" was true of the old build, and it hid the dead Danish and Icelandic rules for weeks. When the rule authors publish tests, run them. The runner is `eval/peppol-unit-tests.mjs`, MIT like the rest of the checker, and it works on any checkout of OpenPeppol's repository.

Full numbers and the rule-by-rule diff: [`eval/peppol-bis-3.0.22-2026-11-14.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/peppol-bis-3.0.22-2026-11-14.md). The checker gives offline observations, not an access point's acceptance and not tax advice.
