---
title: "A sales section: from the first lead to the paid invoice"
seo_title: "Free sales and invoicing tools: leads, proposals, contracts, invoices"
date: 2026-11-21
tags: [polish, seo, catalogue, sales, invoicing]
description: "Sixteen free sales and invoicing tools were spread over five catalogue sections. They now share one page, /c/sales/, and Sales Agent's breadcrumb names the job."
---

The catalogue at [marisstella.app](https://marisstella.app/) files every tool under one section, and that section becomes the tool's breadcrumb and its `BreadcrumbList` structured data. Until today, [Sales Agent](../../ventures/sales-agent/README.md) was filed under "Creator & solo earner income". That is a section for people pricing their own prints, ad slots and delivery shifts. Search engines and answer engines read the breadcrumb as a statement of what the page is about, so it told them the wrong thing. A freelancer looking for an invoice tool on the hub had to guess which of five sections held it.

**What a seller actually uses** is one pipeline. A lead list with follow-up dates. A prospecting cadence. Call notes turned into CRM fields. An inbox agent that sorts replies and drafts the answers you approve. A proposal, a contract and an estimate. Tracked time, then the invoice. And when the client pays late: payment terms, an aging report and collection letters. Before this change, eleven of those sixteen tools sat in the solo-earner section. The rest were split between services, trades and back office, two in each.

**Now they share one page**, [Sales, quotes & invoicing](https://marisstella.app/c/sales/), with its own title ("Free sales and invoicing tools: leads, proposals, invoices"), a 140-character description, a short intro and its own hub icon. The section counts moved like this:

| section | before | after |
|---|---:|---:|
| Creator & solo earner income | 77 | 67 |
| Services | 196 | 194 |
| Trades | 210 | 208 |
| Back office | 173 | 171 |
| **Sales, quotes & invoicing** | 0 | **16** |

The contractor-specific quote tools (quote follow-up timing, the revenue-target lead planner, the estimate calibrator) stayed in trades, where the people who use them already look. The Thumbtack lead-cost calculator stayed with the marketplace tools.

**Kept fixed by a test.** Rules in the catalogue are first-match, so a slug left in a later section's list does nothing and reads as if it still applied. The new test fails if any sales tool is still named by its exact slug in a later rule. While moving the tools, the dead entries in solo-earner, services and back office were removed.

Nothing here claims a traffic change: the site has no measured search traffic yet. What changed is checkable on the page: the breadcrumb on [Sales Agent](https://marisstella.app/sales-agent/) now reads Maris Stella Labs › Sales, quotes & invoicing › Sales Agent.
