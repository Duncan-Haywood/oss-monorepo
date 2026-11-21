---
title: "A date-time window in an IDS file that IfcTester can check"
seo_title: "IDS xs:dateTime ranges in IfcTester: write them as a pattern"
date: 2026-11-21
tags: [ids-model-check, ventures, bim, ids]
description: "IfcTester fails every object on an IDS dateTime range. The IDS editor now writes the same window as one exact XSD pattern both checkers read alike."
---

Say a precast contract wants every beam's `ActualErectionDate` to fall
inside the erection window: from 07:00 on 1 March to 17:00 on 30 June. IDS
1.0 lets you write exactly that, a range on `xs:dateTime`. The trouble is
that IfcOpenShell's IfcTester 0.9.0, the checker much of the industry uses,
reads range bounds as numbers. `float("2025-03-01T07:00:00")` fails, so it
fails every beam, on time or not. We measured it again today: 31 of 31 beams
failed on all 10 ranges we tried.

Last week the [IDS editor](../../ventures/ids-model-check/) learned to
rewrite a *date* range as an XSD pattern both checkers read the same way.
Since today it does the same for *date-time* ranges.

## Why that is harder than it sounds

A pattern only sees text, while a range compares instants. So the pattern has
to follow everything the range does with the text:

- `2025-06-30T17:00:00.0009` is 17:00:00.000 to a checker that keeps
  milliseconds, so it passes an upper bound of 17:00, and `.001` fails it;
- `2025-02-28T24:00:00` is midnight on 1 March;
- `2025-03-01T12:44:59+05:45` is 06:59:59 UTC, one second early.

The editor's pattern handles all three. Days well inside the window are
written once. The days near each bound are written once per UTC offset, with
the exact time range that offset allows.

## What it costs

The pattern is long: 3 to 16 kB depending on the window. It is exact for
values with no zone, `Z`, or any of the 44 UTC offsets real time zones used
between 2000 and 2026. An offset no zone uses, such as `+10:17`, passes only
when it is more than a day inside the window. That is the one place the
pattern asks more than the range does.

On 31 beams built on those edges the pattern gave the range's verdict on all
290 that use real offsets. IfcTester gave the same failing beams on the
pattern as our checker in 10 of 10 specifications. Method and output:
[`eval/datetime-pattern-2026-11-21.md`](../../ventures/ids-model-check/eval/datetime-pattern-2026-11-21.md).

To use it, open your IDS in the editor. Any date-time range row now shows
**Write as a pattern**. The editor runs in your browser, so your file isn't
uploaded anywhere.
