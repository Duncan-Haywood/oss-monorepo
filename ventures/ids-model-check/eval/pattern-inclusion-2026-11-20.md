# Pattern edits graded: XSD regex inclusion in the revision diff (2026-11-20)

The revision diff (`revision.mjs`, eval/revision-diff-2026-11-20.md) graded
lists and numeric ranges exactly but called every pattern edit "different",
because whether `D-[0-9]{2}` lets through fewer values than `D-[0-9]+` is a
question about regular languages, not text. A coordinator who receives the
revised IDS needs that answer, and the value to look for in the model.

## What changed

- `pattern-lang.mjs`: a value restriction that is a set of strings (patterns,
  enumerations, simple values and length facets in any mix, on a non-numeric
  base) becomes a list of automata that must all accept. Patterns are parsed
  with the XSD 1.0 grammar the checker already matches with (`xsdregex.mjs`,
  the elementpath reading IfcTester uses: `.` is not a line end, `\d` is
  `\p{Nd}`, `^` is a character, several `xs:pattern` facets are alternatives)
  into Thompson automata whose edges are code-point interval sets. `\p{..}`,
  `\w`, `\i`, `\c` are read off the JavaScript classes `xsdregex.mjs` already
  uses, once per class (about 0.1 s each). The universe is XML's `Char`.
- `languageWithin(L1, L2)`: a breadth-first search over the product of the
  subset constructions of L1's automata and L2's one at a time, on character
  classes cut at every interval boundary in play and grouped by which edges
  hold them. It returns the shortest string L1 accepts and L2 refuses, with
  letters and digits preferred, so the example reads like a value. Caps:
  20,000 automaton states (a deeply nested counted repeat gives up) and
  20,000 product states; past either, the old "different" stands.
- `revision.mjs`: `compareValuesDetail` tries the exact set comparisons
  first, then languages; a graded change carries `nowFails` / `nowPasses` and
  says them in its line: `value matching /D-[0-9]+/ to matching /D-[0-9]{3}/
  (e.g. "D-0" matched before, not now) [tighter]`. The page legend says how.
- `audit.mjs`: `value-never` when a restriction's list, pattern and length
  limits each allow something but never the same thing.

## Checked

`node eval/pattern-inclusion.mjs` (after `sh eval/fetch-audit-corpus.sh`):
the 139 readable IDS files of the audit corpus (65 public files and
buildingSMART's IDS-Audit-tool test files) hold 65 distinct patterns, 60 of
them XSD-valid.

| | |
|---|---|
| ordered pairs of distinct valid patterns | 3,540 |
| decided (not past a cap) | 3,540 |
| "not within", with an example value | 3,369 |
| examples the XSD matcher agrees with (matched by one side, refused by the other) | 3,369 |
| "within" verdicts | 171 |
| strings sampled from those verdicts' automata (200 random walks each plus 20 fixed strings) | 13,389 |
| samples the XSD matcher refuses on the side said to contain them | 0 |
| time for all pairs, both directions | 1.3 s; slowest pair 11 ms |

Unordered: 171 pairs nested, 1,599 neither, 0 equal (the corpus holds no two
spellings of one language). The examples are tested with `compileXsdRegex`,
the matcher the checker and the page use, and the samples come from the
automata, so a wrong automaton or a wrong search would show in one of the
two counts.

`pattern-lang.test.mjs` adds 400 random patterns over `a`, `b`, `c` with
`*`, `+`, `?`, `{m,n}`, classes, negation and `.`: for each pair, every
string of up to 5 characters is tried with the XSD matcher; when one is in
the second language and not the first, the engine says "not within" and its
example is no longer than that string; each example verifies. All pass.

Restrictions no value can pass: of 1,559 restrictions in the corpus, 845 are
exact string languages; none is empty. So the new `value-never` case fires
on no public file today: it is there for the authoring mistake (the list
`EI 30`, `EI 60` with the pattern `EI[0-9]+`), with tests.

Real revisions: `eval/revision-history.mjs` on the same 13 repositories as
eval/revision-diff-2026-11-20.md gives the same tally before and after
(233 changes; 116 tighter, 69 looser, 6 different, 42 metadata): none of the
69 committed revisions edits a pattern. The grading matters for revisions
not yet public (a client's stage-to-stage IDS pair), and the tool now
answers them.

## Not done

- Patterns on numeric bases stay "different" (the checker never matches a
  pattern against a number).
- Numeric bounds mixed with patterns stay "different".
- A pattern against a date range (IFCDATE with `minInclusive`) is not
  compared.
