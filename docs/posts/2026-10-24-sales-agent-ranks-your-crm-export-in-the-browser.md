---
title: "Sales Agent now ranks a CRM export in your browser, and explains every point"
seo_title: "Sales Agent ranks a CRM export in your browser and explains each point"
date: 2026-10-24
description: "Paste a HubSpot or Pipedrive CSV, describe your ideal customer, and get ranked accounts with first-touch drafts. Nothing is uploaded or sent."
tags: [sales, crm, open-source, privacy]
---

# Sales Agent now ranks a CRM export in your browser

Sales Agent, the free open-source inbox agent that never sends email on its own,
gained a fifth section today: **who to contact first**.

Paste a CSV export from HubSpot, Pipedrive, Salesforce or anything else. Name the
industries, buyer titles, countries and company sizes you sell to. The page ranks
one contact per company, shows every point of the score ("+25 title 'Director of
Operations' is a buyer you named"), and writes a first-touch draft that must pass
the same checks as a reply draft: postal address, opt-out line, no invented numbers.

It leaves people out for stated reasons: opted out, on your suppression list,
already a customer, a shared `info@` inbox, contacted in the last 90 days.
Canada, Germany and Austria are held back for consent rather than drafted.
It reads no website and guesses no email address. Every fact in a brief is a
field of your own export.

## What is and is not proven

The ranking engine is tested on a hand-built HubSpot-style export and the page
wiring on a bundled example. It has not yet met a real export, and the consent
holds are a prompt to check your own legal basis, not legal advice. If you try it
on a real file and a column is misread, the header aliases are one small table in
`research.mjs`.

Try it: <https://duncan-haywood.github.io/oss-monorepo/sales-agent/>
