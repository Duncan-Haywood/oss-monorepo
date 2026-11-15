---
title: "A Verifactu fingerprint hashes the amount as written: 15, not 15.00. A free checker names the slip"
seo_title: "Verifactu huella checker: why your record's hash doesn't match"
date: 2026-11-15
tags: [verifactu, spain, aeat, e-invoicing, sha-256, open-source, einvoice-preflight]
description: "Spain's Verifactu records chain SHA-256 fingerprints. Our free checker recomputes each one, follows the chain, and names the slip when a hash is wrong."
---

From 2027 most Spanish businesses that invoice with software need a billing system that meets Verifactu (Real Decreto 1007/2023). Each invoice the system issues or cancels produces a billing record. Each record carries a fingerprint (the *huella*), a SHA-256 hash over a fixed string of the record's own fields plus the previous record's fingerprint. That makes the records a chain: change one invoice and every fingerprint after it stops matching.

So the first thing a developer building a billing system has to get right is that string. Today [E-invoice Preflight](../../ventures/einvoice-preflight/) learned to check it.

## What it does

Drop the RegistroAlta and RegistroAnulacion XML your system writes. It can be one record, a batch, or the SOAP envelope you send to the Tax Agency (AEAT), and you can drop several files at once. For each record the checker:

- recomputes the fingerprint from the values exactly as written in the XML;
- follows the chain across every file. Each record must name the record before it and carry that record's exact fingerprint. Two records pointing at the same predecessor (a fork) and a clock that runs backwards are flagged;
- checks the record itself: the dates; that the invoice type fits the recipients (simplified F2 and R5 invoices carry no recipients, the other types need one); the corrective-invoice fields; each tax-breakdown line's rate and amount against its operation type; the equivalence surcharge; and the totals;
- gives the URL the invoice's QR code must carry.

There are 28 rules (VF-001 to VF-028), each with a fix. Nothing is uploaded.

## The part that saves an afternoon

A fingerprint that doesn't match tells you something is wrong, not what. So when one fails, the checker rebuilds the string the ways billing software commonly gets it wrong and checks whether any of them reproduces the stored value. The slips it tries:

- the amount written one way in the XML and another way in the hash (15 against 15.00);
- `Z` instead of `+00:00`, a missing time-zone offset, or milliseconds;
- the previous fingerprint left out, or written in lower case;
- the date written yyyy-mm-dd;
- values URL-encoded, or not trimmed.

It tries each slip alone and every pair. When one matches, it tells you which one, and shows the exact string your code hashed.

The amount case is real. The one record we have from the AEAT's test environment (its test entity, from an MIT project's sample) writes `ImporteTotal` as `15`. Its stored fingerprint is reproduced with `15` and not with `15.00`. The hash is taken over the text, not the number. A system that formats amounts one way for the XML and another way for the hash breaks its own chain on the first invoice with round euros.

## How we checked it

- The AEAT's two worked examples from its fingerprint specification reproduce exactly (3C464DAF… and F7B94CFD…). We took them as quoted, with their expected values, by two independent MIT libraries, because the AEAT's own site refuses connections from our build machine.
- The AEAT test record and two library fixtures all match.
- We generated 500 records for each of ten slips, each fingerprint computed the way a buggy system would. Every slip that changed the hashed string was flagged and named: 4,590 of 4,590. A record with a genuinely changed value was flagged but never passed off as a formatting slip: 0 of 500 named.

The full tables are in [the eval note](../../ventures/einvoice-preflight/eval/verifactu-records-2026-11-15.md).

## What it is not

It is not the AEAT. It doesn't certify a billing system, look NIFs up in the census or send anything. Differences in totals are warnings, because we haven't read the AEAT's own tolerance. And we haven't yet run it on a production system's records. If you build or run a Verifactu system and can share a record that the AEAT rejected, we'd like to test against it.

This is an offline check, not legal or tax advice. The code is MIT licensed.
