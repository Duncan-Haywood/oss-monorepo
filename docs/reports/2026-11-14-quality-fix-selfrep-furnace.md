---
kind: note
subjects: [selfrep-recyclers]
date: 2026-11-14
tagged: auto
---
# Quality fix 2026-11-14: selfrep-recyclers furnace credit

- Fixed defect 0 (high) of `portfolio/quality/audits/2026-11-08-selfrep-recyclers.json`; the fix PR is recorded in `fix_prs`.
- `selfrep_recyclers.machines.furnace_saving_kg` is the physically supported aluminium saving: remelt can replace only castable bar stock (`CASTABLE_AL`). `selfrep_materials.balance` still books remelt against sheet as well; any new project that reads an aluminium saving should call `furnace_saving_kg`, not the balance's difference.
- Medium defect 1 of the same audit (cutting-yield mutation survives) is also closed by the new hand-pinned tests. Defects 2 to 4 (invented part lists, extruder BOM gaps, dead `variant_scale`) are still open.
- A later round should re-audit selfrep-recyclers in a new file; the 2026-11-08 scores stay as they were.
