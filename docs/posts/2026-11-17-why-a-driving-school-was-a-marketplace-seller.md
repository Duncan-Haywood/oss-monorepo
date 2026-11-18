---
title: "Why a driving school page said \"Marketplace seller tools\""
seo_title: "Fixing 18 misfiled breadcrumbs on a tool catalogue"
date: 2026-11-17
tags: [polish, seo, platform]
description: "18 tools sat in the wrong category to save room in an offline bundle. The cost: a wrong first link on every one of their pages and in search results."
---

Open the [driving school profit calculator](https://marisstella.app/driving-school-profit-calculator/)
on a phone yesterday and the first link under the site header said **Marketplace seller tools**.
The same words were in the page's breadcrumb markup, so a search result could show them too. A
driving school sells lessons, not listings on someone else's storefront.

It was not alone. Eighteen tools had that breadcrumb: a barbershop chair, a braiding studio, a
tailor, a shoe repair shop, a phone repair shop, an axe-throwing bar, a commercial lease reader, a
vendor contract reader, a severance package calculator and others.

## How it happened

Every tool on the site gets its section from one ordered list of rules in the site build. Each
section can also be saved for offline use, and each offline bundle has a size ceiling so it stays
small enough to download over mobile data. In October two sections, back-office and services, were
close to that ceiling. New tools that belonged in them were added to the marketplace rule instead,
because it had room. The comments in the code still said "filed beside the service tools", so
nothing looked wrong when you read the code. You had to open the page to see it.

## What changed

- 11 tools moved to **Service business pricing & quotes**: the shop, studio and salon calculators,
  the driving school, the axe-throwing bar, the tournament pairing manager and the bail bond
  agency calculator.
- 7 moved to **Back-office money & contracts**: the lease, contract and insurance readers, the
  workers' comp and percentage-rent audit checkers, the card processor fee comparison and the
  severance calculator.
- The ceiling has since been raised to 4 MiB and the UK tax tools have their own section, so both
  fit. Measured on a full build, back-office is now 3.91 MiB and services 3.50 MiB.
- A test now fails if a shop, studio, salon or school profit calculator is ever filed under the
  marketplace again.

The marketplace section went from 118 tools to 100. Every one of the 100 is about selling through
eBay, Etsy, Amazon, Airbnb or another platform's fee schedule.

## What is still off

Services still holds about two dozen household tax and retirement tools, such as a 401(k) loan
calculator, a Medicaid look-back calculator and a nanny tax calculator. They were parked there for
the same reason. They need their own section, which is the next job.
