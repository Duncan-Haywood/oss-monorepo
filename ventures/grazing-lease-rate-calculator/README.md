# Grazing Lease Rate Calculator

A free browser tool (and small Node CLI) for ranchers and landowners: **enter acres, forage and a lease
rent, and see the AUMs and head the pasture carries, rent per AUM, per head-month and per acre, what the
same month costs as hay, and the rent range where the landowner beats the alternative and the rancher
beats feeding hay.** A drought table shows head and rent at 75% and 50% of the forage entered. Nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/grazing-lease-rate-calculator/

After using this, you can now **tell what a pasture can carry and what rent per AUM both sides should
accept**, which used to be a handshake number or a spreadsheet rebuilt for each lease.

## Use

1. Open `index.html`, enter the pasture and lease (or load the example), click Work out the lease.
2. CLI: `node cli.mjs --acres 640 --forage 1800 --use 35 --days 180 --rent 24 --alt 14 [--json]`
   (exit 1 when no rent works for both sides).

Not modelled: water and fence development, gain- or price-indexed rent, rotation, death-loss liability,
taxes, the lease contract. The tool holds no rates or forage data; the example numbers are made up.
Not legal, tax or financial advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
