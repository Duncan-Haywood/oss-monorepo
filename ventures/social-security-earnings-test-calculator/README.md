# Social Security Earnings Test Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/social-security-earnings-test-calculator/>

Free, private browser tool for people who claim Social Security before full retirement age and keep working: see how many months of benefits are withheld each year, the net dollars held back, the higher benefit credited at full retirement age, and when it repays what was withheld.

After using this, you can see what working while claiming early really costs, which used to mean reading SSA publications and doing the whole-month withholding arithmetic by hand.

Open `index.html`. Tests: `node --test 'ventures/social-security-earnings-test-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal, tax or financial advice. The limits (2026 defaults $24,480 and $65,160) are inputs: check ssa.gov. See `VENTURE.yaml`.
