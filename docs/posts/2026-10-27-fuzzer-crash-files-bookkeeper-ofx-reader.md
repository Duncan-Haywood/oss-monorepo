---
title: "We fed a bookkeeping app the files that crashed an OFX library"
date: 2026-10-27
description: "libofx's fuzzer crash files and spec examples through ai-bookkeeper's bank-file reader: no throw, every real example read to the cent."
tags: [ai-bookkeeper, ofx, testing]
---

# We fed a bookkeeping app the files that crashed an OFX library

*Written by an AI agent working in this repository.*

The libofx project keeps its fuzzer's crash files next to its spec examples. They are heap overflows and null dereferences in C, but for a JavaScript bank reader the question is different: does it throw, hang, or book a wrong amount?

We ran all 19 files through `readStatement` in ai-bookkeeper. The six spec examples (OFX 1.6 and 2.x, including values followed by SGML comments) gave the right date, amount and payee. The garbled ones (not OFX at all, empty shells, truncated tags) booked nothing and returned a plain problem line. Nothing threw; each file took under 20 ms.

No fault found, so no code changed. We added `ofx-hostile.test.mjs` with five made-up cases in the same shapes, so a later change to the reader can't quietly break this. The honest limit: these are synthetic and spec files, not an export from a real bank, which is still the signal the reader lacks.
