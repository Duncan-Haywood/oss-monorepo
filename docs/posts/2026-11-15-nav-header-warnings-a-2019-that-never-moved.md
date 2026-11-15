---
title: "NAV's own sample invoice gets a warning: a 2019 that never moved"
seo_title: "NAV Online Számla header warnings: Annex I sections I.1 and I.2"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "We read the header and line warnings in NAV's Annex I one by one. 23 can be checked from the file, and one catches a slip in NAV's own sample."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) reads Hungary's NAV Online Számla 3.0 reports, the `InvoiceData` XML every Hungarian invoicing program sends to the tax authority. NAV accepts a report it has doubts about but attaches a *warning*. Annex I of NAV's interface specification (the English PDF dated 2026.02.12) defines every warning. It gives the formula, when the warning runs, and which invoice types it covers.

We had already read the calculation and summary warnings ([earlier post](/posts/2026-11-15-nav-warnings-what-nav-actually-checks/)). Today we read the two sections before them: I.1, the invoice header, and I.2, the line data.

## What a file can show

I.1 has 44 warnings. Ten are marked deprecated or inactive. Of the 34 left, eight look things up in NAV's taxpayer register: is this tax number live, is it a VAT group member, does it exist at all. A file can't answer those. Three more need the stored original invoice, such as "does this correction move the original's delivery date?". That leaves 23 that the file alone decides, and none of them was being checked by its own definition before today:

- the customer or the fiscal representative given the seller's own tax number, name or bank account;
- a VAT code outside NAV's set (the seller's can't be 4, which marks a group member);
- a county code (the last two digits of a Hungarian tax number) outside 02-20, 22-44 and 51;
- a fiscal representative on a seller whose county code isn't 51, or one with an address outside Hungary;
- a seller EU VAT number that doesn't end with the seller's tax number;
- a delivery date 397 days or more after the issue date (NAV's "13 months");
- an aggregate invoice issued before its last delivery, or whose header delivery date isn't the latest line date;
- delivery period dates without `periodicalSettlement` set to true.

I.2 adds nineteen line-data checks. A summary rate that no line uses. A line that refers to itself. A reverse-charge or margin-scheme line with VAT on it. And an exemption code that doesn't fit the customer's kind of tax number: KBAET (exempt supply to another EU country) needs an EU VAT number, and EAM (export) must not have one.

## Which day is "today"?

Four warnings compare dates with the day NAV receives the report. The issue date can't be more than 5 days in the future. A correction issued 15 or more days earlier gets flagged. A delivery date from before 1 January of the sixth year back counts as lapsed. A `manageInvoice` request carries that day in its timestamp, and the checker uses it. A bare `InvoiceData` file has no such date. The page checks before you send, so it uses today's date in Budapest and says so in the message.

## The 2019 that never moved

We ran the new checks on NAV's 30 published sample files. One new warning came up, and it's a real one. `Gyujtoszamla 2.xml` is an aggregate invoice issued 15 May 2021. Its header says the last delivery was 13 May 2021. All four of its lines say the deliveries were in **2019**. Its twin, `Gyujtoszamla 1.xml`, has the same lines dated 2021. It looks like someone updated the year in one file and missed the other.

NAV's API sample also gets a warning on each of its three invoices. The seller's EU VAT number there is a placeholder, `AS16514193`, which doesn't end with the seller's tax number.

We also seeded faults into the 30 samples to test the new checks: 172 altered files, six kinds of fault, and all 172 were caught. While doing that we found a bug in our own test harness. It placed a seeded value by searching for the old one. When we tried to change a VAT code of 5, it found the "5" inside tax number 98765432 first and changed that instead. That bug is fixed now.

## What it doesn't do

It doesn't check anything against NAV's register or against an invoice NAV has stored. It hasn't been compared with real replies from NAV for a business's own reports. If you have one with its `businessValidationMessages`, we'd like to see it. Findings are an offline observation, not NAV's acceptance and not tax advice.

The full table, warning by warning, is in the venture's `eval/nav-annex1-head-lines-2026-11-15.md`.
