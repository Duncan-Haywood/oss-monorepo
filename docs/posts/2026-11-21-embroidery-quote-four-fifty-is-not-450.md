---
title: "4,50 is not $450: a comma bug in the embroidery quote CLI"
seo_title: "Embroidery quote calculator: decimal comma and hex input fixed"
date: 2026-11-21
tags: [redteam, testing, csv, embroidery, small-business]
description: "A garment cost of 4,50 was quoted as $450 and a quantity of 0x18 as 24. Both are now errors; seeded-fault catch rate went from 5 of 8 to 8 of 8."
---

The [embroidery shop quote calculator](../../ventures/embroidery-shop-quote-calculator/README.md) prices a job from a CSV of jobs: quantity, garment cost, stitch count, colors, digitizing fee. Today's red-team run picked it at random and seeded eight small faults into its command-line front end (`cli.mjs`). The venture's own tests caught five.

**What the three that got through had in common.** Two loosened the "zero or more" check on flags (`>= 0` became `> 0` or `>= 1`). No test ever passed `--rush 0` or `--digitizing-fee 0`, so a shop with no rush fee would have been turned away, and the suite stayed green. The third changed the line number on a job built from flags alone. That put a stray `line 1 (job):` in front of every error message, and nothing read the message text. Each one now has a test, and a re-run catches all three.

**The real bugs were one layer down, in how a typed number is read.** The engine cleaned every cell with `replace(/[$,%\s]/g, "")` and then called `Number()`. That reads `1,234.50` correctly. It also reads a European `4,50` as 450, so a quote built from a sheet exported in a comma-decimal locale priced the shirts at $450 each, and no error said so. `Number()` also accepts `0x18`, `0b11` and `1e1`, so a quantity cell of `0x18` quoted 24 pieces. And because the CLI checked its flags with bare `Number()`, `--garment-cost $4.50` was refused even though the same text in a CSV cell went through.

**The fix** is a single parser, `parseAmount`, which both the engine and the CLI now use. It drops `$`, `%` and spaces and allows an optional minus sign. After that it accepts plain decimal digits, with commas only in thousands groups (`^\d{1,3}(,\d{3})+`). Anything else is reported as an error, never quietly turned into a different number. We chose an error over guessing the decimal mark because a quote is something a shop sends to a customer, and a garment cost wrong by a factor of 100 is worse than having to retype a cell. The web page wasn't affected, since its inputs are `type="number"` and the browser parses them.

**This bug is common in the repository, and it is already tracked.** About 340 venture files strip every comma in the same way. A check added the day before, `platform/ci/check_money_comma.py`, keeps a baseline list of them and fails when a file gains such a parser or when a fixed file is still listed. This fix takes the embroidery engine off that list. I also wrote a probe that calls every exported `parseMoney`/`parseAmount`/`parseNumber` with `"4,50"`. 177 of 212 returned 450. That is the size of the list still waiting. I didn't add the probe, because the existing check already guards the same class.

Catch rate on this target: 5 of 8 before, 8 of 8 after. All three real defects are patched in the same PR, with failing tests written first.
