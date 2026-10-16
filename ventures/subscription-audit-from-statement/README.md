# Subscription Audit From Your Bank Statement

A free browser tool: **drop in a CSV export from your bank or credit card and see every recurring
charge.** The file is read in the browser; nothing is uploaded and no bank connection is needed.

After using this, you can now **see each subscription's monthly and yearly cost, which ones rose in
price and when, which were charged twice, which yearly renewals are coming, which seem to have
stopped, and where you pay for several services of one kind**, and tick the ones you would cancel to
see the saving, which used to mean reading twelve statements line by line or handing a bank login to
a subscription-manager app.

## Input

- A statement CSV with a date, a description and an amount column (or debit and credit columns).
  Six months is the least that works well; twelve also catches yearly charges.
- Purchases negative or positive, and month-first or day-first dates, are detected and can be set by hand.

**Column names are matched by alias and unverified against real bank exports.** Comma, semicolon and
tab files, UTF-16, `$` signs, parentheses and thousands separators are read.

## Model

Charges are grouped by a cleaned merchant name. A group is recurring when at least 60% of the gaps
fit weekly, two-weekly, monthly, quarterly, six-monthly or yearly; everything but monthly and
quarterly must hold a steady price. Cost is the median of the last three charges times charges a
year. A price rise is a charge 2% and 25 cents above the one before. A charge with no follow-up for
one and a half cycles is "ended" and left out of the totals. Not modelled: unbilled free trials,
app-store or payment-app charges that hide the merchant, shared plans, taxes, currency, refunds.

## Service directory

`services.mjs` recognises about 100 well-known services (streaming, music, storage, news, fitness, software, VPN, shopping memberships, learning). Variants of one service merge into one line and show its own site. Recurring charges billed through Apple, Google Play, Amazon digital or PayPal hide the app's name, so they are flagged with where to look on your account. The directory lists only each service's domain; a recognised name is a guess from bank text, not proof of the plan.

## Run

Open `index.html` through any static server. Tests: `node --test`.
