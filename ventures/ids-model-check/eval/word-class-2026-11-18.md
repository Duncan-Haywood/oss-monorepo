# A bare `\w` or `\s`, spelled so every checker agrees (2026-11-18)

IDS patterns are XML Schema regular expressions (XSD Part 2, Appendix F).
IfcTester reads them through elementpath's `translate_pattern`, which keeps a
bare `\w` or `\s` (one outside `[...]`) as Python's own escape. Inside `[...]`
it uses the XSD set. So the same pattern gets two readings:

| character | `\w` IfcTester | `\w` XSD | `\s` IfcTester | `\s` XSD |
|---|---|---|---|---|
| `a`, `٣`, `Ω`, `中` | yes | yes | no | no |
| `_` (connector punctuation, Pc) | yes | **no** | no | no |
| `+`, `€`, `°`, `^` (symbols) | no | yes | no | no |
| `²`, `Ⅳ` (other numerals) | yes | yes | no | no |
| a combining acute, a Devanagari vowel sign (marks) | no | yes | no | no |
| space, tab, line feed | no | no | yes | yes |
| no-break space U+00A0, em space U+2003 | no | no | **yes** | **no** |
| form feed | no | no | yes | no |

(`eval/word-class.txt`, the character table, from elementpath 5.1.4 as
IfcTester 0.9.0 calls it, and this checker's XSD reading.)

The earlier pattern work (`eval/xsd-regex-2026-11-18.md`) found the `\w`
half. It is narrower than "IfcTester takes less": XSD's `\w` leaves out the
underscore, so under the standard `W_01` fails `\w+`, and IfcTester passes it.
The `\s` half is new. Its probe strings had no no-break space, so it never
showed. A no-break space is what a value pasted from Excel or Word often
carries, and 4 of the 65 public IDS files write a bare `\s`: `-?\d{2}\s.*`
(a storey name like "01 Begane grond") in the RVB BIM Norm v1.1 and NL-BIM
Basis ILS v2 sets, two copies of each in OpenAEC repositories. A storey named
"01" plus a no-break space plus "Begane grond" passes that requirement in
IfcTester and fails it in this checker, which follows the standard.

Neither reading is a typo, so this is not a one-answer repair. The author has
to choose.

## What changed

- `xsdregex.mjs` `spellWordClass(p, reading)` rewrites each bare `\w`, `\W`,
  `\s` and `\S` as a class that elementpath, this checker and any XSD
  validator all read the same way:

  | reading | `\w` | `\W` | `\s` | `\S` |
  |---|---|---|---|---|
  | `xsd` (the standard, kept exactly) | `[^\p{P}\p{Z}\p{C}]` | `[\p{P}\p{Z}\p{C}]` | `[\s]` | `[^\s]` |
  | `letters` (close to IfcTester's) | `[\p{L}\p{Nd}_]` | `[^\p{L}\p{Nd}_]` | `[\s\p{Z}]` | `[^\s\p{Z}]` |

  A `\w` inside `[...]`, an escaped backslash and a subtraction class are left
  alone.
- The audit warns on a bare `\s` (`pattern-space-class`, new) as it already
  did on a bare `\w` (`pattern-word-class`, whose text now says that XSD's
  `\w` leaves out `_`). Both name the two spellings.
- `fix.mjs` `fixStructure(text, { wordClass: "xsd" | "letters" })` writes the
  chosen spelling. With no choice it leaves the pattern alone, so the editor's
  repair-on-open and the default download change nothing they did not change
  before.
- On the page, after an audit with either warning, the repair box asks: leave
  as written, IfcTester's reading, or the standard's. The download carries the
  choice. A counter records which one was picked (`ids_word_class_xsd` or
  `ids_word_class_letters`, local only).
- `cli.mjs --fix spec.ids --word-class xsd|letters`.

## Checked

`PY=$(python3 ../../platform/ci/pyenv.py elementpath) node eval/word-class.mjs`
(after `eval/fetch-audit-corpus.sh` and `eval/fetch-testcases.sh`). Output for
seed 20261118: `eval/word-class.txt`.

| set | patterns | both spellings parse in elementpath | elementpath reads each spelling as this checker does | `xsd` spelling in IfcTester = original under the standard | `letters` spelling = IfcTester's reading of the original |
|---|---|---|---|---|---|
| corpus (`\w+` in 16 buildingSMART files, `-?\d{2}\s.*` in 4 public ones) | 2 | 2 | 2 and 2 | 2 | 1 |
| random patterns with a bare `\w`, `\W`, `\s` or `\S` | 1,500 | 1,500 | 1,500 and 1,500 | 1,500 | 1,330 |

Each pattern was compared on 51 probe strings (76,500 for the random set).
The probes are random strings over every Unicode category in the table above,
plus fixed ones (`Wall+`, `90°`, `W-01`, `x²`).

- With the `xsd` spelling, IfcTester gives the standard's answer on every
  probe of every pattern. The file's meaning in this checker does not change.
- In 296 of the 1,500 random patterns, IfcTester's reading of the original
  differs from the standard on at least one probe. Both spellings remove that
  gap: elementpath and this checker agree on 1,500 of 1,500 for each.
- The `letters` spelling matches IfcTester's reading of the original exactly
  on 1,330. The other 170 part on 292 probe strings, all of them ones with
  `²`, `Ⅳ` (Python's `\w` takes every numeral) or a form feed (Python's `\s`
  takes it), which the character table shows. So `letters` is "close to
  IfcTester", not equal to it, and the page says so.
- buildingSMART's 16 test pairs that write `\w+` score right as written, and
  again after repair with each choice (16, 16, 16). The full suite stays 334
  of 334 (`node eval/run-testcases.mjs`; the venture's tests run it).

## ifcXML all-space strings

The ifcXML reader also read a string element holding only white space
(`<Name>  </Name>`) as `""`. STEP keeps `IFCLABEL('  ')` as two spaces, and
`xs:string` keeps white space, so `ifcxml.mjs` `attrValue` now keeps it too
(an attribute written `Name="  "` already did). `<Name></Name>` is still `""`.
No real export in the corpora shows the case (`eval/xml-whitespace-2026-11-18.md`,
"Not done"). The change makes the two formats agree when one does.

## Not done

- elementpath's third departure from the XSD text, a range built from a
  multi-character escape (`[\d-z]`), is not XSD at all. The audit already
  reports it as an error.
- No author has been asked which reading they meant. The 4 public files with
  `\s` are Dutch national requirement sets. Their storey names come from
  modelling tools, and those rarely write a no-break space, so the gap is real
  but probably rare in practice.
