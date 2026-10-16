# Private School Tuition Discount Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/private-school-tuition-discount-calculator/>

Free, browser-only calculator for independent-school business offices and board
finance committees. Enter the sticker price and the students in each
financial-aid group. It shows the **discount rate**, net tuition revenue and per
student, break-even enrolment, the highest award at which one more student still
adds money, and what a tuition increase really brings in when aid is held in
dollars or grows with the price, with a lost-families assumption.

Open `index.html` over any static server (ES module page). No build step, no
dependencies. `node --test *.test.mjs` runs the suite.

- `calc.mjs` - net tuition, discount rate, break-even, scenarios, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `tuition-discount-rate-explained.html` - guide whose worked example the tests recompute.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not financial,
accounting or enrolment advice. **Privacy.** Everything runs in your browser; nothing is uploaded.

MIT licence, see `LICENSE`.
