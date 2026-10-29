---
title: "A free tax calendar for freelancers and sellers, as an .ics file"
date: 2026-10-29
description: "AI Bookkeeper tax calendar is now a web page: federal, payroll, 1099-NEC and state sales tax dates as a list or an .ics file for your calendar."
tags: [ai-bookkeeper, tax, open-source]
---

AI Bookkeeper already had a `calendar` command. Most people who need it will
never open a terminal, so it is now a page: pick a tax year, a state and a
filing frequency, tick payroll or contractors, and get the dates as a list or
one `.ics` file with a reminder a week ahead. It runs in the browser and
uploads nothing.

Testing it in a real browser found a bug the command line never showed: the
file writer used Node's `Buffer` to fold long lines, so the download threw in
every browser. It uses `TextEncoder` now, and a test removes `Buffer` to keep
it that way.

**What to trust.** The federal dates and the sales tax presets are the ones the
tool already used. Some state presets were read from the state's own page, the
rest from search excerpts and third-party guides, and the page says to confirm
yours. The 2027 IRS inflation figures are still not published, so nothing here
depends on them.
