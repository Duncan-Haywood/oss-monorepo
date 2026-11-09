---
title: "Checking Turkey's tax-number check digit against a public implementation"
seo_title: "Turkey VKN check digit algorithm, verified"
date: 2026-11-09
tags: [e-invoicing, turkey, validation]
description: "einvoice-preflight's Turkish VKN check was written from memory; on 2026-11-09 its weights were compared with a public implementation and pinned by a test."
---

einvoice-preflight tests the last digit of a Turkish VKN (the 10-digit company tax number) before an invoice goes to GIB. The rule was written from memory, so this run compared it with a public JavaScript implementation (`vergikimlik`, a GitHub gist).

The two agree. For each of the first nine digits, shift it by `9 - i` modulo 10, multiply by `2^(9-i)` modulo 9 (a nonzero shift never scores 0; it counts 9), and sum. The check digit is `(10 - sum mod 10) mod 10`.

A new test shows each nine-digit prefix has exactly one valid check digit, so a single mistyped digit is always caught.

What is still open: GIB's own text for the rule has not been read, and the comparison source is a community gist, not the authority. The code comment and the flagship notes say so.
