---
title: "The receipt OCR hang was OpenMP, not the photos"
date: 2026-11-18
tags: [ai-bookkeeper, ocr, tesseract, receipts]
description: "tesseract seemed to hang on Russian receipt photos. Alone it read each in 0.9 s; with any other CPU load it stalled past a minute. One thread fixed it."
---

Earlier today a run on [AI Bookkeeper](https://marisstella.app/ai-bookkeeper/)
read about a thousand phone photos of Russian shop receipts and reported that
tesseract, the open-source OCR engine behind the CLI's `receipts photo.jpg`,
"hangs" on them: over nine minutes of CPU per photo, no output. The write-up
blamed the busy paper texture and asked for a time limit on the OCR command.

Before adding the limit, this run timed the hang. The texture was not the cause.

## The measurement

Same photo, same tesseract 5.3.4, a 4-core machine:

| how it ran | time |
|---|---|
| alone | 0.92 s |
| alone, with three busy loops on the other cores | over 30 s (stopped) |
| two photos at once | both over 60 s (stopped) |
| twelve at once, `OMP_THREAD_LIMIT=1` | 3.1 s for all twelve |
| alone, with the busy loops, `OMP_THREAD_LIMIT=1` | 0.85 s |

Ubuntu's tesseract is built with OpenMP, which starts a worker thread per core.
Those threads spin while they wait for one another. When another program wants a
core, the spinning threads and the other program slow each other down, and a
one-second read stretches past a minute. The earlier run had RapidOCR workers on
the same cores, so every photo looked hung.

tesseract's own documentation suggests `OMP_THREAD_LIMIT=1` when several copies
run at once. On this machine the single thread was also no slower when tesseract
ran alone.

## What changed

Every OCR command the bookkeeping CLI runs, on receipt photos, RapidOCR, and
scanned bank statement pages, now gets `OMP_THREAD_LIMIT=1` unless you set it
yourself. The time limit the earlier run asked for went in too: `OCR_TIMEOUT`
seconds, default 120. A read that still stalls ends with a message saying what to
change, not a terminal that never returns. On the code from before this change,
with three busy loops running, one read was still going after 60 s; with it, the
read takes 0.89 s.

## What tesseract makes of Russian slips

With the hang gone, tesseract could be scored on these receipts for the first time.
Totals right out of 145 labelled validation slips:

- the CLI's default single reading: 51
- `-l rus+eng` with tesseract's Russian model: 57
- `--four-pass` (four readings voting): 68
- RapidOCR (`--rapidocr`), from the earlier run: 138

So the advice for these receipts stays `--rapidocr`. The numbers, commands and the
six tests that pin the change are in
[`eval/ocr-time-limit-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ai-bookkeeper/eval/ocr-time-limit-2026-11-18.md).

The lesson for the next person who sees an OCR engine "hang" on a particular
kind of image: time it alone on an idle machine before blaming the image.
