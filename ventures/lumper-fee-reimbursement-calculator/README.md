# Lumper Fee Reimbursement Calculator

A free browser tool for owner-operators, small carriers and dispatchers: **enter the lumper receipt, the dock wait and each way a broker might pay you back, and see what you are really out on each route**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/lumper-fee-reimbursement-calculator/

After using this, you can now **know what to ask the broker to reimburse before you pay the lumper**, which used to be a receipt, an advance fee and a 45-day wait that nobody added up.

## Use

1. Open `index.html`, enter the lumper fee, dock wait and one route per line (`name, flat fee $, fee % of lumper, % refunded, cap $, days until paid`), click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`, `routeCost()`, `dockCost()`, `sensitivity()`); tests: `node --test`.

Modelled: route fees (flat and percent), partial refunds and caps, the cost of money tied up until you are paid, detention past the free hours against the value of your time, the make-whole request amount, and a lumper-size sensitivity table. Not modelled: taxes, factoring fees on the invoice line, short-pays and non-payment, contract-specific lumper rules, state law.
Not legal or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
