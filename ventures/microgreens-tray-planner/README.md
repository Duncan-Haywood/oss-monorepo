# Microgreens Tray Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/microgreens-tray-planner/>

**Plan which crops to seed on which day, how many rack spaces the busiest weekday needs, what each crop earns per tray per rack-day, and the best mix when the rack is full.** Browser page, no install.

After using this, you know how many trays to seed for your harvest days, whether your rack is big enough on the worst day, and which crop actually earns the most for the space it takes.

## Your numbers, not advice

Every value is a number you type; the defaults are invented. Prices, yields, days and costs are yours to check. Check your local cottage-food, produce-safety and licensing rules. Not affiliated with any seed company or marketplace.

## How it computes

Each crop's trays are split across your harvest days and seeded `days to harvest` earlier, wrapping the week. A tray holds a rack space from its seeding day until the morning it is cut; the busiest weekday's count is the rack you need. Margin per tray = ounces sold x price - seed - media - packaging; per rack-day it is divided by days to harvest. The best mix adds trays one cycle at a time to the crop with the highest margin per rack-day, keeping only additions that still fit on the busiest weekday and stay under your sell limit.

## What it is not

Not agronomic, food-safety, financial or tax advice, and no warranty. It ignores crop failures beyond your loss percentage, seasonal price changes, delivery routes and the value of your time beyond the wage you enter.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`plan_run`, `example_loaded`, `best_mix_applied`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
