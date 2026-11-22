# ids-model-check: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) (audit 2026-11-16: 26 of 27 invalid-* files INVALID, 0 of 307 valid; Pset_/Qto_ template audit 2026-11-16: 5 of 5 IDS-Audit-tool pset files, faults in 21 of 64 public IDS, eval/audit-corpus.mjs); ids.xsd repair 2026-11-18 (eval/fix-structure-2026-11-18.md: one-answer faults fixed in the file's own text, 6 of 12 failing public IDS then valid; IDS 0.9 name/datatype/bare text read as written)
- (moved 2026-11-19) ifcXML streams 2026-11-18 (eval/lazy-ifcxml-2026-11-18.md: 374 MB federated ifcXML 4.0 to 1.5 GB peak, fits 1 GB; strings keep whitespace, 731 MEP labels)
- (moved 2026-11-19) nested IFC4 ifcXML at scale 2026-11-18 (eval/ifc4-layout-scale-2026-11-18.md: 4 real IFC4/IFC4X3 exports nested, 857,301 entities and 2,160 of 2,160 verdicts as STEP; schema from the root, not ARCHICAD's 'IFC2x3 add-on'; nested geometry stubbed, 166 MB 1,770 to 1,481 MB, fits 768 MB)
- (moved 2026-11-19) nested ifcXML read as it closes 2026-11-18 (eval/nested-early-2026-11-18.md: same numbers and notes on 57 files; smallest heap 160 to 96 MB on C20, federated unchanged at 704 MB)
- (moved 2026-11-19) Sets for one predefined type 2026-11-19 (eval/predefined-sets-2026-11-19.md: 186 IFC4, 343 IFC4X3 sets; audit warns pset-predefined, editor fills the type; 1,008 of 1,008 offers agree)
- (moved 2026-11-19) Template types 2026-11-19 (eval/template-types-2026-11-19.md: occurrence sets on types, performance sets off IfcPerformanceHistory warned, 1,280 of 1,280 editor pairs agree)
- (moved 2026-11-19) IDS as a spreadsheet 2026-11-19 (eval/sheet-roundtrip-2026-11-19.md: .xlsx/CSV both ways; 334 of 334 test IDS, 62 of 64 public same back)
- (moved 2026-11-19) Excel-saved workbooks 2026-11-19 (eval/excel-workbooks-2026-11-19.md: 65,537 of 65,548 cells agree with openpyxl)
- (moved 2026-11-19) Excel2IDS template workbooks both ways 2026-11-19 (excel2ids.mjs, eval/excel2ids-2026-11-19.md: 309 of 309 public specs that fit come back the same; partOf, unnamed material, ranges do not fit)
- (moved 2026-11-19) Excel2IDS tool differences cell by cell 2026-11-19 (eval/excel2ids-tool-2026-11-19.md: page and CLI list where the .exe writes another IDS or stops; download fills purpose General, tool stops 316 to 0 of 351; sample's External doors asks True)
- (moved 2026-11-20) Tool run side by side 2026-11-19 (eval/excel2ids-sidebyside-2026-11-19.md: 321 workbooks, 0 stops; added version None, _x000D_; applicability in ids.xsd order)
- (moved 2026-11-20) bSDD links 2026-11-19 (bsdd.mjs, cli --audit --bsdd, eval/bsdd-links-2026-11-19.md: 58 public IDS, 197 bSDD links; 7 files with an error, 15 a warning, all read by hand)
- (moved 2026-11-20) IDS from a bSDD class 2026-11-19 (--from-bsdd, bsdd-spec.mjs, eval/bsdd-spec-2026-11-19.md: 185 classes in 42 dictionaries, 38 of 42 audit clean, 42 of 42 bSDD-check clean; editor keeps uris, 0 to 344 of 344)
- (2026-11-20) Pattern inclusion in the revision diff (pattern-lang.mjs, eval/pattern-inclusion-2026-11-20.md: XSD regex languages compared exactly with the shortest example value; 3,540 of 3,540 public pattern pairs decided in 1.3 s, 3,369 of 3,369 examples verified, 0 of 13,389 probes break a "within"; audit value-never when list, pattern and lengths never agree)
- (2026-11-20) Date, time and duration ranges in the revision diff (pattern-lang.mjs dateRangePatterns, eval/date-range-revisions-2026-11-20.md: plain-date ranges read as exact languages, 574 of 574 strings agree with ids.mjs; 132 of 236 public same-form pairs graded instead of "different", 94 of 94 examples verified; checker no longer passes days the month lacks, 334 of 334 test pairs kept)
- (2026-11-20) "Write as a pattern" exact (temporal.mjs dayPattern/dateRangePattern, eval/date-pattern-exact-2026-11-20.md: only days that exist, ASCII digits, zones by instant; 31 doors x 10 ranges: old shape 50 of 310 verdicts unlike the range, new 0; IfcTester 0.9.0 same failing doors 10 of 10; the revision diff reads date ranges through the same pattern)
- (moved 2026-11-20) bSDD units to measure types 2026-11-19 (bsdd-units.mjs, eval/bsdd-units-2026-11-19.md: 867 of 1,625 non-IFC Reals get a measure, values in SI; IfcTester agrees 9 of 9; dB as pressure/power level 2026-11-19, eval/bsdd-db-2026-11-19.md, 6 of 6; count on a bSDD cache)
- (moved 2026-11-21) date ranges graded 2026-11-20 (eval/date-range-revisions-2026-11-20.md: 132 of 236 public pairs, 94 of 94 examples; days the month lacks fail)
- (moved 2026-11-21) time ranges as patterns 2026-11-21 (timePattern, 24:00:00 = 00:00:00, eval/time-pattern-2026-11-21.md: 0 of 300 verdicts unlike the range, IfcTester 10 of 10)
- (moved 2026-11-21) Readable document 2026-11-20 (eval/spec-doc-2026-11-20.md)
- (moved 2026-11-21) dateTime ranges as patterns 2026-11-21 (dateTimePattern, eval/datetime-pattern-2026-11-21.md: 0 of 290 beam verdicts unlike the range, IfcTester 10 of 10; full fraction 2026-11-21)
- (moved 2026-11-21) editor's Write as a pattern exact 2026-11-20 (eval/date-pattern-exact-2026-11-20.md: 0 of 310 verdicts unlike the range, old 50)
- (moved 2026-11-21) systems 2026-11-21 (eval/ifcx-systems-*: 9/9 members, 15/15 port pairs)
- (moved 2026-11-21) IDS revision diff 2026-11-20 (revision.mjs, revision.html, cli --diff; eval/revision-diff-2026-11-20.md: 69 public revisions, 0 errors, 185 of 233 changes graded asks more/less, model impact by GlobalId), pattern inclusion 2026-11-20 (pattern-lang.mjs, eval/pattern-inclusion-2026-11-20.md: 3,540 of 3,540 public pairs, examples verified)
- (moved 2026-11-22) ifcXML/ifcJSON/IFC5 to STEP 2026-11-22 (step-writer.mjs, cli --to-step; fill takes all; eval/to-step-2026-11-22.md)
