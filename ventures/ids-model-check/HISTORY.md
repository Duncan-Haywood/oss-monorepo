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
