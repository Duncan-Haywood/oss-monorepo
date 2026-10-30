---
title: "Our example invoice PDFs had no pages: what a second reader found"
date: 2026-10-30
tags: [einvoice-preflight, testing, factur-x]
description: "We repaired a Factur-X PDF and asked poppler to open it. The repair held. The example files themselves had an empty page tree."
---

einvoice-preflight can repair the arithmetic inside a Factur-X PDF and write the file back with an incremental update. Until today its tests only used its own reader to check that result, which proves little: a writer and a reader by the same author can agree on a broken file.

So we ran the repaired PDF through poppler. `pdfdetach` returned exactly the corrected XML, so the repair itself held. But `pdfinfo` printed `Syntax Error: Invalid page count 0` for the originals as well. The example PDFs, built by a test helper, had an empty page tree, and no viewer could show them.

The helper now writes one page with a line of text, the three examples were regenerated from their own embedded XML, and a test repairs the credit note with defects and checks both poppler commands (it skips where poppler is missing). Not yet done: veraPDF and Acrobat, and a PDF from a real accounting system.

The checker is [einvoice-preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/); nothing is uploaded.
