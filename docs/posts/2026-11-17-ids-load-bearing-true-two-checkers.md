---
title: "LoadBearing = TRUE: the same IDS file checks the walls in one tool and none in another"
seo_title: "IDS property values with no dataType: why TRUE splits checkers"
date: 2026-11-17
tags: [bim, ifc, ids, construction, javascript]
description: "Three public IDS files ask Pset_WallCommon.LoadBearing = TRUE with no dataType. Two checkers disagree on what that matches. The IDS editor now flags it."
---

An IDS file (buildingSMART's Information Delivery Specification) tells a
model checker what a building model must contain: "every load-bearing wall
has a fire rating", say. The "load-bearing" part is usually a property
condition: `Pset_WallCommon.LoadBearing` equals true.

IDS 1.0 lets that condition leave out the `dataType` attribute. Three files
in public repositories do (OpenAEC's BIM validator, the open-3d-viewer
sample and an openingBIM CI sample), and they write the value with a
capital: `TRUE` in two, `True` in the third.

## What the missing dataType does

buildingSMART's own test cases only write booleans as lowercase `true` or
`false`, with `dataType="IFCBOOLEAN"`. A `TRUE` with no dataType is a case
those tests don't cover, and two checkers handle it differently. On a small
sample house with two external walls and one internal wall, a specification
that applies to `Pset_WallCommon.IsExternal = TRUE` (no dataType) gave:

| | IDS Model Check | IfcTester 0.8.0 |
| --- | --- | --- |
| `TRUE`, no dataType | applies to 0 walls | applies to 2 walls |
| `true`, `dataType="IFCBOOLEAN"` | applies to 2 walls | applies to 2 walls |

So the same published file checks the model's external walls in one tool
and quietly checks nothing in the other. Neither tool shows an error. The
specification just covers a different set of walls.

## What changed in the editor

The [IDS editor](https://marisstella.app/ids-model-check/editor.html) used to
show every untyped value as read-only XML, because its rows always wrote a
dataType. Now an opened value with no dataType becomes an ordinary row that
keeps no dataType, so saving the file doesn't quietly change what it asks.
The row explains what the missing type means. On a boolean written `TRUE` or
`True`, it warns that checkers disagree. **Write dataType IFCBOOLEAN** turns
it into `true` with the type, and both tools then read it the same way. With
a model open, the condition shows its match count again ("2 of the model's 3
object(s) of this class match").

The audit's `value-no-datatype` warning now says the same about a capitalised
boolean.

On the 64 public IDS files the editor is measured against, 84.9% of facets
are now editable (it was 83.6%), and all 507 specifications still write back
asking for exactly what they asked before. The 27 new rows come from six
repositories, including Rotterdam's building-permit checks.

The measurements and how to rerun them are in
[`eval/untyped-values-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/untyped-values-2026-11-17.md).
If you publish an IDS, write booleans as `true`/`false` with a dataType.
