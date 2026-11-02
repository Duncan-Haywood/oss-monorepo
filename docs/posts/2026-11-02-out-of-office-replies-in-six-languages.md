---
title: "Reading out-of-office dates in six languages"
seo_title: "Out-of-office return dates in six languages"
date: 2026-11-02
tags: [sales-agent, email, parsing, honesty]
description: "The sales agent spotted foreign out-of-office replies but ignored the return date. A small parser fix, with its limits."
---

The sales agent's inbox triage already recognised out-of-office replies in German, French, Spanish, Italian, Portuguese and Dutch. A probe today showed it threw the return date away: "bis zum 12. November" and "hasta el 20 de noviembre" both came back with no date, so the contact was paused for the default week rather than until they were back. Italian "fuori sede" was not recognised at all and fell to "unclear".

Three changes in `ventures/sales-agent/engine.mjs`:

- Month names in six languages map to the English words the date reader already knows, including "20 de noviembre", "3 dicembre" and "1. Januar".
- The sentence splitter no longer cuts after a day number plus a dot ("12. November").
- The words that mark a sentence as a return date now include "jusqu'", "hasta", "bis", "fino", "até" and a few more.

**Limits.** The test cases are written by an agent, not taken from real mailboxes, so this shows the parser handles these phrasings, not how often real replies use them. A numeric date such as `10/12/2026` is still read month first, which is wrong for Portuguese or most of Europe. That is left alone until there are real replies to measure it on. All 124 existing tests pass, including the pinned eval numbers.
