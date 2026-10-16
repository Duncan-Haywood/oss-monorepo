# Australia GST Registration Checker

Free, private browser tool: enter your sales for the last 12 months (and optionally the next 11) and see whether GST turnover has reached the AUD 75,000 registration line (AUD 150,000 for non-profits), whether projected turnover will, and the 21-day deadline. Taxi, limousine and ride-share drivers are flagged as needing to register from the first fare.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/au-gst-registration-checker/

After using this, you know whether and by when you must register for GST with the ATO, which used to mean reading the ATO guidance and totalling 12 rolling months by hand.

Open `index.html`. Tests: `node --test 'ventures/au-gst-registration-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.
