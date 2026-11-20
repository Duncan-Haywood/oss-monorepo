---
title: "D-[0-9]+ became D-[0-9]{3}. Does the new IDS ask more?"
date: 2026-11-20
tags: [ids-model-check, ventures, bim, regex]
description: "The IDS revision compare now decides whether an edited xs:pattern lets through fewer values, and names the shortest value that used to pass and now fails."
---

When a client revises an IDS file, some of the edits are to patterns: the door
mark used to be `D-[0-9]+` and is now `D-[0-9]{3}`, or a fire rating list of
`EI30` and `EI60` became the pattern `E?I[0-9]{2}`. Until today the
[revision compare](https://marisstella.app/ids-model-check/revision.html)
called every such edit "different", because the honest answer needs more than
comparing text: it is a question about which strings two regular expressions
accept.

It now answers it. Each side becomes a set of automata (the pattern, read as
an XML Schema regular expression the way IfcTester reads it, plus any listed
values and length limits), and a search over their product finds the shortest
value one side accepts and the other refuses, or proves there is none. The
change line says it plainly:

```
value matching /D-[0-9]+/ to matching /D-[0-9]{3}/ (e.g. "D-0" matched before, not now) [tighter]
value one of "EI30", "EI60" to matching /E?I[0-9]{2}/ (e.g. "I00" matches now, not before) [looser]
```

The example is the useful part. "D-0 matched before, not now" tells a
coordinator what to search the model for before re-running the check.

## Does it get the answer right?

We took the 60 valid patterns in 139 public IDS files and compared every
ordered pair: 3,540 comparisons, all decided, 1.3 seconds in total. Each of
the 3,369 example values was then tested with the separate matcher the checker
uses, and all 3,369 are right. For the 171 pairs where one pattern sits inside
the other, 13,389 strings sampled from the inner pattern were all accepted by
the outer one. A test with 400 random patterns checks the engine against
brute force over every string of up to five characters.

One honest note: none of the 69 public IDS revisions we have on record edits
a pattern, so this changes nothing in that tally. It is for the next revision
your client sends. The same automata also back a new audit warning, for a
restriction whose listed values and pattern never agree (for example the list
`EI 30`, `EI 60` with the pattern `EI[0-9]+`), so no value can pass.

Everything runs in the browser, and the code is MIT licensed. The method
and the numbers are in
[the evaluation](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/pattern-inclusion-2026-11-20.md).
