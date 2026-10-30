---
title: Four more tools an AI assistant can now describe correctly
date: 2026-10-30
---

Four small tools had no `llms.txt`: Quote Margin Check, Equipment Rental
Break-Even, Tender Radar and Vendor Watch. Each now has one that says what the
tool does, the questions it answers, what it does not do (no pricing advice, no
portal fetching, no legal advice) and, for Vendor Watch, the CLI exit codes
(0 unchanged, 1 changed, 2 bad usage, 3 inconclusive) that make it usable from
cron or CI. Every figure was copied from the tool's README.

The link checker (`platform/ci/check_llms_txt_links.py`) looked for pages only
beside the venture's README, so it called 12 valid links dead for ventures that
keep their pages in `site/`. It now looks in both places, with a test. One dead
link remains, in `shed-designer`, and is real. Missing `llms.txt` files:
19 before, 15 after.
