# ids-model-check: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) (audit 2026-11-16: 26 of 27 invalid-* files INVALID, 0 of 307 valid; Pset_/Qto_ template audit 2026-11-16: 5 of 5 IDS-Audit-tool pset files, faults in 21 of 64 public IDS, eval/audit-corpus.mjs); ids.xsd repair 2026-11-18 (eval/fix-structure-2026-11-18.md: one-answer faults fixed in the file's own text, 6 of 12 failing public IDS then valid; IDS 0.9 name/datatype/bare text read as written)
- (moved 2026-11-19) ifcXML streams 2026-11-18 (eval/lazy-ifcxml-2026-11-18.md: 374 MB federated ifcXML 4.0 to 1.5 GB peak, fits 1 GB; strings keep whitespace, 731 MEP labels)
- (moved 2026-11-19) nested IFC4 ifcXML at scale 2026-11-18 (eval/ifc4-layout-scale-2026-11-18.md: 4 real IFC4/IFC4X3 exports nested, 857,301 entities and 2,160 of 2,160 verdicts as STEP; schema from the root, not ARCHICAD's 'IFC2x3 add-on'; nested geometry stubbed, 166 MB 1,770 to 1,481 MB, fits 768 MB)
- (moved 2026-11-19) nested ifcXML read as it closes 2026-11-18 (eval/nested-early-2026-11-18.md: same numbers and notes on 57 files; smallest heap 160 to 96 MB on C20, federated unchanged at 704 MB)
