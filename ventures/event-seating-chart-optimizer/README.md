# Event Seating Chart Optimizer

Free, browser-only seating chart optimizer for weddings, banquets and events.
Paste a guest list (with optional family or party), write who should sit
together, who to keep apart and who is pinned to a table, and it assigns every
guest to a table with the most wishes met within capacity. Shows each table,
every wish it could not meet, a comparison with seating in list order, and a
CSV for place cards. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/event-seating-chart-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, the pair-weight matrix, simulated annealing with a
  softened never-together penalty, a hill-climbing polish, the report, and an
  independent `verifyPlan` check.
- `reseat` / `parsePlanCsv` in `calc.mjs` - late RSVPs and drop-outs: paste last time's
  CSV and re-seat; each returning guest is tied to an anchor at their old table, so
  only moves worth their cost happen (stickiness low/medium/high). Pins and
  never-together rules still win.
- `tableSignsHtml` in `calc.mjs` - a print-ready page, one sheet per table (big number, guest names), opened from the "Print table signs" button.
- `escortBoardHtml` in `calc.mjs` - a print-ready "find your table" list, every guest by last name with their table number, for the welcome sign or escort cards.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-make-a-wedding-seating-chart.html` - guide whose worked example is
  recomputed by the test suite.

**No warranty.** Free and as-is; a planning aid, not event-planning advice or a
guarantee that any guest will be content. It assigns tables, not seats within a
table, and does not model room layout, access needs or dietary needs. It is a
heuristic search: tested against exhaustive search on hundreds of small random
lists, not proven optimal on large ones.

**Privacy.** Everything runs in your browser; your guest list is never uploaded
and is not saved. Anonymous feature counts stay in local storage and can be
switched off.

MIT licence, see `LICENSE`.
