# New Zealand GST Registration Checker

Free, private browser tool: enter your sales for the last 12 months (and optionally the next 11) and see whether taxable turnover has passed the NZD 60,000 registration line, whether expected turnover will, and a 21-day registration deadline. Taxi and ride-share drivers are flagged as needing to be registered from the first fare.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nz-gst-registration-checker/

After using this, you know whether and by when you must register for GST with Inland Revenue, which used to mean reading the IRD guidance and totalling 12 rolling months by hand.

Open `index.html`. Tests: `node --test 'ventures/nz-gst-registration-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.
