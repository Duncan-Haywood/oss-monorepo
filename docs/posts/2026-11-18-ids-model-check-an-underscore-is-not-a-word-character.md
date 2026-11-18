---
title: "In an IDS pattern, an underscore is not a word character"
seo_title: "IDS patterns: \\w and \\s mean different things in IfcTester"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "XSD's \\w leaves out the underscore and its \\s leaves out the no-break space; IfcTester reads both the Python way. The IDS checker now asks which you meant."
---

An IDS file can require that a value match a pattern, for example that a
storey name start with two digits and a space: `-?\d{2}\s.*`. IDS says the
pattern is an XML Schema regular expression. Most people writing one know
some other regex dialect, and two of the most common escapes mean something
else in XML Schema.

**`\w`.** In XML Schema, `\w` is any character that is not punctuation, a
separator or a control character. That takes `+`, `€` and `°`, and it leaves
out the underscore, which Unicode files as "connector punctuation". So under
the standard, `W_01` fails `\w+` and `Wall+` passes it. IfcTester, the most
used open IDS checker, reads a bare `\w` as Python does: letters, digits and
underscore. It gives the opposite answer on both values.

**`\s`.** In XML Schema, `\s` is space, tab, line feed or carriage return. In
Python it is any Unicode space, including the no-break space that a value
pasted from Excel or Word often carries. Four of the 65 public IDS files we
collect write `-?\d{2}\s.*` for storey names: the Dutch RVB BIM Norm and the
NL-BIM Basis ILS, two copies of each. A storey called "01 Begane grond"
written with a no-break space passes in IfcTester and fails under the
standard.

Neither reading is a typo, so the checker cannot pick one for you. After an
audit, the page now asks. "As IfcTester reads it" rewrites `\w` as
`[\p{L}\p{Nd}_]` and `\s` as `[\s\p{Z}]`. "As the standard says" writes
`[^\p{P}\p{Z}\p{C}]` and `[\s]`. Every checker reads those explicit classes
the same way, so the file gets one verdict wherever it runs. The command line
does the same with `node cli.mjs --fix spec.ids --word-class letters|xsd`.

## How it was checked

We compared both spellings against elementpath, the library IfcTester uses,
on 1,500 random patterns that use a bare `\w`, `\W`, `\s` or `\S`, with 51
probe strings each. The probes cover every Unicode category where the
readings differ. Results:

- elementpath read both spellings exactly as this checker does on all 1,500.
- With the standard's spelling, IfcTester gave the standard's answer on every
  probe.
- IfcTester's spelling matched IfcTester's old answers on 1,330 patterns. The
  other 170 differed only on characters like `²` and `Ⅳ` (Python counts any
  numeral as a word character) and the form feed.
- buildingSMART's 16 test files that use `\w+` score right before and after
  either repair.

The method and every number are in
[`eval/word-class-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/word-class-2026-11-18.md).
Try it on your own IDS at
[marisstella.app/ids-model-check](https://marisstella.app/ids-model-check/):
drop the file and press *Audit the IDS only*. The audit runs in your browser;
nothing is uploaded.
