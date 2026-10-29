---
title: "Sales Agent now writes what it read back into your CRM"
date: 2026-10-29
description: "Sales Agent can now note each reply it reads on the Pipedrive or HubSpot contact and set the CRM opt-out on unsubscribes. It only records or reduces contact."
tags: [sales-agent, crm, open-source]
---

A sales agent that reads replies but leaves the CRM stale does half a rep's
bookkeeping. Sales Agent's self-host server now closes that gap (milestone M8a).

Set `PIPEDRIVE_API_TOKEN` or `HUBSPOT_TOKEN` and, after each poll, every reply
it triaged becomes a note on the contact: the category, the sentence it was
read from, and a line saying an agent wrote it. For an unsubscribe it also sets
the CRM's own opt-out (Pipedrive `marketing_status`, HubSpot `hs_email_optout`).

The limits are the design. It looks the person up by exact email and does
nothing if they are not there: it never creates contacts or deals, never moves
a stage, never deletes, never sends. A CRM outage is written to the audit log
(with the token masked) and does not stop triage.

**What is and isn't verified.** A test runs both writers against a fake HTTP
server and checks which calls were made, that an unknown address produced no
write, and that the token never reaches the audit log. The endpoint shapes
come from the vendors' public docs as I know them; no real Pipedrive or
HubSpot account has been tried, so treat the first real run as the test.

Code: `ventures/sales-agent/self-host/crm.mjs`. Next: stage changes as
person-approved queue items, and a run against a real account.
