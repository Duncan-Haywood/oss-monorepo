# Airbnb Earnings Report Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/airbnb-earnings-report-analyzer/>

A free browser tool for short-term-rental hosts: **drop in the Transaction history
CSV you downloaded from Airbnb and see which listings, months and stay lengths
actually make money.** The file is read in the browser; nothing is uploaded and no
account access is needed.

After using this, you can now **see net earnings, Airbnb's fee share, average daily
rate, net per booked night and occupancy per listing, your best and worst months,
whether your cleaning fee covers what a clean costs you, and profit per night for
1-2, 3-4, 5-6, 7-27 and 28+ night stays**, which used to mean giving a host dashboard
(Hostaway, Beyond, Stessa) access to your account or building the pivot table by hand.

## Input

Airbnb: Menu, Account, Payments, Transaction history, Download CSV. Needs `Start date`,
`Nights` (or `End date`) and `Amount` (or `Gross earnings`); `Listing`, `Type`,
`Service fee`, `Fast pay fee`, `Cleaning fee` and `Occupancy taxes` are used when
present. Reservation rows are stays; payouts are ignored; adjustments and resolutions
are listed separately. US and day-first dates, comma/tab/semicolon files and UTF-16
exports are read. Unreadable rows are listed with a line number and reason.

## Model

Net is the reported Amount (or gross minus service and Fast Pay fees). Fee share is
those fees over gross. ADR is gross over nights; net per night is net over nights.
Profit subtracts the turnover cost you enter once per stay. Occupancy is nights over
the days between first check-in and last check-out unless you enter the days open.
Occupancy taxes are shown for reference only. See the page for what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
