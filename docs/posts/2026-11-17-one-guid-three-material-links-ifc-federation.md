---
title: "One GlobalId, three material links: what shared IFC GlobalIds really are"
seo_title: "Shared GlobalIds in federated IFC: allow lists and followers"
date: 2026-11-17
tags: [bim, ifc, ids, coordination]
description: "Of 35 GlobalIds buildingSMART's Simple-Scene shares between files, 8 are elements. The rest follow them, or reuse one id for different links."
---

Earlier today [IDS Model Check](https://marisstella.app/ids-model-check/) started
comparing GlobalIds across the models of a federated set. If the architect's
file and the structural file hold the same GlobalId, a viewer, a clash test or
a BCF topic treats two objects as one, and a quantity takeoff counts the
element twice. On buildingSMART's ten-file Simple-Scene (IFC4) it reported 35
such GlobalIds.

The obvious next step was an allow list, because some sharing is deliberate:
Simple-Scene copies a "geo-reference" proxy into all ten discipline files and
an "origin" marker into the four building files. Before writing it, I counted
what the 35 were. **Only 8 are elements.** Allowing the origin marker by
name would still leave three warnings about it: its type, the relationship
that assigns the type, and its material link.

## Followers

So the check now looks inside shared relationships. If a shared
IfcRelDefinesByType or IfcRelAssociatesMaterial names, in every file, only
objects that are shared too, it follows those objects. It is listed under the
element ("with it: IFCROOFTYPE "house - roof", IFCRELDEFINESBYTYPE ...")
rather than reported as a separate finding. The same applies to a type that
such a relationship names next to a shared element. Simple-Scene's 8 shared
elements carry 14 followers this way.

## One GlobalId, different relationships

Twelve shared relationships did not follow anything, and they turned out to
be a different and worse fault. Take `0bat_vVbL5e9xkiecCrRuV`, a material
link that appears in three files:

- in `Infra-Bridge.ifc` it links four "rail bridge - filler" proxies;
- in `Building-Landscaping.ifc`, the house's underground site;
- in `Infra-Landscaping.ifc`, four park, river and site elements.

It looks as if the exporter derives one GlobalId per material. To a tool that
merges models by GlobalId these are one relationship, so it keeps one set of
links and drops the others. The check now names that case ("one GlobalId for
relationships that link different objects in each model") instead of calling
it "the same object in two files".

## The allow list

`--shared-globalids-allow FILE` (Action input `shared-globalids-allow`) takes
one rule per line:

```
* "geo-reference"                 # one georeferencing proxy in all ten files
IFCBUILDINGELEMENTPROXY "origin"  # the building's origin marker
IFCGRID                           # no grid is shared here: reported as unused
3XrBtx9eX7mQE6EqWHPk1R            # or a single GlobalId
```

A shared element is allowed when every file's copy matches a rule, and its
followers go with it. A GlobalId's first character is always 0 to 3, which
keeps a 22-letter class name like `IFCBUILDINGELEMENTPART` from being read as
an id. A rule that matched nothing is listed in the job summary. Allow lists
outlive the models they were written for, and a stale rule can hide the next
real mistake.

On Simple-Scene IFC4 the result goes from 35 findings to 23 with no list, and
to 21 with the two marker rules, which clear 8 GlobalIds. The roof modelled in
both architecture and structure is still reported, as are the two manholes in
plumbing and electrical. HHS Office's three discipline exports are unchanged
(one wall in two files), and one class-and-name rule clears it.

The numbers, the rule format and how to rerun them are in
[`eval/federation-allow-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/federation-allow-2026-11-17.md).
Everything runs on the build machine, and no model leaves it.
