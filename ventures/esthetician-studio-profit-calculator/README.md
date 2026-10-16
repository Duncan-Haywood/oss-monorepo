# Esthetician Studio Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/esthetician-studio-profit-calculator/>

A free browser tool for independent esthetician studio owners: **enter your facial, waxing and peel prices, chair minutes, supplies, no-show rate, rent, equipment, retail attach and commission, and get profit per treatment and per chair hour, the price each service needs for your target margin, break-even treatments per week, what no-shows cost, and what the same chair nets you working it yourself, employing an esthetician on commission, or renting it by the week**. Nothing is uploaded.

After using this, you can now **decide whether to work it yourself, employ or rent out a chair, and what a facial or wax appointment has to cost to clear your target margin once rent and empty slots are counted**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter the week's bookings, the chair's costs and the commission and booth-rent options, then click Work out the chair.
2. Pure logic is in `calc.mjs` (`plan()`, `serviceLine()`, `chairModes()`, `breakEven()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: three services with weekly bookings, price, chair minutes and supplies, a no-show rate (empty slots earn nothing and load the owner's time onto the treatments that show), the owner's hourly value, rent and equipment spread to a weekly fixed cost, skincare retail attach margin, a target-margin price per service (owner-worked and employed), profit per chair hour, break-even treatments per week, no-show cost per week and year, an employed esthetician on commission plus payroll extras against a flat booth rent with the equal-rent and equal-commission points, a volume table, a share link. Not modelled: tips (ignored on purpose), the owner's pay beyond the hourly figure, sales tax, card fees, insurance, licenses, advertising, an esthetician who books fewer clients, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
