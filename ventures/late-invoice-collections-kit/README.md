# Late Invoice Collections Kit

A free browser tool for freelancers and small agencies with an overdue invoice: **type the
amount, due date, client type and state and get a dated plan to get paid.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/late-invoice-collections-kit/

After using this, you can now **see the late fee and interest owed today and on later dates,
copy four letters (friendly reminder, firm notice, final demand, referral) with your numbers
filled in, see whether small claims is worth it against your own filing fee, time and odds, and
download the schedule as .ics reminders**, which used to mean guessing what you could charge and
writing each chase email from scratch.

Related: [`invoice-aging-late-payer-analyzer`](../invoice-aging-late-payer-analyzer/) (a whole
receivables export), [`invoice-payment-terms-calculator`](../invoice-payment-terms-calculator/)
(terms before you invoice).

## Input

Invoice amount, due date, today, business or consumer client, US state; interest basis (your
contract's monthly rate, a state statutory rate, or none), flat fee and grace days; optional
names and payment instructions for the letters; step day offsets; and small-claims limit, filing
fee, service cost, your hours and their value, win and collection odds, agency fee and recovery.

## Model

Simple interest from the due date after any grace period. The state list holds only fixed legal
rates the author is confident of (11 states, with the statute, as of 2026-09-29), marked **verify
with your state statute**; other states are typed by you. The sue-or-not step is an expected value
on your assumptions and is not a verdict. Not modelled: fee and interest caps, notice rules,
collector licensing, attorney fees, limitation periods, disputes. State rates were written from
memory and are **unverified**. Not legal advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
