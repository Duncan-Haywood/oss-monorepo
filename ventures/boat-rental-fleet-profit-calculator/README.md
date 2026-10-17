# Boat Rental Fleet Profit Calculator

A free browser tool for owners who rent out a boat, pontoon, jet ski or paddleboards: **enter hourly, half-day and full-day prices, hours on the water, fuel and wear, dock and insurance, the boat's cost, the weeks you can rent and a weather cancellation rate, and get profit per rental and per boat hour, the price each offer needs for your target margin, break-even rentals per week, what weather cancellations cost, and what the same boat nets rented direct, listed on a rental marketplace for a commission, or run as a captained charter**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/boat-rental-fleet-profit-calculator/

After using this, you can now **decide whether to rent your boat yourself, list it on a marketplace or charter it with a captain, and what a rental has to cost to clear your target margin once a year of dock and insurance is spread over a short season**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the week's bookings, costs and the marketplace and charter options, then click Work out the boat.
2. Pure logic is in `calc.mjs` (`plan()`, `serviceLine()`, `boatModes()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three offers with weekly bookings, price and hours on the water, a weather-and-cancellation rate, fuel and wear per engine hour, the owner's dock time per rental, a year of dock, insurance and the boat's cost net of resale spread over the season weeks, a target-margin price per offer, profit per boat hour, break-even rentals per week, cancellation cost per week and season, a marketplace commission against extra bookings (with the lift at which the two are equal), a captained charter premium against a captain's pay (with the premium at which the captain pays for himself), a volume table, a share link. Not modelled: tips and fuel surcharges, sales and rental taxes, card fees, damage and deductibles, winter storage and haul-out, the owner's pay beyond the hourly figure, advertising, captain licensing and charter permits, seasonality inside the season, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
