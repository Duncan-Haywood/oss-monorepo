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
- Group column and mixing: a third column (`Name | party | group`, e.g. "Bride side", "Singles", "Kids") plus a spread / cluster setting. Spread nudges each group to different tables so sides of the family mingle; cluster seats a group together. Pairs, parties and pins still win; the report shows each group's head-count per table (`groupMix`).
- Meal column and caterer sheet: a fourth column (`Name | party | group | meal`, e.g. "vegetarian") is tallied per table (`mealTally`) and shown in the report; "Print meal counts for the caterer" (`catererSheetHtml`) gives one total per meal plus a per-table grid, and the CSV gains a Meal column. Meals never appear on table signs or the find-your-table list.
- Different-sized tables: the optional box `1: 12, 5: 6` gives table 1 twelve seats and table 5 six (a head table, a kids table); every other table keeps the seats-per-table figure, fill-evenly shares what the sized tables leave, and the table count grows to fit when left blank (`parseTableSizes`, `capacitiesOf`). Capacity checks, `verifyPlan` and late-RSVP `reseat` all use each table's own size.
- Access needs: list the step-free tables in the "Accessible tables" box (`1, 2`) and add `Grandma Rose @ accessible` to the wishes (also `access`, `step-free`, `wheelchair`). That guest is only ever seated at a listed table, in the search, the polish and late-RSVP re-seats; `validateSpec` says so when no table is listed, a pin contradicts it, or the accessible tables are too small (`parseAccessTables`, `accessSeated`). Which tables are accessible is your call; the tool does not know the venue.
- Save and return: guests, wishes, settings and the last plan CSV are remembered on this device and can be saved to or loaded from a setup file, so a planner can come back as RSVPs arrive.
- `importGuestSheet` in `calc.mjs` - paste rows from a spreadsheet or RSVP export (or choose a .csv): tab, comma or semicolon separated, header columns for name (or first and last), household/party, side/group, meal, RSVP and plus-one are recognised, declined RSVPs are dropped, and a named plus-one is seated in their host's party.
- `orderTable` in `calc.mjs` - seat order around each table (a ring): exhaustive up to 9 guests, greedy plus swap/reversal passes above; parties and wanted pairs end up neighbours, avoided pairs do not. Table signs, the CSV and the on-screen tables list guests in this order.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-make-a-wedding-seating-chart.html` - guide whose worked example is
  recomputed by the test suite.
- `how-to-seat-divorced-parents-at-a-wedding.html` - second guide (divorced
  parents, new partners, a never-together pair), also recomputed by the tests.

## What you use today, and what this does differently

- **Paper, sticky notes or a spreadsheet:** free and private, but every "keep these two apart" and "seat these together" is checked by eye, and a late RSVP means redoing it.
- **Wedding-planning suites and seating-chart apps** (the seating tools bundled with planning sites, and standalone drag-and-drop chart makers): visual room layouts, guest-list sync and RSVP collection. They typically want an account and hold your guest list on their servers, and the table assignment is mostly drag-and-drop by you.
- **What this adds:** it searches for the assignment that meets the most of your wishes within table capacity, lists every wish it could not meet, re-seats after changes while moving as few guests as it can, and prints table signs, a find-your-table list and a caterer sheet. Your guest list never leaves the browser. It does not draw a floor plan; if you need a room layout or RSVP collection, a planning app is the better fit.

**No warranty.** Free and as-is; a planning aid, not event-planning advice or a
guarantee that any guest will be content. It lists each table's guests in order around a round table (neighbours scored by the same wishes) but does not model room layout (access needs are limited to the accessible-tables rule above), and the meal column only counts choices; it does not place guests by diet. It is a
heuristic search: tested against exhaustive search on hundreds of small random
lists, not proven optimal on large ones.

**Privacy.** Everything runs in your browser; your guest list is never uploaded.
It is remembered in this browser's local storage so you can return as RSVPs arrive ("Forget saved data" removes it), and can be saved to or loaded from a `seating-setup.json` file (`setupJson`, `parseSetup` in `calc.mjs`). Anonymous feature counts stay in local storage and can be
switched off.

MIT licence, see `LICENSE`.
