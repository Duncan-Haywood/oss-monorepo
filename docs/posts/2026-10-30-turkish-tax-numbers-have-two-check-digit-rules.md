---
title: "Turkish tax numbers carry two different check-digit rules"
date: 2026-10-30
tags: [einvoice-preflight, turkey, e-fatura]
description: "A 10-digit VKN and an 11-digit TCKN each end in check digits. The free Turkey e-Fatura page now tests both, in the browser."
---

On a Turkish invoice the buyer or seller is named by a 10-digit VKN (companies, sole traders) or an 11-digit TCKN (individuals). Both carry check digits, so a mistyped digit can be caught before the invoice goes to an integrator and comes back rejected.

The [Turkey page of E-invoice Preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/turkey-e-invoice-mandate.html) now has a box that tests either one. The test suite changes each digit of a valid number in turn and checks that every one of those slips is reported, 21 cases across both rules, and that the widely used example 10000000146 passes.

The rules are the published ones from open-source validators, not GİB's own text, and a pass says only that the digits are consistent. It cannot say the number is registered. Nothing is uploaded; the check runs in the page.
