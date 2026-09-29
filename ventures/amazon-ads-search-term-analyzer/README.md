# Amazon Ads Search Term Analyzer

A free browser tool for Amazon sellers and freelance PPC managers: **drop in a
Sponsored Products search term report (CSV) and see which search terms spent money
with no orders, a negative-keyword list you can paste back in, which converting
terms run above your break-even ACOS, and which are worth harvesting as exact
match.** The file is read in the browser; nothing is uploaded and no advertising
account access is needed.

After using this, you can now **split no-order spend into proven, overspent and
too-little-data using your own click-to-order rate, export negative exact keywords
per campaign and ad group, and see how far each converting term sits over your
break-even ACOS**, which used to mean giving a PPC automation tool (Helium 10,
Perpetua, Teikametrics) access to your advertising account or building the pivot
table by hand.

## Input

The search term report from the Ads console (Measurement & reporting, Sponsored ads
reports, Search term, CSV). Needs `Customer Search Term`, `Spend`, `Clicks` and a
total-orders column; `Campaign Name`, `Ad Group Name`, `Targeting`, `Match Type`,
sales, `Currency` and the report dates are used when present. Headers are matched
by alias, dates may be month names, month-first, day-first or ISO, and comma, tab
and semicolon files in UTF-8 (with or without a BOM) or UTF-16 are read. Unreadable
rows are listed with a line number and reason. Column names were written from
memory of the report; the first report of an unread file is the priority fix.

## Model

Rows are combined per campaign, ad group and search term. A term with clicks and
no orders is **proven** waste at the fewest clicks `n` with `(1 - rate)^n < 0.05`
at the account's click-to-order rate, **overspent** when its spend exceeds one
average order's ad allowance (average order value x reference ACOS), otherwise
**watch**. The reference ACOS is the break-even ACOS you enter, or the account's
own. Converting terms with enough clicks above the line show their excess spend;
harvest candidates have enough orders, an ACOS 20% under the reference, and are
not already exact match. It is arithmetic on the file, not advice; see the page for
what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
