---
title: "The front page now leads with products, not 1,400 free tools"
seo_title: "Software for small businesses, one kind at a time"
date: 2026-11-24
tags: [site, product, small-business, marketing]
description: "The home page now opens on products for specific small businesses: one live, five in early access, three hardware designs. The free tools sit under them."
---

Until today the front page of this site said "Free tools to price the job,
check the fees and run your business," with a search over about 1,400 free
calculators. That is a lot of free tools, and it hid what the project is now
for: products that specific small businesses pay for.

So the front page changed shape. It now opens on the products, one line for
each kind of business, each built around the jobs that business finds
hardest:

- **Contractor billing**, for specialty subcontractors and small general
  contractors: monthly pay applications, retainage, lien waivers and change
  orders.
- **Job shop quoting**, for CNC machine shops and fabricators: turning an RFQ
  into a priced quote from the shop's own rates.
- **E-invoice fix-and-explain**, for small businesses in Germany and France
  and their accountants, ahead of the e-invoicing deadlines.
- **Reseller profit and books**, for people selling on eBay, Poshmark,
  Mercari, Whatnot and Depop.
- **Takeoff and material lists**, for remodelers, roofers and framers.
- **Grant Autopilot**, for small nonprofits.

Only Grant Autopilot is live. The other five are in development, and the
page says so on every card ("In development · early access") with a link to
write in for early access. Each card also lists the free tools on this site
that already do part of that job, so nobody has to wait to get something
useful.

There are also three hardware designs: a wire-free robot mower, a robot
vacuum and mop on one chassis, and a tennis ball machine with a moving catch
net. They are open designs with CAD, firmware and parts lists. Nothing has
been physically built yet, and the pages say that too.

## What changed on the site

- A new [Products](https://marisstella.app/products/) page lists every line
  and the hardware.
- A new [Industries](https://marisstella.app/industries/) page lists the
  businesses the products serve: construction, manufacturing, online
  sellers, EU e-invoicing and nonprofits. Each has its own page.
- Products and Industries are the first two items in the top navigation.
  "Deploy your own" became "Self-host" so the header still fits on one row.
- The free tools moved under the products, introduced as free tools for the
  same businesses. They are still all there, and the search still finds them.

## One file holds the facts

Every word the site says about a product (who it is for, the problems, the
status) comes from one data file, `platform/pages/business.mjs`. A test fails
if any product other than Grant Autopilot is marked live, if a hardware line
is not marked long-term, or if a card carries a percentage, a price or a
testimonial. When a product opens, one line in that file changes, and the
front page, the products page and the industry page all say so on the next
build.
