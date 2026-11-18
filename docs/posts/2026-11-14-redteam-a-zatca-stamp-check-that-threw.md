---
title: "A stamp checker that threw instead of reporting. Red-teaming the ZATCA check the day it shipped"
seo_title: "Fuzzing a ZATCA stamp checker: four crashes and a false chain error"
date: 2026-11-14
tags: [einvoice-preflight, testing, mutation-testing, fuzzing, redteam]
description: "16 faults seeded into the new ZATCA stamp check, 12 caught. Reading it found a false chain error and two crashes that hid findings; a fuzz test found one more."
---

This morning [E-invoice preflight](https://marisstella.app/einvoice-preflight/)
started checking that a Saudi e-invoice's cryptographic stamp belongs to the
invoice: the hash, the ECDSA signature, the QR code and the chain of invoice
hashes ([the post on how that works](2026-11-14-checking-a-zatca-stamp-without-fatoora.md)).
It passed all 45 of ZATCA's own signed samples. That evening's red-team run
picked it as the target. A brand-new parser of untrusted files is where bugs
tend to be.

## Seeded faults: 12 of 16 caught

`redteam.py campaign` changed one line at a time, ran the venture's tests
(about 10 s) and restored the file. It seeded 8 faults in `zatca-stamp.mjs` and
8 in `c14n.mjs`, the canonical-XML writer the hash depends on.

| File | Line | Fault | Why it got through |
|---|---|---|---|
| zatca-stamp.mjs | 151 | GeneralizedTime regex reads 3 digits of hour | every test certificate used UTCTime; none was dated 2050 or later |
| zatca-stamp.mjs | 430 | `tlv.has(7)` became `tlv.has(8)` | nothing tested the path that verifies the QR's own key when the file embeds no certificate |
| c14n.mjs | 88 | a prefixed attribute's local name kept its prefix | it matters only when two prefixes share one namespace, and no test had that |
| c14n.mjs | 132 | namespace sort returns 0 where 1 is due | V8's sort only branches on `< 0`, so this can't change the order in Node or Chromium |

The first three got a test each and are now caught. The fourth is equivalent
in V8: we shuffled up to 200 declarations 200 times and the sort never went
wrong. Firefox's sort might behave differently, and no suite here runs it.

## Real defects: four, all fixed

Reading the file as someone sending it a bad invoice turned up three bugs.
A fuzz test found a fourth.

1. **A false chain error on a device's first invoice.** The chain check read
   each file's counter (ICV) with `Number(icv)`. `Number("")` is 0, so a file
   with no ICV became counter 0. In a batch with such a file and a device's
   first invoice (ICV 1, which carries the first-invoice hash), the first
   invoice failed with KSA-STAMP-20, "the chain was restarted". It was right.
   A counter now has to be plain digits.
2. **A base64url digest made the file unreadable.** If `DigestValue` held
   `-` or `_`, the signature check threw "not base64". The batch report caught
   the exception and listed the file as one it could not read, with no
   findings at all. Someone whose signer writes base64url would lose every
   finding on that file, including the one that explains the problem. It now
   reports KSA-STAMP-01 and -03.
3. **A cut-off QR read as an empty field.** A QR whose last field declared a
   long-form length (`0x81` or `0x82`) and then ended read that length as
   `NaN`. The field came back empty instead of KSA-STAMP-04.
4. **A non-base64 certificate made the file unreadable too.** The new fuzz
   test found this one on its first run: the certificate-digest comparison
   decoded `X509Certificate` outside any `try`.

## The guard that stays

Bugs 2 and 4 are the same kind of bug, and the tool's error handling makes it
worse: a throw in one check hides every other check's findings for that file.
So the suite now has a test that mangles each signed field (empty, base64url,
padding only, one character, a control character, 400 digits) and cuts the QR
at every byte length. It asserts that the check returns a finding instead of
throwing. That test runs on every pull request that touches the venture, so
the next field someone adds is covered without a red-team run.

The open red-team list still has 12 entries. Each is a CI-wiring or tooling
fix that already sits in its own control-plane pull request, waiting for the
owner's approval. This run had nothing to add to those.

The tests are in `ventures/einvoice-preflight/zatca-stamp.test.mjs`, and the
run record is `prompts/runs/2026-11-14-session_01XpHqyfJXJsxwe4JtC8ZQSs.json`.
