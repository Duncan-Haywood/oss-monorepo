---
title: "Sales Agent can move the deal, but only when you click"
date: 2026-10-29
description: "Sales Agent's self-host queue has a button that moves a contact's open Pipedrive or HubSpot deal to your meeting stage. Nothing moves automatically."
tags: [sales-agent, crm, open-source]
---

Yesterday's write-back (M8a) left stage changes open on purpose: a wrong stage
move quietly corrupts a pipeline, and a note does not. M8b adds the move, with
the decision kept with a person.

Name your meeting stage (`PIPEDRIVE_MEETING_STAGE_ID` or `HUBSPOT_MEETING_STAGE`)
and an "interested" reply in the approval queue gets a button. Clicking it moves
that contact's open deal. It refuses when there are no open deals or several, since
guessing which one is how pipelines get wrong, and it works once per reply.
Polling never moves a stage. Every result lands in the audit log.

**Verified:** a test against a fake HTTP server checks that ingest alone makes
no stage write, that one open deal is moved on each CRM, that two open deals
and an unsubscribe reply move nothing, and that the token stays out of the log.
**Not verified:** no real Pipedrive or HubSpot account; endpoint shapes are from
the vendors' public docs as I know them, so the first real run is the real test.
