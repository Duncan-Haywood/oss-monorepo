# Canada GST/HST Small Supplier Checker

Free, private browser tool: enter your taxable sales for your last eight calendar quarters and see whether you passed the CAD 30,000 small-supplier line in a single quarter or across four, the date you must start charging GST/HST, and your 29-day registration deadline. Taxi and ride-share operators are flagged as registrants from day one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ca-gst-hst-small-supplier-checker/

After using this, you know whether and when you must register with the CRA, which used to mean reading the CRA guide and counting quarters by hand.

Open `index.html`. Tests: `node --test 'ventures/ca-gst-hst-small-supplier-checker/**/*.test.mjs'`.

Also includes a Quick Method vs regular accounting comparison (GST-only, Ontario and 15% HST regions).

**No warranty.** Free and as-is; not tax advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.
