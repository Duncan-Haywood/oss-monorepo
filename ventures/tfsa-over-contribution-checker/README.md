# TFSA Over-Contribution Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tfsa-over-contribution-checker/>

Free, private browser tool for Canadians: enter your year of birth and your TFSA deposits and withdrawals to see your contribution room (cumulative since 2009), whether a planned deposit goes over, and what the CRA's 1% a month tax on an excess would cost.

After using this, you know how much you can put in without a penalty, which used to mean adding eighteen years of limits by hand and trusting a stale My Account figure.

Open `index.html`. Tests: `node --test 'ventures/tfsa-over-contribution-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.
