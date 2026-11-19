---
title: "A 147-class IDS rule reads as 79 classes once each class gets its own subclass box"
seo_title: "IDS editor: a subclass checkbox for every class"
date: 2026-11-18
tags: [bim, ifc, ids, editor]
description: "IDS matches exact IFC classes. Our free IDS editor now gives every class its own subclass box, and opened files list 368 class names where they listed 506."
---

An IDS file is a list of rules for a building model (IFC): "every wall has a
fire rating", "every door has a name". Each rule says which classes it applies
to, and IDS matches classes exactly. A rule on `IFCSLAB` does not look at an
`IFCSLABSTANDARDCASE`, even though every standard-case slab is a slab. Rules
that should cover a class and its subclasses have to name every one.

Our free [IDS editor](../../ventures/ids-model-check/README.md) already had an
"and its subclasses" box, but only on the first class of a rule. A rule for
"walls and slabs, with their subclasses" got the box on walls. Slab
subclasses had to be typed by hand. And when you opened a file that already
listed `IFCSLAB` and all of its subclasses, the editor showed each one as a
separate exact class.

## What changed

Now every class in a rule has its own box. When a file is opened, a class
whose concrete subclasses are all listed opens with its box ticked, and the
subclasses it covers are not listed again. A group inside a bigger group is
ticked once, at the top. The file written back names exactly the same classes
as before.

## What it did to real files

We open the same 64 public IDS files from GitHub that the editor is tested
on. 29 rules name more than one class. Four of them, in four files, now open
differently:

- The two bSDD-Toolkit templates (IFC 4.3) each name 147 classes. They now
  open as 79 classes, 11 with their subclasses ticked, such as
  `IFCFLOWTERMINAL` and its 16 subclasses and `IFCENERGYCONVERSIONDEVICE` and
  its 20.
- Two COBie component rules from the UK Department for Education open
  `IFCFLOWCONTROLLER` ticked.

Across the 29 rules, the class names you have to read went from 506 to 368.
All 507 rules in the 64 files still write back asking the same thing, and
the editable share of facets stays at 93.0%. Nothing became editable that
wasn't before. The difference is that a rule now shows what its author meant,
and if you switch the file to another IFC version, a ticked class brings in
that version's subclasses.

## The ones that were left out on purpose

We also looked for lists that name a class and most, but not all, of its
subclasses. That would be a good place for a "did you forget one?" warning.
Every case turned out to be a deprecated class. The bSDD templates leave out
`IFCWALLSTANDARDCASE` and `IFCELECTRICDISTRIBUTIONBOARD`, both deprecated in
IFC 4.3. A buildingSMART Spain file (two rules) and a bim2sim file leave out IFC4's rarely exported
`IFCWALLELEMENTEDCASE`. Those look like choices, not slips, so the editor
leaves the boxes unticked and doesn't warn.

The method and the numbers are in
[`eval/also-subclasses-2026-11-18.md`](../../ventures/ids-model-check/eval/also-subclasses-2026-11-18.md).
