---
title: "An AI SDR that starts from your own CRM export, and what it refuses to do"
seo_title: "An AI SDR that starts from your CRM export, and what it refuses to do"
date: 2026-10-24
description: "Sales Agent can now rank a CRM export against your ideal customer profile and draft first touches for approval. Which rows it drops, which it holds, and why..."
tags: [sales, ai-agents, crm, cold-email, open-source]
---

# An AI SDR that starts from your own CRM export, and what it refuses to do

Sales Agent already reads replies to your outreach, stops anyone who said stop and
builds the day's queue. The missing first step was choosing who to write to. The
new research step (`node cli.mjs --crm export.csv --icp icp.json --offer offer.json`)
does that from a file you already have.

## What it does

It maps HubSpot, Pipedrive or plain CSV headers to one shape, scores each contact
against your profile (industry, headcount range, titles, country) and keeps one lead
per company. Every score point has a reason in the brief, for example
`+25 120 employees is inside 30-300`. Each lead gets a first-touch draft that
states only your offer and fields from the export, and runs through the same draft
checker as reply drafts: no invented numbers, a postal address, an opt-out line.

## What it drops or holds

- opted-out or suppressed contacts, and anyone the inbox agent already has as unsubscribed, bounced or replied;
- customers, closed deals and disqualified leads (not cold prospects);
- role addresses such as `info@`, duplicates, and rows with no email (it never guesses one);
- anyone contacted inside a 90-day cool-off;
- Canada, Germany and Austria, held until you have consent, because cold B2B email there usually needs it. That is a prompt to check, not legal advice.

It reads no website and scrapes nothing. The roadmap leaves room for public pages
that allow it, but a brief you can audit field by field is worth more at the start.

## Limits

The tests use a hand-built export in HubSpot's column style, not a real customer's
file. The scoring is a transparent point scheme, not a trained model; ICP Lens's
fit score can be fed in as a column. Nothing is sent: the drafts wait for a person.

Code: `ventures/sales-agent/research.mjs`; roadmap item M6 in `ventures/sales-agent/ROADMAP.md`.
