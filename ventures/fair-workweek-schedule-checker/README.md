# Fair Workweek Schedule Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fair-workweek-schedule-checker/>

Free, browser-only predictive scheduling ("fair workweek") checker for
restaurant, retail and hospitality managers. Paste the posted schedule, the time
it was posted, and every change made afterwards with the time the worker was
told. It reports:

- **Late postings**: shifts that start sooner than the required notice.
- **Short-notice changes**: shifts added or moved inside the notice window, and
  shifts cut or cancelled inside theirs, with the premium pay each one triggers.
- **Rest violations**: closing-then-opening pairs under the minimum rest, with the
  multiplier on the hours inside the window.
- Worker-requested changes are marked and excluded.

Seattle and Chicago presets, plus fully editable numbers for any other city.
Export the findings as CSV or plain text. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, rule presets, change application, premium and rest checks, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `what-is-predictive-scheduling-pay.html` - guide with a worked example the test suite recomputes.

**No warranty.** Free and as-is; not legal advice. The presets summarise public
ordinances, may be wrong or out of date, and ignore employer-size and industry
coverage and statutory exceptions. Verify every figure with your city and an
employment attorney.

**Privacy.** Everything runs in your browser; names and schedules are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
