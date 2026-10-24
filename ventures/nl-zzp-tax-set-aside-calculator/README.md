# Netherlands ZZP Tax Set-Aside Calculator (2026)

Free, private browser tool: enter turnover and expenses and get Box 1 income tax after the zelfstandigenaftrek, startersaftrek, MKB-winstvrijstelling, algemene heffingskorting and arbeidskorting, the Zvw contribution, and the share of every invoice to set aside. Flags the voorlopige aanslag and BTW/KOR.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nl-zzp-tax-set-aside-calculator/

After using this, a Dutch freelancer (ZZP'er) knows how much to move out of each payment instead of finding a tax bill after the assessment.

Open `index.html`. Tests: `node --test 'ventures/nl-zzp-tax-set-aside-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. 2026 figures taken from accountant and KvK summaries of the Belastingplan 2026, not a live Belastingdienst lookup; verify on belastingdienst.nl. See `VENTURE.yaml`.
