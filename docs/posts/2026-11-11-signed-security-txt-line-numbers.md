---
title: "Our security.txt checker pointed signed files at the wrong line"
seo_title: "security.txt validator bugs: signed-file lines, leap seconds, charset"
date: 2026-11-11
tags: [security-txt-check, redteam, rfc-9116]
description: "Red-teaming our RFC 9116 security.txt checker found 3 bugs: wrong line numbers in signed files, a leap second rejected, a quoted charset flagged."
---

Today's red-team run aimed at the engine of our
[security.txt checker](../../ventures/security-txt-check/), the free tool
that checks a `security.txt` file against RFC 9116. We seeded 8 deliberate
faults into it and the existing 32 tests caught 6. The 2 that got through
turned out to be harmless (more on that below). Reading the code as an
attacker turned up 3 real bugs, and those mattered more.

## 1. Signed files: every line number was three or more too low

Many security teams sign their `security.txt` with OpenPGP. A signed file
starts like this:

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Contact: mailto:security@example.com
```

The checker removes the signature wrapping and checks only the signed text
inside it, which is correct. But it then counted line numbers from the start
of that inner text, not from the start of the file. So `Contact` above was
reported as line 1 when it is line 4. "Line 3 is not a field or a comment"
sent you to a line that was fine. The more text above the `BEGIN` line, the
bigger the gap. Line numbers now count from the top of the file you pasted.

## 2. A leap second counted as an invalid date

RFC 9116 asks for an RFC 3339 timestamp in `Expires`, and RFC 3339 allows
second 60 for a leap second (`2027-06-30T23:59:60Z`). The code was meant to
accept it: it rejected only seconds *above* 60. But JavaScript's `Date.parse`
returns NaN for second 60, so the file got the most serious finding, "not a
valid timestamp". We now read `:60` as `:59` plus one second. No leap second
is scheduled, so this rarely matters, but a checker should not fail an input
that follows the standard.

## 3. `charset="utf-8"` was treated as no charset at all

When the CLI fetches a live file it checks the `Content-Type` header for
`charset=utf-8`. The pattern did not allow quotes, so a server sending
`text/plain; charset="utf-8"` (legal under RFC 2045) got a notice saying the
charset was missing. The same pattern also accepted `charset=utf-8x`, which
is not UTF-8. The check now reads the parameter with or without quotes and
requires it to end there.

## The two faults the tests missed

Both were in the date check, and both turned out to be impossible to trigger,
which we checked by running every case rather than reasoning about it:

- Turning "month differs **or** day differs" into "**and**" changed nothing
  across all 1,860 dates (in five sample years) that `Date.parse` accepts.
  When a date like 30 February rolls over, it lands on day 1 to 3 of the next
  month, so the month and the day always change together.
- Breaking the "seconds above 60" check changed nothing either, because
  `Date.parse` already refuses seconds 61 to 99.

So the catch rate was 6 of 8 before and after. The tests were already doing
their job. The bugs were in parts the faults did not touch, which is why we
read the code as well as seed it.

All three fixes have tests in `engine.test.mjs` that failed before the fix.
The checker runs in your browser, and nothing you paste is uploaded.
