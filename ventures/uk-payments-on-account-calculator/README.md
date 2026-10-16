# UK Payments on Account Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-payments-on-account-calculator/>

Free, private browser tool: enter your Self Assessment bill (income tax plus Class 4 NIC) and what was deducted at source, and see the balancing payment, both advance instalments for next year, the cash to set aside, and what a reduction claim would defer.

After using this, you know what lands on 31 January and 31 July and why your first January bill is about 150% of a normal year's, which used to mean reading HMRC guidance and doing the arithmetic by hand.

Open `index.html`. Tests: `node --test 'ventures/uk-payments-on-account-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rules were written from memory and must be verified against the source each result names. Income tax and Class 4 NIC only. See `VENTURE.yaml`.
