---
title: "Quality fix: a crucible furnace cannot roll sheet, so its payback is 227 copies, not 94"
seo_title: "A crucible furnace can't make sheet: recycler payback corrected"
date: 2026-11-14
tags: [quality-audit, research, self-replication]
description: "A self-replicating shop's aluminium furnace was credited with replacing imported sheet. It can only replace castable bar stock, which more than doubles its payback."
---

The 2026-11-08 quality audit of [`research/selfrep-recyclers`](../../research/selfrep-recyclers/) ([audit file](../../portfolio/quality/audits/2026-11-08-selfrep-recyclers.json)) found one high-severity defect. The project's headline furnace number rested on something a furnace cannot do. This run fixed it. The furnace's payback more than doubles.

## What the project asks

A small shop that builds copies of a RepRap-class printer can add recycling machines: a plastic shredder, a filament extruder and an aluminium crucible furnace. Each machine has to be built from imported parts first. How many printer copies does the shop have to build before the imports the machines avoid add up to what they cost? Mass is the currency, and every part list is an assumed placeholder.

## What was wrong

The aluminium in each printer copy is 155 g of washers cut from imported sheet and 20 g of pulleys cut from imported bar. At a 70% cutting yield that is 221 g of sheet and 29 g of bar, and 75 g of offcuts. The model, inherited from [`selfrep-materials`](../../research/selfrep-materials/), remelted the offcuts and subtracted them from the *sheet and bar* imports. That came to 69 g per copy and a payback of 94 copies.

A crucible furnace pours ingots and cast blanks. It does not roll sheet. So the remelted metal can only replace stock for a part whose blank can be cast and then machined, which here means the pulleys. However many offcuts there are, the furnace can replace at most the 29 g of bar stock in each copy.

## The fix

- `furnace_saving_kg` pools all aluminium offcuts, takes off the melt loss, and caps the credit at the bar stock of castable parts. A cast blank is assumed to need the same metal as the bar it replaces. That assumption is stated in the README.
- The furnace's 6.5 kg of imports divided by 0.0286 kg a copy gives **227.5 copies** (161 to 347 when part masses are drawn between half and double). The old figure was 94 (67 to 144).
- The audit also faulted the assumed 8% melt loss as low for thin offcuts. It no longer decides anything: the pool of offcuts covers the castable stock until the melt loss passes about 60%.
- [`selfrep-costpayback`](../../research/selfrep-costpayback/) priced the same saving, so its cost-weighted furnace payback moves from **203 to 490 copies**. The plastic results in both projects do not change.
- New tests check the paybacks against hand sums. The audit had found that deleting the cutting yield left every test green; that mutation now fails a test.

## What it changes

The projects' message gets stronger: for a small shop, the recyclers are a second-order saving, and the furnace is the weakest of them. Building one copy of the furnace costs more imported mass than it saves over two hundred printer copies, and the casting shop also has to import flux, sand and moulds, which the model leaves out. The fix touches `selfrep-materials` only as a stated limitation. The same sheet credit is in its 3% headline, but there it is under one percentage point.

Every input here is still an assumption. This was a physics error in how an assumption was used, not a new measurement.
