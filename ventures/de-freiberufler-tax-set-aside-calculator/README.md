# Germany Freelancer Tax Set-Aside Calculator (2026)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/de-freiberufler-tax-set-aside-calculator/>

Free, private browser tool: enter turnover and expenses and get Einkommensteuer under the 2026 section 32a tariff, Solidaritätszuschlag, optional Kirchensteuer, Gewerbesteuer with the section 35 credit, and the share of every invoice to set aside. Works for Freiberufler and Gewerbetreibende. Flags quarterly Vorauszahlungen and the Kleinunternehmer limit.

After using this, a freelancer in Germany (including the many English-speaking expats in Berlin, Munich and Hamburg) knows how much to move out of each payment instead of finding a tax bill after the Steuerbescheid.

Open `index.html`. Tests: `node --test 'ventures/de-freiberufler-tax-set-aside-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. 2026 figures taken from the statute text and published summaries, not a live Finanzamt lookup; verify with the Finanzamt or a Steuerberater. See `VENTURE.yaml`.
