# Financial Aid Award Letter Comparator

Free, browser-only comparison of college financial aid award letters. Type in each
offer's cost of attendance, grants, loans and work-study and it shows the **true
total cost to your family** over the years you will attend: cash during school
plus loan repayment with interest. It counts only grants and scholarships as a
price cut, catches first-year-only scholarships that make year 2 jump, flags
borrowing you do not need, and works out the **extra grant per year that would
make a dearer offer match the cheapest one**, the number to bring to a financial
aid appeal. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/aid-award-letter-comparator/
**Guide:** [how to compare financial aid offers](https://duncan-haywood.github.io/monorepo-projects/aid-award-letter-comparator/how-to-compare-financial-aid-offers.html)

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

## Model

- Offers are pasted as `label: amount` blocks (one per college). `parseColleges`
  in `calc.mjs` accepts the usual award-letter labels and reports any line it
  ignored.
- Net price = cost of attendance minus grants and scholarships. Loans and
  work-study are not price cuts. A "One-time first-year grant" applies to year 1
  only; costs rise by the yearly increase you set.
- Loans repeat each year at the amounts written (switch off to model year 1
  only). Subsidized loans add no interest in school; the others add simple
  interest from the start of each year through the grace period, then amortise
  over the repayment term at the rate you enter. Origination fees are paid in
  cash. Parent PLUS is reported as a separate parent payment.
- Total cost to family = cash paid during school + total loan repayments.
  Work-study is shown as hours a week, not netted off.
- "Grant needed to match" bisects on an extra yearly grant (dropping loans the
  extra gift makes unnecessary) until the offer's total cost equals the
  cheapest offer's; rounded up to $50.
- Flags: net price jump after year 1, federal dependent annual loan limits,
  borrowing beyond the bill, work-study above about 12 hours a week, grants above
  the cost of attendance, loan payments above 10% of an expected salary.
- Rates and fees default to 2025-26 federal values and must be replaced with
  the figures for the year of borrowing. Not modelled: capitalisation on
  deferral, income-driven or other repayment plans, taxes, grant GPA
  conditions, interest on Parent PLUS during a parent's deferment, aid changes
  after year 1.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-compare-financial-aid-offers.html` - guide whose worked example is
  recomputed by the test suite.

**No warranty.** Free and as-is; not financial, tax, legal or educational advice
and no substitute for a college financial aid office. Results are only as good as
the numbers you type. The example colleges and amounts are made up. Not
affiliated with any college, lender, loan servicer or the U.S. Department of
Education. Everything runs in your browser; your award letters are never
uploaded. Licensed MIT; see `LICENSE`.

Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
