# Daycare Tuition Calculator

Childcare center directors and family child care providers can use this free browser calculator to price a classroom from their own child:staff ratio, staffing cost, and overhead, and to see what an empty seat is actually costing them at every occupancy level. After using it, you can state the tuition a classroom needs to reach a target margin and the dollar amount left on the table at its current occupancy, which used to take a spreadsheet or a guess.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/childcare-tuition-calculator/

Serve this directory with `python3 -m http.server` before opening the page (ES module imports are blocked from `file://`). Run `node --test` for the pricing tests. The default example models a 10:1 ratio, two staff at $18/hour, a room licensed for 20, 85% occupancy, 12% payroll burden, and $1,500 in monthly overhead: that classroom costs $10,236/month to staff, needs $669.02 per child to clear a 10% margin, and is already earning about a 33% margin at its current $900 tuition rate -- while its three empty seats leave $2,700/month ($32,400/year) unbilled. Submitted assumptions are saved locally so a director can revisit a recurring pricing decision; use **Reset saved inputs** to remove them.

## Opportunity and differentiation

The target user is a childcare center director or family child care provider setting or reviewing classroom tuition. The tool deliberately never asserts a child:staff ratio or a room's licensed capacity -- those vary by state, by age group, and change over time, so a committed table of them would go stale the moment a state updated its rules. Instead it takes the operator's own numbers and does the arithmetic, the same non-advice framing this portfolio already uses for `pour-cost-calculator` and `music-lesson-break-even`. Generic tuition or day-rate calculators price a single child; this tool prices the classroom as a whole and holds staffing cost fixed as occupancy changes, which is what actually determines whether a room is profitable.

Organic acquisition targets r/daycare and r/ECEProfessionals threads about tuition pricing, enrollment, and classroom budgets, plus the search phrases "daycare tuition calculator," "how to price daycare tuition," and "childcare break even calculator." A [comparison page](vs-procare.html) positions the calculator against Procare Solutions -- a paid childcare management platform that bills at a rate a center already set, rather than deriving one -- for searches that land on "procare tuition calculator" or similar.

## Privacy, usage, and cost

Everything runs in the browser. Inputs never leave the device; there are no accounts, cookies, tracking pixels, or analytics vendors, and no child or family information is collected. The local counter records only aggregate `classroom_priced` / `occupancy_table_viewed` events and can be stopped with Do Not Track / Global Privacy Control or by clearing browser storage. Hosting and inference cost is $0 per user at launch.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not licensing, legal, tax, or financial advice, and it does not replace a qualified professional or your state's own licensing agency. **You are responsible for reviewing and verifying its output before relying on it**, including your own state's ratio and capacity rules, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support never changes access.

MIT licensed; see `LICENSE`.
