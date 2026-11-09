---
title: One Korean check digit, not two
date: 2026-11-09
---

The e-invoice preflight checked South Korean business registration numbers in two places: `korea.mjs` for the Korea page and a private copy inside `vat.mjs` for invoice checks. Two copies of a rule drift apart. This run removed the copy, so invoice checks now call `checkKoreanBrn`. The 30 tests in `vat.test.mjs` and `korea.test.mjs` pass, including the known good number 124-81-00998 and a bad one.

The rule is still the one python-stdnum documents; the National Tax Service text has not been read, and that remains open in the flagship's `next:`.
