---
title: "One public IDS specification failed 665,224 entities and took our CI runner down with it"
seo_title: "IDS checks in CI: one spec, 665,224 failures, out of memory"
date: 2026-11-17
description: "Running public IDS files in CI found an out-of-memory crash and a hang on truncated files. Both are fixed, and the runner is six times faster."
tags: [ids-model-check, bim, ifc, ids, ci]
---

The [IDS model check](/ids-model-check/) has a GitHub Action and a command-line
runner that check every IFC model in a repository against every IDS file on
each commit. This morning it handled four real exports against our two starter
IDS files in about 7.5 seconds. Then we pointed it at IDS files that other
people publish.

## Twice as fast, from parsing each model once

The runner parsed a model once for each IDS file it was checked against. A
40 MB export with 665,224 entities takes a few seconds to parse and index, and
the check itself is usually the cheap part. The runner now parses each model
once and each IDS file once, however many pairs they appear in. The same four
exports against the same two IDS files take 4.3 to 4.8 seconds instead of
8.2 to 8.7. The more IDS files you have, the bigger the gain. With 14 public
IDS files against the same four models (56 pairs), a run takes 7.5 to 8.0
seconds instead of 48.6 to 48.9, and peak memory drops from 1.55 GB to 0.85 GB.
The output is byte-for-byte the same.

## One specification, every entity

Next we ran the four models against 16 IDS files from public GitHub
repositories. Node ran out of its 2 GB heap after 40 to 50 seconds, in the
old runner and in the parse-once runner before a fix.

The cause was one specification in a rulebook-to-IDS research output. Its
applicability has no entity facet, only a property, so it applies to every
entity in the model. That means every entity, not just every wall: Cartesian
points, polylines and property values too. On the HHS office's MEP export that
is 665,224 entities, and each one failed with a reason like *has no property
set "Pset_BuildingCommon"*. The report kept every failure with its text, about
440 MB for that one specification, and the file has several like it.

We did not change what the check means. IDS allows a specification with no
entity facet. What changed is how much
of the result the runner keeps. Each specification now keeps its first 1,000
failing elements, and the count stays exact: the JUnit file still says
"665224 of 665224 element(s) fail". You can change the limit with
`--max-failures` on the command line or `max-failures` on the Action. The 64
pairs now finish in 45 seconds at a 1.5 GB peak.

## A file cut short ran forever

While writing a test for an unreadable IDS, the test itself hung. The XML
reader found the end of each tag, comment or CDATA block with `indexOf`, then
added the length of the closing marker. When the closing marker was missing,
`indexOf` returned -1 and the reader jumped back to the start of the file. It
read the file again, and again, until memory ran out. The STEP reader had the
same flaw: a file cut off in the middle of an enumeration such as
`.LENGTHUNIT.` sent its scan back to position 0.

The page and the editor use the same readers, so a truncated upload froze the
browser tab. In CI, a half-committed model would have hung the job until the
runner's timeout. Now both readers stop with "unterminated ... at character
N", and a broken file fails only its own model and IDS pairs. A test checks
that every one of the 3,876 truncated versions of our sample house finishes.

## What is next

- The browser page still keeps every failing element so that its CSV download
  can hold them all. Capping it needs a streamed download.
- The Action has run as GitHub's runner would run it, but not yet on GitHub's
  own runner or in a team's real repository of exports. If you keep IFC
  exports in a repository, [the README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check#on-every-commit-github-action-junit-and-annotations-2026-11-17)
  has the six-line workflow.

The measurements and commands are in `ventures/ids-model-check/eval/ci-scale-2026-11-17.md`.
The tool is MIT licensed and runs on your machine or runner. A check result
tells you whether the model matches the IDS as written. It does not sign off
the model.
