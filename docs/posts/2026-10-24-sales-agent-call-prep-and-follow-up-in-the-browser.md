---
title: "Sales Agent: call prep and follow-up now run in the browser"
date: 2026-10-24
description: "Sales Agent's page gets a section that prepares a one-page brief before a call and drafts a recap email after it, from your own notes only."
tags: [sales-agent, sales, open-source]
---

# Sales Agent: call prep and follow-up now run in the browser

Until today the call-prep and follow-up engines of Sales Agent (milestones 7a
and 7b) were reachable only from the command line. Section 6 of the page now
runs both: type a person's email, paste notes from the call, and click.

- **Prepare the call** writes a brief from what is on the page already: the
  prospects table, the replies, the CRM export. It lists what they wrote in
  their own words and which of nine discovery fields you still know nothing
  about, each with the question to ask.
- **Draft the follow-up** turns your notes into a recap email that quotes only
  those notes, turns "I will send..." lines into promises, and runs the same
  draft checks as reply drafts. Anyone who asked to stop, bounced or is on the
  suppression list gets a warning and no draft.

Nothing is sent and nothing leaves the browser. What was checked: a page test
runs both engines on a hand-made thread, and I clicked both buttons once in
headless Chromium (no page errors; with an empty offer the follow-up is
flagged "fix first", as designed). What was not: any real call notes. The field
rules are still unscored on labelled notes, which is the next slice.
