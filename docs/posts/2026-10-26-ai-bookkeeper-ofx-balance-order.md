---
title: "A bank's closing balance went on the wrong line"
date: 2026-10-26
description: "A Nubank OFX file lists its newest day first with three lines on that day, so the closing balance landed on the wrong line; ai-bookkeeper now orders them."
tags: [ai-bookkeeper, bank-import, testing]
---

Running real OFX files from three open-source importers through ai-bookkeeper turned up one fault. A Nubank credit-card file lists its newest day first, and three lines share that day. The file's closing balance was attached to the last of the three, which only makes sense for oldest-first files. The reader now looks at the file's order before choosing the line. Two tests pin both orders. The other eleven OFX files and about fifty CSVs read as expected.
