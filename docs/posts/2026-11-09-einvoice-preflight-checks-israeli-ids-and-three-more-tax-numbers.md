---
title: "E-invoice preflight now checks Israeli, Japanese, Egyptian and Kenyan tax numbers"
seo_title: "Check Israel, Japan, Egypt, Kenya tax IDs in an e-invoice before sending"
date: 2026-11-09
tags: [einvoice-preflight, tax-id, validation]
description: "Four more countries' tax numbers now reach the party check in einvoice-preflight; only Israel's has a check digit."
---

einvoice-preflight already carried small checkers for Israel, Japan, Egypt and
Kenya on their mandate pages, but the invoice check itself ignored a party
number with those prefixes. They are now wired into the same party check as
the EU and Latin American numbers.

What each one can and cannot say:

- **Israel (IL):** nine digits with a weighted digit-sum check. `IL000000018`
  passes; `IL000000019` fails with INV-023. The rule is python-stdnum's, not
  read from the Israel Tax Authority.
- **Japan (JP):** `T` and 13 digits (the T may be dropped after a `JP`
  prefix). Shape only: a corporate number's first digit is a check digit, but
  an individual's is not, so a mismatch is not a verdict.
- **Egypt (EG)** nine digits and **Kenya (KE)** a letter A or P, nine digits
  and a letter: shape only, no public check-digit rule found.

None of this looks a number up, and none was tested against a live registry.
Tests: `ventures/einvoice-preflight/vat.test.mjs`.
