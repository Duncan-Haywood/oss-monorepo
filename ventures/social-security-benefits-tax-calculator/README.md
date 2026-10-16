# Social Security Benefits Tax Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/social-security-benefits-tax-calculator/>

Free, private browser tool: enter your Social Security benefits and other income and see provisional income, how much of your benefits are taxable (0, 50 or 85%), the federal tax on them, and the effective rate on your next IRA withdrawal or Roth conversion (the "tax torpedo").

After using this, you can see what an extra $1,000 of retirement income really costs once it also makes more of your benefits taxable, which used to mean working IRS Publication 915 by hand.

Open `index.html`. Tests: `node --test 'ventures/social-security-benefits-tax-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal, tax or financial advice. The base amounts are inputs (statutory, not indexed). See `VENTURE.yaml`.
