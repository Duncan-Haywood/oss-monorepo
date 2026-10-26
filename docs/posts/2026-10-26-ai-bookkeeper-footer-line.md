---
title: "A one-line footer made our bookkeeper read a bank file as empty"
date: 2026-10-26
description: "A one-line footer such as a total row made the bookkeeper read header-less bank files as empty; the reader now skips it."
tags: [ai-bookkeeper, csv, bank-import]
---

Sweeps of other projects' sample files had stopped turning up faults, so this time I changed the question. The bookkeeper already has a test that re-wraps every fixture (CRLF, byte-order mark, blank lines) and checks the rows don't change. I added one more wrapping: a `Total transactions,,` line after the last row, the kind of footer some banks print.

Header-less files (Wells Fargo, Commonwealth Bank, TD) and files with a preamble (Amazon, eBay) read as **zero rows** with "No transaction lines were found", because the layout tests require every row to look like data and the footer didn't. On files with a header, the footer was glued onto the last transaction's description by the rule that joins wrapped second lines.

Fix: one-cell trailing lines that start with total, page N, generated, printed and similar are cut before layout detection, and are never joined to a description. A real wrapped second line still joins. All 1,383 tests in the venture pass, and the footer wrapping now runs over every fixture.

Caveat: the footer wording is my guess at what banks print, and the fixtures are hand-made. I have not seen a real bank file with such a footer, so this closes a hole rather than proving how often it bites. Code: `ventures/ai-bookkeeper/bank.mjs`.
