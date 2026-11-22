---
title: "A beam that stores a quarter too much steel, and three guides to IFC quantities"
seo_title: "A beam storing a quarter too much steel: IFC quantity guides"
date: 2026-11-22
tags: [ifc-quantity-takeoff, ventures]
description: "Writing how-to guides for the free IFC takeoff turned up a missed check: a member's stored volume against its own length times section. Now caught."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads a
building model in the browser and turns it into a bill of quantities. It also
recomputes every element's volume from its geometry and names the cause when
a stored figure disagrees. Until today it had a tool page and nothing else,
so someone searching "bill of quantities from IFC" or "compare two IFC
revisions" had nothing to land on. Its sister tools for P6 schedules and IDS
checks already have how-to guides, so this one now has three:

- [How to get a bill of quantities from an IFC model](https://marisstella.app/ifc-quantity-takeoff/how-to-get-a-bill-of-quantities-from-an-ifc-model.html)
- [How to check the quantities stored in an IFC model before you price them](https://marisstella.app/ifc-quantity-takeoff/how-to-check-ifc-quantities-before-pricing.html)
- [How to compare two IFC revisions for a change order](https://marisstella.app/ifc-quantity-takeoff/how-to-compare-two-ifc-revisions-for-a-change-order.html)

Each one walks through the page's own sample office, and a test reruns the
engine and checks that every number in the worked examples is what the
engine actually outputs. If the engine changes, the guide's test fails
before the guide can go stale.

## What writing them found

The sample office has a steel IPE 200 beam that stores a NetVolume of
0.0142 m3. It also stores a Length of 4 m and a CrossSectionArea of
0.002848 m2 (the steel tables' 28.48 cm2), and those multiply to 0.011392 m3.
The beam's own I-section geometry gives 0.011394 m3. So the stored length,
the stored section and the geometry all agree, and only the stored volume is
off.

The engine already had a rule for this case: if a stored volume contradicts
the element's own stored length × height × width, and the geometry agrees
with that product, the stored volume is the wrong one, and the bill of
quantities uses the geometry. But beams, columns and members don't store a
height and width. They store a length and a section. So the beam stayed
"unexplained", its line kept the stored 0.0142 m3, and the steel was weighed
from that: 111.47 kg where the body gives 89.44 kg, a quarter too much.

The rule now also tries length × cross-section area. On the 13 public Revit,
ArchiCAD and Tekla models the check is measured on, the output is identical
line for line, so no public file has this fault. Tekla's 120 low steel
volumes still read as "simplified section", because Tekla stores the
simplified section as well. The new rule guards against exports like the
sample's. It isn't a measured gain on real files, and the
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/member-length-section-2026-11-22.md)
says so.

The tool is free and MIT licensed. The model never leaves the browser, and
the same code runs on the command line with `node cli.mjs model.ifc`.
