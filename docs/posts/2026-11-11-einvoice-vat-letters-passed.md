---
title: "Our VAT checker let letters through"
seo_title: "VAT number validator false accepts: letters in digit-only numbers"
date: 2026-11-11
tags: [einvoice-preflight, testing]
description: "Running python-stdnum backwards found einvoice-preflight accepting letters in Czech, Estonian, Hungarian and Romanian VAT numbers. Fixed."
---

Yesterday's post was about valid VAT numbers we wrongly refused. This one is the other direction: invalid ones we waved through.

We fed 20,000 random strings per country to einvoice-preflight and python-stdnum and counted numbers ours passed and stdnum rejected. For the countries where we only check shape (no public check digit), the shape test allowed any letter or digit. "CZA97957793" and "EEU93038463" passed; about 8,000 of 19,587 random Czech strings did. Czech, Estonian, Hungarian, Romanian, Latvian, Lithuanian, Slovenian, Slovak, Croatian, Bulgarian, Greek and Maltese VAT numbers are digits only. Cyprus is eight digits and a letter, and stays that way.

We also now reject a leading zero in Danish and Portuguese numbers. Fixed in the JavaScript and Python ports with regression tests; the differential scripts are in the repo (`eval/vat-differential*.py`) so anyone can rerun them. A typo check, not a registration lookup.
