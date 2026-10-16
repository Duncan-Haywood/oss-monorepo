# Fiverr Earnings Fee Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fiverr-earnings-fee-analyzer/>

A free browser tool for Fiverr sellers: **drop in your earnings or revenue CSV and see
what you actually take home.** The file is read in the browser; nothing is uploaded and
no Fiverr account access is needed.

After using this, you can now **see the service fee Fiverr actually took (observed, not
assumed), your take-home per order, net revenue per gig and per buyer, repeat-buyer
share, refunds and cancellations, withdrawal costs, funds still clearing, and the price
to charge for a target take-home**, which used to mean building the pivot table by hand.

## Input

Any CSV with an amount: `Amount`/`Price` (before fee) and/or `Earnings`/`Net` (what you
keep). `Date`, `Type`, `Status`, `Gig`, `Buyer`, `Service fee` and `Hours` are used when
present. **Column names are matched by alias and were not checked against a real Fiverr
export; the assumed names are stated on the page.** Comma/tab/semicolon files, quoted
fields, US and day-first dates and UTF-16 exports are read. Unreadable rows are listed
with a line number and reason.

## Model

Fee rate is fees over order value from the file's fee column or amount minus earnings;
the percentage you enter is used only when the file has neither, and the page says so.
Take-home is net order and tip revenue minus refunds, your cost per order and withdrawal
fees. Hours (optional, yours) enable a take-home-per-hour ranking; the tool never guesses
them. Break-even price is (target + cost) / (1 - fee rate), also shown adjusted for your
refund rate. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
