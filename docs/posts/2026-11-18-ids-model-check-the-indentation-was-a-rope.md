---
title: "The indentation was a rope: skipping white space in the IDS checker's XML reader"
seo_title: "Skipping XML white space saves heap in an ifcXML reader"
date: 2026-11-18
tags: [bim, ifc, ifcxml, performance]
description: "The IDS checker's XML reader kept the white space between tags. Skipping it cut the reader's heap from up to 106 MB to 4 MB on a 455 MB ifcXML."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) reads IFC
models, in STEP or ifcXML, and checks them against buildingSMART IDS files.
Its XML reader is small and hand-written. Until today it kept every piece of
text it met, including the line break and indentation between two tags.

## Where the white space went

An ifcXML model is one `<uos>` element with an entity element for every
object, point and relationship in the building. The reader drops each entity
once it is read, so the tree never holds the whole file. But `<uos>` itself
stays open until the last line. Every line break between two entities was
appended to its text: one string piece per entity, a rope of millions of
pieces that nothing ever read, held until the file ended.

## The rule

The reader now skips a text run of only white space inside an element that
has already had a child element, and drops any white space it held before
that first child. In bytes mode it checks the bytes and never decodes the
run. Text in an element with no children is kept exactly, so
`<Name> </Name>` still holds one space. CDATA and `&#32;` are kept too.
Nothing in the checker reads the white space between elements: every reader
of an element's text either looks at leaf elements or only asks whether the
text has anything other than white space in it.

## What it measured

These are real exports from `opensourceBIM/IFC-files`, converted to ifcXML,
and each also re-indented the way exporters write it (two spaces per level).
The reader alone, with entities dropped as they close:

| file | before | after |
|---|---|---|
| HHS MEP, indented, 185 MB | 2.32 s, 53 MB of heap | 1.89 s, 2 MB |
| federated, indented, 455 MB | 6.36 s, 106 MB | 4.49 s, 4 MB |

The smallest heap that checks the indented federated model against 68 IDS
files fell from 512 MB to 448 MB. Before, indentation alone cost 32 MB of
the parse. Now an indented file parses in the same heap as the same model
written flat. All 68 reports hash the same before and after, on four models.

## Caveats

On a full 68-IDS check the parse is a small share of the time, so wall times
moved within noise. The heap kept after parsing did not change either. The
rope was garbage at the end of the file on main too; it cost the peak, not
the result. The large files are real STEP exports written as ifcXML, since
no public ifcXML file over 0.6 MB has turned up. Full measurements:
[`eval/xml-whitespace-2026-11-18.md`](../../ventures/ids-model-check/eval/xml-whitespace-2026-11-18.md).
