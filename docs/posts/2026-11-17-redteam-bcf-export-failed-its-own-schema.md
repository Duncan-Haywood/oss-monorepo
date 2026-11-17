---
title: "Every BCF issue we exported failed the BCF schema"
seo_title: "BCF 2.1 export validation: empty IfcProject and control characters"
date: 2026-11-17
tags: [redteam, ids-model-check, bcf, bim, testing]
description: "A red-team run checked IDS Model Check's BCF export against buildingSMART's BCF 2.1 schemas. Every markup file failed, over one empty attribute."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks an IFC building model against an IDS
file and hands the failures back as a BCF 2.1 issue list, so a coordinator can open each one in their
BIM tool on the element that failed. Today's red-team run aimed at three of its smaller files: the zip
reader (`zip.mjs`), the XML reader (`xml.mjs`) and the BCF writer (`bcf.mjs`).

## The schema check nobody had run

The existing test opened the BCF zip and counted the files in it. It never asked whether a BCF reader
would accept them. So the run fetched buildingSMART's own BCF 2.1 schemas and validated a sample export
with `xmllint`:

- the `bcf.version`, `project.bcfp` and viewpoint files passed;
- **every `markup.bcf` failed**, with the same error each time.

The writer put `<File IfcProject="" isExternal="true">` in each topic's header. The schema types
`IfcProject` as an IFC GUID, exactly 22 characters, so an empty value is invalid. The attribute is
optional and the report doesn't carry the project's GUID, so the fix leaves it out. All nine files of
the sample export now validate.

How much this hurt users depends on the tool: lenient readers skip the attribute, strict ones that
validate on import refuse the topic. Either way, an export that fails the format's own schema is a bug.

## A bell in a wall name

The second defect came from reading the writer as an attacker. IFC files are STEP text, and STEP can
encode any byte: `\X\07` is a bell character. The reader decodes it faithfully, and the BCF writer
escaped `&`, `<`, `>` and `"` but passed control characters straight through. XML 1.0 cannot hold
U+0007 at all, not even as `&#7;`, so one odd element name made its whole markup file unreadable. The
same happened when a 250-character title was cut through the middle of an emoji. The writer now drops
the characters XML 1.0 forbids and keeps tabs and newlines.

## How well the tests guard it

The run seeded 24 small faults across the three files. The tests caught 17. Of the 7 that got through,
3 can't change anything a user sees (a bounds check that is never reached, for example), and 4 were
real gaps:

- a processing instruction inside an element could leak `?>` into that element's text;
- a failed specification with no failing element and no note could export an empty description;
- the two fallback ways of making topic IDs, used when a page has no `crypto.randomUUID` (a page served
  over plain http, say), could get a byte wrong without any test noticing.

Each now has a test that fails with the fault and passes without it, so the catch rate went from 81% to
100% of the faults that matter.

## What stays

`eval/fetch-bcf-schemas.sh` fetches the schemas (they are CC BY-ND, so they are fetched rather than
committed), and a test validates every file of a sample export against them whenever they are present.
Two smaller tests run everywhere: no `IfcProject` attribute that isn't a 22-character GUID, and no
character XML 1.0 forbids. CI doesn't fetch the schemas yet; wiring that in is a workflow change, which
needs its own pull request.
