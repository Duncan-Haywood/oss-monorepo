# Example data

## LITHOGRA.txt

Line width (micrometres) measured at five sites (top, left, centre, right,
bottom) on three wafers from each of thirty cassettes in a semiconductor
lithography process: 450 measurements. The data file says it "was recieved from
Jack Prins of Sematech".

- Source: NIST/SEMATECH e-Handbook of Statistical Methods, case study 6.6.1,
  "Lithography Process": https://www.itl.nist.gov/div898/handbook/pmc/section6/pmc611.htm
- File: https://www.itl.nist.gov/div898/handbook/datasets/LITHOGRA.DAT,
  retrieved 2026-11-13, copied here byte for byte as `LITHOGRA.txt` (the
  `.txt` name lets the static host serve it as text).
- Licence: a work of the US National Institute of Standards and Technology,
  part of the US government, so not subject to copyright in the United States
  (17 U.S.C. 105). Credited on the page and in the README.

`example-data.mjs` holds the raw `LINEWIDT` column (column 4), one wafer a line
in file order; `engine.test.mjs` rebuilds it from this file and checks every
value. The "cleaned up" column 6 is not used, as the NIST case study also uses
the raw data.
