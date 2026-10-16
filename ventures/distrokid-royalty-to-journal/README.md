# DistroKid Royalty to Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/distrokid-royalty-to-journal/>

Free, private browser tool: paste a DistroKid earnings report (CSV or TSV from Bank) and get balanced, month-split journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). Earnings are booked by store and kind (streaming, downloads, social and video), songwriter royalties withheld as a deduction, rows in a currency of their own get their own journal (never converted), stores no rule recognises go to an uncategorised account (never dropped), and a per-row Total column or a Total row is checked against the rows. It also shows gross by store and the withheld share of gross.

Open `index.html`. Tests: `node --test 'ventures/distrokid-royalty-to-journal/**/*.test.mjs'`.

Column names are alias-matched and have not been verified against a real DistroKid export; nothing has run against one yet. See `VENTURE.yaml`.
