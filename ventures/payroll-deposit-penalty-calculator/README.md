# Payroll Deposit Penalty Calculator

Estimate the IRS failure-to-deposit penalty (2% / 5% / 10% / 15% tiers, IRC 6656) and interest on late
payroll tax deposits, how many days remain before each unpaid deposit steps up a tier, what 30 more days of
waiting costs, and the trust-fund portion that could become personal liability (IRC 6672).

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no network calls.
[`trust-fund-recovery-penalty-explained.html`](trust-fund-recovery-penalty-explained.html) explains the
trust-fund split. The interest rate and trust-fund share are the visitor's own inputs; this is an estimator,
not tax advice.

```
node cli.mjs --example
node cli.mjs --file deposits.json
```

Tests: `node --test penalty.test.mjs page.test.mjs`. MIT licence.
