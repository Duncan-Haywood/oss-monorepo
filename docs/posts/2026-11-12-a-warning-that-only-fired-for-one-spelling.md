---
title: "A warning that only fired for one spelling"
seo_title: "Why a ^0.x semver warning missed ^0.2.3-beta, ^v0.2.3 and ^0.1"
date: 2026-11-12
tags: [redteam, semver-range-explainer, testing]
description: "24 seeded bugs in the new semver explainer: matching held against npm, but the English layer was untested and one warning missed four spellings of a range."
---

The [Semver Range Explainer](https://marisstella.app/semver-range-explainer/) went live today. You paste an npm range, and it shows what the range turns into, which of your versions match, and anything about the range worth a warning. Its matching code is checked against node-semver, the library npm itself uses, by a test that throws random ranges at both and compares the answers. This red-team run attacked it on the same day it shipped.

## What the seeded bugs found

The red-team tool changes one small thing in the source at a time (flips a `<` to `<=`, turns an `||` into `&&`, adds 1 to a constant), runs the test suite, and records whether any test noticed. Across 24 such changes, the tests caught 16 (67%).

None of the 8 that got through touched matching. Every one was in the layer that turns comparators into English:

- `<=2.0.0` could read "below 2.0.0" instead of "up to and including 2.0.0";
- for `<2.0.0 <1.5.0`, the text could name the looser bound (2.0.0) instead of the one that actually applies (1.5.0);
- `>=1.2.3 <2.0.0` could gain a stray "any version" at the front;
- the rewriting step shown for `1.2.3 - 2.3.4` could go blank.

The differential test can't see any of this, because node-semver has no English output to compare against. So these lines were simply never checked. Four new tests cover them now, and every one of the 8 changes is caught when it is applied again (8 of 8).

## The real defect

Reading the code as an attacker turned up one real defect. When a caret sits on a 0.x version, npm reads it far more narrowly than people expect: `^0.2.3` allows 0.2.x only, and `^0.0.3` allows nothing but 0.0.3. The tool has a warning for this, but the warning came from a regular expression run over the raw text, so it only fired for the plain spelling. npm reads all of these the same way, and none of them got the warning:

| Written | npm reads it as | Warned before |
|---|---|---|
| `^0.2.3` | `>=0.2.3 <0.3.0-0` | yes |
| `^ 0.2.3` | `>=0.2.3 <0.3.0-0` | no |
| `^v0.2.3` | `>=0.2.3 <0.3.0-0` | no |
| `^0.2.3-beta` | `>=0.2.3-beta <0.3.0-0` | no |
| `^0.1` | `>=0.1.0 <0.2.0-0` | no |

The fix stops reading the raw text. The warning now works from the rewriting steps the parser already records, so anything the parser treats as a 0.x caret gets the warning, however it was written. One test runs through every spelling above, plus `^0.0.3-beta`, which allows exactly 0.0.3 and its prereleases from beta on.

## One difference worth knowing

While probing, the tool agreed with node-semver 7.7.4 on all 75 hand-picked hostile ranges, both on which ones are valid and on how each of 31 versions matches them, with prereleases off and on. The one place they differ is the lowest-version figure. node-semver's `minVersion()` tries `0.0.0` before `0.0.0-0`, so with includePrerelease on it prints `0.0.0` for `*`. The explainer prints `0.0.0-0`, which really is the lowest match. The README now says so, so nobody mistakes the difference for a bug.

The lesson for the next tool built on an oracle test: the oracle covers only what the oracle can answer. The words, warnings and steps a person actually reads need tests of their own.
