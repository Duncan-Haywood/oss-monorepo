# US Freelancer Tax Set-Aside Calculator (2026)

Free, private browser tool: enter 1099 revenue and expenses and get self-employment tax, federal income tax (standard deduction, 2026 brackets, 20% QBI deduction), a state estimate, the quarterly 1040-ES payment with the safe harbor, and the share of every invoice to set aside, including what to put away from your next $1,000.

**Live tool:** https://marisstella.app/us-freelancer-tax-set-aside-calculator/

After using this, a US freelancer knows how much to move out of each payment instead of finding a tax bill in April, which used to mean a "30%" guess or a spreadsheet.

Open `index.html`. Tests: `node --test 'ventures/us-freelancer-tax-set-aside-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Tables match the repo's other 2026 tools (Rev. Proc. 2025-32, SSA 2026); verify on irs.gov. See `VENTURE.yaml`.

## Known gaps (quality audit 2026-11-20)

From the [first audit](../../portfolio/quality/audits/2026-11-20-us-freelancer-tax-set-aside-calculator.json); fixed so far: the head-of-household 24% bracket edge (201,750) and the 1040-ES 90% test now use federal tax only.

- **W-2 withholding is not offset (high).** The set-aside total includes the tax on W-2 wages and other income, so a $10k side gig on a $100k salary is told to set aside about $16,219 (162% of revenue) when the gig itself adds about $3,049. Until fixed, side-gig users should subtract their expected withholding.
- The 110% safe harbor keys on this year's AGI; the rule uses last year's AGI over $150,000.
- QBI drops to zero above the threshold instead of following the 2026 $75k phase-in, so federal tax runs high there (about $10k at $250k net).
- The "above the QBI line" message can appear when taxable income is 0.
- The FAQ's "most freelancers land between 25% and 35%" has no source.
