# Pay Application Generator

Free, private browser tool for subcontractors and small general contractors: paste a schedule of values with what was billed before and this period, set retainage, and get the contract sum, change orders, retainage held, previous certificates, current payment due and balance to finish, a line-by-line table, and a CSV. Flags lines billed over their value and front-loaded billing.

**Your Excel workbook, as it is (2026-11-25):** choose the .xlsx you already keep the continuation sheet in. `sheet.mjs` unzips it in the browser (the built-in `DecompressionStream`, no library, no upload), looks through each sheet for the table by its column names (a sheet named G703, continuation or schedule first), reads past the title block, two- or three-row headers and the row of column letters, skips division headings and subtotals, reads a "Change orders" section as change orders, and stops at the totals row. It then checks the sheet's own arithmetic rather than trusting it: a total completed and stored that no longer equals previous + this period + stored (a formula typed over), a balance to finish that is off, a totals row that differs from its lines (a line inserted outside the SUM range), and a retainage cell that disagrees with the rate entered. Formula results are rounded to the cent; a formula with no saved result is reported, never read as zero; an old .xls is asked for as .xlsx or CSV. A CSV saved from such a workbook, title block and all, is found the same way. Tested on fixtures written by openpyxl and by LibreOffice Calc (`fixtures/README.md`) as well as on workbooks the test builds.

**Next month (2026-11-24):** roll an application forward. Previous becomes previous plus this period, this period goes to zero, stored materials stay stored, the application number goes up by one, the period end moves a month, and previous certificates become this application's total earned less retainage (line 6), so next month's payment due is exact instead of estimated. Start it on the page or download the CSV. Tests check that a rolled month with no new work is due exactly $0 and that three chained months pay out exactly the total earned less retainage (`calc.test.mjs`).

It is the free front door for the pay-app suite in development (saved jobs, retainage until release, lien waivers, change orders; `docs/posts/2026-11-24-pay-applications-the-monthly-paperwork-subcontractors-pay-to-escape.md`). The page asks for early access through the site's public feedback form and quotes no price.

**Live tool:** https://marisstella.app/pay-application-generator/

Open `index.html`. Tests: `node --test 'ventures/pay-application-generator/**/*.test.mjs'`.

Not legal or accounting advice. Retainage terms come from your contract. It is not the AIA G702/G703 form and is not affiliated with the AIA. See `VENTURE.yaml`.
