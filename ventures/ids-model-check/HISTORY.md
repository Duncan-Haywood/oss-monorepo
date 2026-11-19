# ids-model-check: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) (audit 2026-11-16: 26 of 27 invalid-* files INVALID, 0 of 307 valid; Pset_/Qto_ template audit 2026-11-16: 5 of 5 IDS-Audit-tool pset files, faults in 21 of 64 public IDS, eval/audit-corpus.mjs); ids.xsd repair 2026-11-18 (eval/fix-structure-2026-11-18.md: one-answer faults fixed in the file's own text, 6 of 12 failing public IDS then valid; IDS 0.9 name/datatype/bare text read as written)
