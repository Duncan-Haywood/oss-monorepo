# 1099-NEC Vendor CSV Checker

A free browser tool for small businesses and bookkeepers: **paste or drop your vendor
payments CSV and see who crosses the 1099-NEC threshold ($2,000 for payments after 2025,
$600 before) and every data fault that would draw an IRS notice, row by row, then download
the list of vendors who need a form.** Nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/1099-vendor-csv-checker/

After using this, you can now **find the vendors with no TIN (and the 24% backup withholding
that implies), the TIN that cannot be real, the address missing a state, the ZIP that lost
its leading zero, the vendor entered twice, and the card payments that go on a 1099-K
instead**, which used to mean opening every row before January 31.

## Input

A CSV with a header row. Recognised columns: name, TIN/EIN/SSN, address, city, state, ZIP,
amount; optional paid-by-card and entity type. Rows with the same TIN are added together.

## Output

Findings with row numbers, a per-vendor table, a vendors-needing-a-1099 CSV (full TINs) and a
findings CSV (masked). The IRS IRIS bulk layout is not implemented.

## Run

Open `index.html` through any static server. Tests: `node --test`.
