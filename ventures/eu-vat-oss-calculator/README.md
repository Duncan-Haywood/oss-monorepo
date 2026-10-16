# EU VAT OSS Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eu-vat-oss-calculator/>

A free browser tool for small sellers of digital goods, services and e-commerce products to
EU consumers: **paste or drop your sales CSV, see whether you have crossed the EUR 10,000
distance-sales threshold and on which sale, then get the VAT due per destination country and
per rate for the quarterly One-Stop-Shop (OSS) return.** The file is read in the browser;
nothing is uploaded and no login, account or API key is needed. Sellers outside the EU can use
it for the non-Union OSS.

After using this, you can now **name the date and the order at which destination-country VAT
started, see which of your rows are domestic, B2B, non-EU or below the threshold and so not on
the return, and download the return table as CSV**, which used to mean a spreadsheet, a rate
list and a guess about rounding.

**Not tax advice.** It is arithmetic on your own data, with no warranty, and it is not
affiliated with the European Commission or any tax authority. **The VAT rates are from memory
of public sources with an as-of date (`RATES_AS_OF` in `calc.mjs`) and may be out of date.
Verify every rate against the European Commission's VAT rates page or your tax authority
before filing.** The figures the author is least sure of are marked in the page's rate table
and listed under "Unverified" in `VENTURE.yaml`.

## Input

One CSV (comma, semicolon or tab; BOM and quoted newlines handled) with a date, the customer's
country and an amount. Optional: currency, rate (`standard`, `reduced`, `zero`, `e-book` or a
percentage), a VAT ID or B2B flag, a type column containing `refund` or `credit`, and an order
id for duplicate detection. Headers are detected for common exports (Shopify, Etsy, German
headers); a mismatch can be fixed with the column selectors on the page. Negative amounts are
refunds. Amounts can be net or gross of VAT.

## Rules it applies

- **Threshold:** net sales to consumers in other EU countries are summed per calendar year in
  date order. Over EUR 10,000 in the current or previous year, the sale that crosses it and
  every later one take the destination country's VAT. Previous-year sales come from the file
  or from a box. Opting into OSS earlier, and sellers outside the EU (no threshold), are options.
- **Left off the return:** your own country's sales (shown separately), B2B sales with a VAT
  ID, non-EU destinations (with notes for GB, Northern Ireland, Monaco and some territories),
  and sales before the threshold was crossed.
- **Money:** BigInt and integer arithmetic only. Foreign currencies convert at rates you type
  (units per 1 EUR). VAT is rounded once per country and per rate, not per line. For gross
  amounts the VAT is taken out of the rounded gross total, so base plus VAT equals gross.
- **Output:** the OSS table with totals, a CSV of it, findings with row numbers, and a note on
  what to keep as records (10 years, two non-conflicting pieces of evidence of customer
  location).

Not modelled: IOSS, special schemes, mixed supplies, correction returns for earlier quarters,
penalties and interest, national rounding rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.
