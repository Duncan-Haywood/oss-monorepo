# Yoga & Pilates Studio Class Profit Calculator

A free browser tool for boutique yoga, pilates and barre studio owners: **enter classes per week, reservations per class, how those reservations pay (drop-in, class pack or monthly membership), your late-cancel rate and fee, the room's rent and other fixed costs, and a teacher pay model, and get profit per class and per room hour, break-even attendance, the drop-in price for your target margin, what late cancels cost, and what the same timetable nets with you teaching it, with hired teachers, or in a room you rent by the hour**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/yoga-pilates-studio-class-profit-calculator/

After using this, you can now **choose between teaching your own classes, hiring teachers on a flat, per-head or revenue-share deal, and giving up the lease for hourly room rental, and see the attendance each one needs to break even**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter a typical week, the price mix and the costs, then click Work out the timetable.
2. Pure logic is in `calc.mjs` (`plan()`, `week()`, `classRevenue()`, `teacherCost()`, `breakEvenBooked()`, `priceForTarget()`, `maxFlatPay()`, `encodeShare()`); tests: `node --test`.

Modelled: classes per week and reservations per class against room capacity; revenue by payer type (a drop-in price, class packs with unused-credit breakage, memberships spread over the classes a member books); late cancels (non-members pay nothing, members pay either way, a late fee kept at the share of cases you enforce); card processing; three teacher pay models with payroll extras; premises, software and insurance as weekly fixed costs; the room's hours including changeover; three setups (owner teaches, hired teachers, rented room at an hourly rate with its own draw and admin time) with the owner's hours priced; break-even reservations per class, the drop-in price for a target margin, the most a flat teacher fee can be, a volume table, a share link. Not modelled: retail, workshops and teacher trainings, tips, sales tax, advertising, new-member acquisition, seasonality, waitlists that refill late cancels, whether a teacher can lawfully be treated as a contractor, income tax.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
