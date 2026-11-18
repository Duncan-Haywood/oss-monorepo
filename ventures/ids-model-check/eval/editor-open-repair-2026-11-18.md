# The editor repairs an IDS as it opens it (2026-11-18)

`fix.mjs` (eval/fix-structure-2026-11-18.md) repairs the `ids.xsd` faults
that have one right answer, and `xsdregex.mjs` rewrites `xs:pattern` values
written for another regex engine (eval/xsd-regex-2026-11-18.md). Until today
both were reachable only from the checker page (**Download repaired IDS**) and
the CLI (`--fix`). The editor opened a file as written, so:

- a facet the editor keeps as written (not editable on the page) was written
  back with its fault;
- a pattern such as `^\d{2}\.\d{3}$` was written back with its anchors, which
  XML Schema regex engines (IfcTester, xmlschema) read as the literal
  characters `^` and `$`, so a requirement the author meant as "two digits, a
  dot, three digits" fails every real value in those tools.

Now `repairOnOpen(text, parseIds)` in `editor.mjs` runs the repair first and
the editor opens the repaired text. The open message lists each change by
line (folded under "N faults repaired as it opened"), and says how many faults are left for the author; the audit
under the editor names those. A file with no fault opens byte for byte as
before. If the repaired text would not parse, the editor opens the original.

## Measured: `node eval/editor-open-repair.mjs`

Each file opened twice, as written and repaired first; each opening written
back with the editor's own writer (`importIds`, `stateToDoc`, `buildIds`) and
the written-back file checked with `structure.mjs` (IfcTester's `ids.xsd`
verdict on 3,080 of 3,080 files, eval/ids-structure-2026-11-18.md) and the
audit's xs:pattern findings. Full output: `eval/editor-open-repair.txt`.

| | 65 public IDS files | 80 IDS-Audit-tool files |
|---|---|---|
| break ids.xsd as published | 12 | 19 |
| repaired on open (fixes) | 14 (160) | 7 (57) |
| opened byte for byte | 51 | 73 |
| open at all, as written / repaired | 64 / 64 | 75 / 75 |
| written back breaking ids.xsd, as written / repaired | 5 / 4 | 7 / 6 |
| xs:pattern findings in the written-back files, as written / repaired | **9 / 0** | **51 / 1** |
| written back clean on both counts, as written / repaired | **55 / 60** | **65 / 68** |
| facets editable, as written / repaired | 1,871 / 1,871 | 2,430 / 2,430 |
| repaired files that ask what the original asked | 14 of 14 (4 differ only in a rewritten pattern) | 7 of 7 (3 only in a pattern) |

The editor's own writer already normalises most structure faults (it writes
1.0 names and order for every editable row), which is why the ids.xsd column
moves by one file in each set, both an attribute value ids.xsd refuses that
the repair has one answer for (SSoLDAC2024's usBIM accessibility file;
the IDS-Audit-tool's `canonical-0.9.7.ids`). The real gain
is patterns: every one of the 9 pattern findings the editor wrote into public
files is gone, and 50 of 51 in the audit-tool files (the one left,
`[Some`, is not a pattern any engine can read; the audit still names it).

"Asks what the original asked" compares the specifications `parseIds` reads
(every facet, cardinality, dataType and value, applicability as a set).
Where it differs it differs only in a pattern `fix.mjs` rewrote, checked by
comparing again with every pattern blanked: the change from `^2[ab]` to
`2[ab]` is the point, since in XSD every pattern is already anchored.
Write-back fidelity is unchanged: the editor writes back what the opened file
asks for 14 of 14 repaired public files and 6 of 7 audit-tool files both
ways (the seventh, Issue 14, has a specification with no `ifcVersion`, which
the editor writes with the schema it opened in, as before).

What is left in the 4 public files the editor still writes back invalid:
two RulebookProcessing exports whose `<author>` is "AI Assistant" (not an
e-mail address), a Molio example whose classification names no system, and
the file that writes `<n>` for `<name>` throughout (NEXT.md: repaired only if
a second file shows it). None has a single right answer.

## Reproduce

    sh eval/fetch-audit-corpus.sh
    node eval/editor-open-repair.mjs        # exits 1 if a repaired open asks for something else
    node --test editor-repair.test.mjs
