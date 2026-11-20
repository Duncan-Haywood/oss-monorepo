---
title: "The client sent a new IDS. What does it ask for now?"
date: 2026-11-20
tags: [ids-model-check, ventures, bim]
description: "Drop two versions of a buildingSMART IDS file and see which requirements were added, dropped, tightened or loosened, and which model elements newly fail."
---

An IDS file is how a client tells a design team what a building model has to
contain: which elements need which properties, codes and materials. Clients
revise them. The next project stage brings a new one, or a national standard
releases a version 2. The coordinator then has two XML files and a model, and
one question: what do I have to do now that I didn't before?

A text diff is no help. Re-indenting a file, turning a single value into a
one-item list, or moving specifications around all show up as changes, while
the change that matters (a property that was optional and is now required)
is one attribute in one line.

[IDS Model Check](https://marisstella.app/ids-model-check/revision.html) now
has a page for this question. Drop the old and the new IDS. Each specification
comes back as added, removed or changed, and each change is marked as asking
more of the model, asking less, or just different:

- **asks more**: a new required property, optional to required, a shorter list
  of allowed values, a narrower range, a data type added, or more classes
  selected;
- **asks less**: the reverse;
- **different**: neither contains the other, such as a new pattern or a
  different class;
- **metadata**: names, descriptions and IFC versions only.

Add the model and both versions are run against it. You get the elements that
newly fail, the ones that were already failing and now have more to fix, and
the ones that pass now. Elements are matched by GlobalId, the ID that stays
with an element from one export to the next. Nothing is uploaded. On the
command line it's `node cli.mjs --diff old.ids new.ids model.ifc`, which exits
1 when the revision asks for more, so a CI job can flag it.

## Tried on real revisions

I ran it on every committed version of every public IDS file in 13 GitHub
repositories: 69 revisions of 27 files, with no file it couldn't compare. Of
the 233 changes it found, 185 got a firm "more" or "less". Six were
"different", and 42 were metadata. A third of the revisions (23 of 69) changed
nothing a checker reads.

Some of what came up:

- **The Dutch BIM basis set, version 1 to version 2.** Every specification was
  renamed, so pairing by name found nothing. Pairing by section number
  (`(3.3)` against `3.3`) matched all 12. Ten went from optional to required.
  The fire rating went from exactly "30" to any of 30, 60, 90 or 120.
- **A government buyer's Stage 4 and Stage 5 asset IDS.** Stage 5 adds six
  required properties: serial number, barcode, tag, asset ID, installation
  date and warranty start date. Four of them use a pattern syntax (`(?:`)
  that the IDS standard doesn't allow, so as published the Stage 5
  specification is invalid and validating checkers won't run it. The first
  version of the diff counted those unchecked elements as "fixed". It now
  says one side is invalid and compares nothing. After repairing both files
  with the checker's repair button, all 340 matching elements in a public
  Revit house model were already failing, and each picks up the six new
  requirements.
- **A Dutch government building standard, a one-day revision.** Every
  specification looked changed. The cause is that the old file wrote `<n>`
  where IDS needs `<name>`, so a checker reads each facet as "any class". The
  report now says when a file breaks the IDS schema, so you know why a
  comparison looks odd.

## What it doesn't do

It doesn't compare patterns as regular expressions: tightening `D-.*` to
`D-[0-9]{3}` shows as "different", not "asks more". It can't pair a
specification that was both renumbered and reworded. And if an export
regenerates GlobalIds, every failure looks new.

How it was measured: `ventures/ids-model-check/eval/revision-diff-2026-11-20.md`
in the repository. The tool is free and MIT licensed. Results describe how
two files differ as this software reads them. That isn't professional advice,
and the client's own documents decide what's owed.
