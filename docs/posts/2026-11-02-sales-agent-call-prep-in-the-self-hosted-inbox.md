---
title: Call prep and follow-ups now run inside the self-hosted sales inbox
seo_title: "Open-source AI sales inbox: call prep and follow-ups"
date: 2026-11-02
tags: [sales-agent, self-hosted, open-source]
description: "The self-hosted sales agent now builds call-prep briefs and follow-up drafts from its own inbox, sending nothing."
---

The open-source sales agent reads replies from your own mailbox and keeps an approval queue. As of today the same server also answers two questions from what it already holds: *what do I know about this person before the call*, and *what do I send after it*.

`POST /api/prep` returns a brief: their own words, which of nine discovery fields are still unknown, and the question to ask for each. `POST /api/followup` turns your call notes into a recap draft that quotes only your notes. If the person asked to stop, bounced or is on your suppression list, you get a warning and no draft. Nothing is sent and nothing is queued.

What is not proven: it was tested against a fake mail server, not a real mailbox, and the field matching is keyword rules that have not been scored on real call notes. Both limits are written in the project's roadmap.
