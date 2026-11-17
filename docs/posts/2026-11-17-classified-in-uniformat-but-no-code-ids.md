---
title: "143 of 210 classified elements in a Revit model have no code, and an IDS system check passes them"
seo_title: "IDS classification check passes elements with no code"
date: 2026-11-17
description: "The free IDS editor now offers a model's attribute values and classification codes, and warns when objects carry a system with an empty code."
tags: [ids-model-check, bim, ifc, ids]
---

The [IDS editor](/ids-model-check/editor.html) already offered the values a
model holds for a property
([the last post](/posts/2026-11-17-ids-ranges-have-no-tolerance-0254-is-not-0254/)).
Today attribute rows and classification rows get the same treatment. Open
the model you are writing for, add a requirement on `Name`, `ObjectType`,
`Tag` or `PredefinedType`, and the row lists the values the model's objects
hold, with **Allow exactly these values** to turn them into a one-of list. A
classification row lists the codes the model uses in that system, and names
the systems the model actually uses when the one you typed isn't among them.

## What the codes turned up

Of the four public exports we test the editor on (three HHS Office models
and the Schultz Residence, from `opensourceBIM/IFC-files`), only Schultz
carries a classification: Uniformat, on 210 elements and 134 type objects.
But 93 of its 134 classification references look like this:

```
IFCCLASSIFICATIONREFERENCE('http://www.csiorg.net/uniformat','','',#739);
```

The system is there and the code is an empty string. **143 of the 210
classified elements (68%) have no Uniformat code.**

An IDS requirement written the obvious way, "these elements must be
classified in Uniformat", passes all 210. A coordinator who writes it sees green and believes
the model is coded. The checker is right: the system is present. The mistake
is in the requirement, and the author can't see it without reading the file.

So the classification row now says so. On the windows: "The model classifies 25 of 25 in
Uniformat. 11 of them have a Uniformat reference with no code: a requirement
that names only the system passes them, and one that asks for a code fails
them." Next to it, **Require a code** writes the value as a `.+` pattern,
which fails exactly the uncoded objects. Attributes get the same warning:
68 of Schultz's 146 building element proxies have `Name` and `ObjectType`
written as empty strings, and IDS fails an empty attribute on any check of
it, even an "if present" one.

## Does an offer pass the model it came from?

We built a requirement from every offer and checked it against its own model
with the same checker the site runs (`eval/model-attr-codes.mjs`):

- 243 of 298 attribute rows offered a one-of list (the rest hold more than 50
  different values, mostly a Name or Tag per object). All 242 rows with no
  empty objects pass. The one with empties fails on exactly those 68 objects.
- Of Schultz's 12 class and system rows, the 2 that are fully coded pass and
  8 fail on exactly the uncoded objects the row warns about. The other 2 (a
  duct fitting and its type) have no code at all, so they offer nothing.

The values come from the checker's own reader, so the editor offers exactly
what a check will compare. Numeric attributes such as a door's
`OverallHeight` get a one-of list but not a range yet. That needs the facet
written with a numeric base, and it's next.

Everything runs in the browser. The model isn't uploaded. The write-up with
every number is
[`eval/model-attr-codes-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-attr-codes-2026-11-17.md).
