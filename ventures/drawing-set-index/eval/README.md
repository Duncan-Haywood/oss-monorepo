# How drawing-set-index was checked

The PDFs are public drawing sets and sheets from OpeningDesign's open
architecture project repositories on GitHub (`github.com/OpeningDesign/*`).
They are not stored here; `sh eval/fetch.sh data` fetches them (git, about
350 MB). `sets.tsv` names each whole set's repository, commit and path;
`sheet-files.tsv` names each single-sheet PDF's path (the local name's prefix
is the repository; `k` is Lake_Kegonsa_Home). The single sheets were taken at
each repository's HEAD on 2026-11-20 (Sports_Complex c0e96c1, Vacation_Rental
f6fc3c0, Lake_Kegonsa_Home 1123f01, New_2nd_Story 99ac473).

- `sheet-files.mjs`: 123 single-sheet PDFs whose file names carry the truth
  (Revit's `Project - Sheet - A-101 - First Floor.pdf` export name, or
  `A101 - FLOOR PLAN - 1ST FLOOR.pdf`). Result: `sheet-files-2026-11-20.txt`.
- `sets.mjs`: 14 whole sets (180 pages); file-name truth for the 25 sheets of
  the two sets that were also exported one sheet per file (`set-truth.tsv`),
  and on every page a check with poppler's `pdftotext` that the number and
  title reported are printed on that page. Result: `sets-2026-11-20.txt`.

Three of the eight single-sheet misses are the file name's error, not the
reader's (checked with `pdftotext` on each file): New_2nd_Story-5 and -6 are
named A200 but print `ELEVATION EAST - (A201)` and `ELEVATION NORTH - (A203)`;
Vacation_Rental-50 is named "HVAC 1st & 2nd Floor plan" but prints "HVAC 1st &
2nd Floor ceiling Plan". The other five are New_2nd_Story sheets whose title
cell also holds the project name ("2ND FLOOR ADDITION") with no rule between;
in a whole set that line is dropped as repeated text, on a lone sheet it is not.

Limits of this evidence: 9 projects from one office, mostly exported from
Revit; no AutoCAD or ArchiCAD office's set yet, no civil or MEP consultant's
title block, no set over 25 sheets.
