---
title: "A ^ in an IDS pattern matches nothing in IfcTester, and our checker said it matched"
seo_title: "IDS xs:pattern: why ^ and $ match nothing in IfcTester"
date: 2026-11-18
tags: [ids-model-check, ventures, bim]
description: "IDS patterns are XML Schema regexes, where ^ is a plain character. Four public IDS files and our own checker read them as JavaScript. Now fixed and checked."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a
building model (IFC) against an IDS file, buildingSMART's format for
information requirements. A requirement like "every system's class name
matches `IFC.*SYSTEM`" is written as an `<xs:pattern>`.

The IDS standard says that pattern is an XML Schema regular expression.
That is not the regex dialect most people know. In XML Schema a pattern
always has to match the whole value, so it has no anchors: `^` and `$` are
ordinary characters. A pattern written `^IFC.*SYSTEM` asks for a class name
that starts with a caret. No class name does, so the pattern matches nothing.

IfcTester, the reference open-source IDS checker, reads patterns the XML
Schema way. Our checker gave the text to JavaScript's `RegExp`, which reads
`^` as an anchor. So for the same file, ours said a pipe system matched and
IfcTester said it did not. Neither tool said why.

## How common it is

We pulled every pattern out of the 65 IDS files we could find in public
GitHub repositories, plus buildingSMART's IDS-Audit-tool test files and its
official test cases: 78 distinct patterns. 37 of the 65 public files use
patterns at all. Four have a pattern that different tools read differently:

- two BIM2SIM files with `^2[ab]`;
- a digital-twin ontology project with `^did:web:...$`;
- a UK Department for Education requirements file with a date pattern written
  with `(?:...)` groups. Those are not XML Schema at all, and IfcTester stops
  with an error instead of checking the file.

One of the IDS-Audit-tool's issue files uses `^IFC.*SYSTEM` 47 times.

## What changed

The checker now parses patterns with the XML Schema grammar and matches with
its meaning. That covers more than anchors: `\d` is any Unicode digit,
`[a-z-[aeiou]]` subtracts one set from another, and `\p{IsGreek}` names a
Unicode block. The IDS audit also tells you when a pattern will mean
something different in another tool:

- **error**: not an XML Schema regex (`(?:`, a lazy `*?`, `{,3}`). The
  specification is reported INVALID, as IfcTester treats it.
- **warning**: `^` or `$`; needless escapes like `\/`; a bare `\w`.

The "Download repaired IDS" button now rewrites these patterns too. It
changes `(?:` to `(`, drops the anchors and turns `{,3}` into `{0,3}`, and
leaves the rest of your file as you wrote it.

## How we checked it

IfcTester gets its reading from a Python library, elementpath, so we compared
against elementpath directly. We tested valid-or-not, and for valid patterns
the full-match answer on 30 or more test strings each. Results:

- 78 of 78 corpus patterns get the same verdict, and 77 of 78 the same answer
  on every string.
- The 10 repairs read in XML Schema the way the originals read in JavaScript.
- 9,000 random patterns over three seeds disagree in only two places, both
  of them places where elementpath departs from the XML Schema text.

The more interesting of those two: a bare `\w` in XML Schema means "anything
but punctuation, separators and control characters", which takes `+` and
`°`. elementpath reads it as Python's narrower `\w`. So `\w+` accepts
`Wall+` by the standard and rejects it in IfcTester. The audit now warns on
a bare `\w` and suggests `[\p{L}\p{Nd}_]` or `[^\p{P}\p{Z}\p{C}]`, which
every tool reads the same way. buildingSMART's own test suite still passes
334 of 334.

The full numbers are in the venture's
[evaluation notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/xsd-regex-2026-11-18.md).
