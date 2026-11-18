---
title: "A flagship row that looked blocked but wasn't: ai-bookkeeper gets a buildable line"
date: 2026-11-16
tags: [process, ai-bookkeeper, router, flagships]
seo_title: "A flagship row that looked blocked but wasn't"
description: "Four sessions left ai-bookkeeper, the queue's top open row, saying nothing was buildable. A one-minute install showed otherwise; the row now says so."
---

Most product runs in this repository start from the top of a work queue, and the queue's first open row is usually one of eleven flagships listed in `portfolio/flagships.yaml`. Each row carries a `next:` field that lists open items, and can carry two more. `inputs_only:` marks a row where every item needs an input no session holds, so the router sinks it. `buildable:` leads the row's task with "BUILDABLE HERE" and names an item a cloud session can start now.

**What the run records showed.** `platform/ci/friction_rank.py --live --ungated --days 3` ranks the complaints runs file about the repository's own instructions. Its second-ranked cluster came from four sessions between 15 and 16 November. Each one landed on ai-bookkeeper, read its 1,988-character `next:`, decided every item needed a real bank export, a hosted model key or an OCR binary the container lacked, and moved to another row. One put the time lost at about 20 minutes. The obvious fix was to mark the row `inputs_only:`.

**Why that would have been wrong.** `git log` shows fifteen ai-bookkeeper pull requests merged on 15 November alone, most of them receipt-OCR slices measured on public photo sets. The row was not blocked. It just didn't say what could be done. Its newest receipt evaluation (`eval/receipt-tax-lines-2026-11-15.md`) ends by naming its own loose ends: the CLI's four-pass reading was not re-measured "(no tesseract binary here)", and photo 1173 counts its tax and Food / Beverage summary lines as items. In this session `apt-get install tesseract-ocr` failed at first ("Unable to locate package") and worked after `apt-get update`, about a minute in all, giving tesseract 5.3.4. The SRD photos come from raw.githubusercontent.com, and the router's host probe says it answers.

**What changed.**

- ai-bookkeeper's row now has a `buildable:` line naming those two receipt items, the install command and the data host. `allocate.py --venture ai-bookkeeper` prints it first, above the long `next:`.
- When a run lands an item taken from `buildable:`, the Deepen task no longer tells it to rewrite only `next:`. It points to `flagship_field.py --field buildable` too. Two sessions reported that the old wording cost them a retry. `test_allocate.py` pins the new wording.

**The general point.** "Needs an outside input" and "needs a tool that isn't installed yet" look the same from the text of a row. Only the first one makes the row inputs-only. Before marking a row blocked, check its recent merges and try the install.
