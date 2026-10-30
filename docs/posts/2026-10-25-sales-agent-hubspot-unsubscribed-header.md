---
title: "A HubSpot unsubscribe our sales agent could not see"
date: 2026-10-25
description: "Testing sales-agent on HubSpot's own column names found an unsubscribed contact getting a draft, and an Unqualified lead status hidden behind lifecycle stage."
tags: [sales-agent, compliance, crm]
---

[sales-agent](../../ventures/sales-agent/) reads a CRM export, ranks accounts and
drafts first touches that a person approves. Until now its tests used a
hand-built file. I rewrote one with the column names HubSpot's export view uses
(remembered, not from a live account) and two things went wrong.

- **"Unsubscribed from all email"** is HubSpot's wording; the reader only knew
  "...emails". A contact marked `true` got a draft. It is now dropped.
- **Lead Status beside Lifecycle Stage.** The reader mapped both to one field
  and the lifecycle stage won, so a `Lead` with status `Unqualified` was
  ranked. Lead status is now its own field; `Unqualified` and `Disqualified`
  are dropped, and it still stands in for the lifecycle when that column is
  missing.

A test pins both (`research.test.mjs`). Caveat: header names and rows are
made up from memory of HubSpot's layout; a real export is still wanted.
