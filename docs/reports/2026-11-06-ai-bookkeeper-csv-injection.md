---
kind: analysis
subjects: [ai-bookkeeper]
date: 2026-11-06
tagged: auto
---
# ai-bookkeeper: tax CSVs now defuse formulas (2026-11-06)

Sibling of the shift-roster and league-schedule fixes. Six copies of `q` (taxforms, rental, projects, taxdepr, taxpack) quoted but did not defuse; replaced by `ventures/ai-bookkeeper/csvq.mjs`. taxpack's `csv()` leaves numeric strings bare. Engine's journal export keeps its own `safeText`. Not checked: other ventures' CSV writers (sales-agent engine `toCsv`, einvoice-preflight) were not read in full.
