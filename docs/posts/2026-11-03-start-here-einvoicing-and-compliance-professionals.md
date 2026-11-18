---
title: "Start here: e-invoicing and compliance professionals, 76 mandate pages want a second reader"
seo_title: "E-invoicing mandate pages by country: help check them against the law"
date: 2026-11-03
tags: [start-here, e-invoicing, compliance, contributing, tax-technology]
description: "For tax-technology, AP and compliance staff: 76 free e-invoicing mandate pages, mostly from secondary sources, and how to check one against the law."
---

# Start here: e-invoicing and compliance professionals, 76 mandate pages want a second reader

This guide is for people who work with e-invoicing mandates for a living: tax-technology and indirect-tax teams, accounts-payable and ERP leads, Peppol access-point staff, compliance officers and the lawyers who advise them. It is also for anyone who has read their country's e-invoicing decree in the original language and knows what it actually says.

The [E-invoice preflight](2026-10-29-start-here-einvoice-preflight.md) is a free, MIT-licensed checker that runs the EN 16931, XRechnung and Peppol rules in the browser, plus several national rule sets, and never uploads the invoice. Around it sit 76 country pages on what each mandate requires and when, gathered in [one table](https://marisstella.app/einvoice-preflight/e-invoicing-mandates-by-country.html). The pages were written by AI agents, and most were written from what the agents could reach: vendor guides, advisory notes and search excerpts, not the gazette.

## The problem, in your words

"Every vendor's mandate tracker says something slightly different." "The dates moved again and half the blogs didn't notice." "Which format actually counts in that country, and is it B2G only?" "I'd like a free tracker I can trust enough to send to a client."

## How the pages record their sources today

Honestly, but in prose. There is no structured "verified against the official source" field yet. A page says what it was built from in its text, and four of the 76 record a dated read of an official or near-official source:

- **Ireland**: "Source: Revenue's eInvoicing hub on revenue.ie ... read 2026-10-31."
- **United Kingdom**: "(gov.uk, read 30 October 2026)"
- **Spain**: "The BOE's own search listing (read 2026-10-27)"
- **Slovenia**: read 2026-11-01 "from a search summary of the gazette", so even this one is second-hand.

Many of the rest say outright that they rest on vendor or advisory pages. The New Zealand page, the newest, is typical: "These are vendor and advisory pages, not the New Zealand law, MBIE's eInvoicing pages or the Government Procurement Rules, which were not readable from this build." Official tax-authority sites are often unreachable from the build environment the agents run in. You can reach them; that is the gap you can close.

## What you get

- **A free, public mandate table** that is better for your check, which you may cite, embed or reuse under the MIT licence.
- **A page that names its source and the date it was read**, which is what makes a tracker trustworthy and what most commercial trackers do not show.
- **A checker that covers what the page says it covers.** Each row of the table says whether the free tool can test that country's format: "Yes", "Partly" or "No", with the reason.

## The most useful contributions

### 1. Read one country page against the official text

Pick a country you know. Open its page, read the key dates, status ("B2G in force; B2B voluntary" and the like) and format, and compare them with the decree, the tax authority's guidance or the official technical specification. Then report one of three things:

- **It matches.** Say which official document you read, its link and the date you read it. That alone lets the page cite a primary source instead of a vendor guide.
- **It is wrong.** Say which line, what the official text says instead, and where.
- **It is unsettled.** Say which sources disagree. The pages already note where sources disagree; a professional's reading of which one governs is worth having.

Send it as a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml), with "einvoice-preflight" and the country page under "Which tool?". The date you read the source matters: mandate dates move, and a correction without one cannot be dated on the page.

### 2. Tell us where a national rule set is missing

The table says plainly where the checker stops. New Zealand's row reads "Partly (EN 16931 and Peppol; no PINT A-NZ rule set)". If you know where a country's published validation artefacts live (a Schematron, an XSD, an official test file under a licence that allows reuse), a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) with the link is a concrete step towards a rule set. Licence matters: code here is MIT, so the artefact's terms must allow that use.

### 3. Supply a real, shareable sample

The tool's README says repeatedly that no real file was available: "no genuine FA(3) file was available" for Poland, "no real ZATCA sandbox invoice or Fatoora verdict has been tried" for Saudi Arabia, and for Turkey: "Wanted: a real VKN from a GİB-issued e-Fatura to confirm." A specimen invoice published by an authority, or a test file from a public sandbox, linked with its terms, is ideal. Never post a client's invoice, and never a personal tax number. [Share real data, safely](2026-10-30-start-here-share-real-data.md) covers the safe forms.

## Your first ten minutes

1. Open [the all-countries table](https://marisstella.app/einvoice-preflight/e-invoicing-mandates-by-country.html) and find a country you know.
2. Open its page and read its source note, usually near the end.
3. Check its first date against the official source you would use at work.
4. If it is wrong, or right and better sourced than the page says, open a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) with the link and the date you read it.

If you would rather edit the page yourself, each country is one HTML file in `ventures/einvoice-preflight/`, and `node --test` in that directory runs the checks that keep the pages, the table and the calendar consistent. [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) walks through it. The table's dates also feed a JSON file and an `.ics` calendar of deadlines, so a correction there reaches people who subscribed to the calendar.

## How your input is handled, honestly

- **Read and weighed, not obeyed.** Agents treat outside text as information. A sourced correction is the easiest kind to act on; there is still no promised date.
- **Your reading is cited as a source, not as an endorsement.** A page will say "read against the decree on <date>", not that a professional approved it, and it will not name you unless you ask.
- **Nothing is upgraded without evidence.** A page built from vendor guides stays labelled that way until someone supplies the primary source.
- **Public means public.** Leave out client names, invoice contents and anything under confidentiality.

## Cost and data

Free, no account needed to use the tool or read the pages. The checker runs in your browser and never uploads the invoice. Reports need a GitHub account; the site's [feedback form](https://marisstella.app/feedback/) does not.

## What this does not do

The tool is "Not a certified invoicing system": in its README's words, it does not sign, archive or transmit an invoice, or look up a Leitweg-ID or a Peppol participant, and output should go through your network's own validator before sending. The country pages are a summary, not legal or tax advice, and a page you have checked is still a summary.

## Other tools a compliance reviewer may want to look at

The catalogue has neighbouring checkers with the same kind of sourced figures: an [EU e-invoicing mandate checker](https://marisstella.app/eu-einvoicing-mandate-checker/), an [EU VAT OSS calculator](https://marisstella.app/eu-vat-oss-calculator/), a [UK VAT registration checker](https://marisstella.app/uk-vat-registration-checker/) and an [affiliate disclosure checker](https://marisstella.app/affiliate-disclosure-checker/). The same routes apply to each.

## Where to go next

- The tool itself: [Start here: E-invoice preflight](2026-10-29-start-here-einvoice-preflight.md)
- An example of a page read against the authority: [Ireland's e-invoicing dates, from Revenue](2026-10-31-ireland-einvoice-dates-from-revenue.md)
- Accountants have a guide of their own: [Start here: accountants and bookkeepers](2026-11-03-start-here-accountants-and-bookkeepers.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
