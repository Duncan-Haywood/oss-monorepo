# Event Seating Chart Optimizer

Free, browser-only seating chart optimizer for weddings, banquets and events.
Paste a guest list (with optional family or party), write who should sit
together, who to keep apart and who is pinned to a table, and it assigns every
guest to a table with the most wishes met within capacity. Shows each table,
every wish it could not meet, a comparison with seating in list order, and a
CSV for place cards. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/event-seating-chart-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.


## Run your own "find your table" page (self-hosted)

The browser tool seats the room; `server.mjs` gets the answer to your guests. You paste the guest list and wishes into
`/admin?key=...` and click **Seat and publish**; guests open **one link** (`/find?t=...`), type their name and see their
table number and who else sits there. Meals, groups and wishes are never shown. No accounts, no app, no third party:
zero dependencies, one JSON file on a disk you own.

- **Alternatives today:** paid wedding sites (Zola, The Knot, WithJoy) and event apps (Social Tables, AllSeated) host the
  guest list for you behind their accounts. This is only the optimise-and-look-up loop, MIT-licensed, on your box.
- **Deploy:** `docker compose up -d` with `ADMIN_KEY` and `GUEST_TOKEN` set (`openssl rand -hex 16`), `fly.toml` for Fly.io,
  or `render.yaml` for Render, each in your own account. Keep `STATE` on a persistent disk. Put it behind HTTPS.
- **Meal picks (optional):** type your choices in the admin box ("Chicken, Fish, Vegetarian"); after finding their table each guest can pick a meal, you see the tally in `/admin` and download `/admin/meals.csv` (name, table, meal) for the caterer. Republishing drops picks for guests you removed. Anyone holding the guest link can set any listed guest's meal, so share it only with guests.
- Anyone with the guest link sees every guest name; share it only with the guests. `node --test` covers it.

- `calc.mjs` - parsing, the pair-weight matrix, simulated annealing with a
  softened never-together penalty, a hill-climbing polish, the report, and an
  independent `verifyPlan` check.
- `reseat` / `parsePlanCsv` in `calc.mjs` - late RSVPs and drop-outs: paste last time's
  CSV and re-seat; each returning guest is tied to an anchor at their old table, so
  only moves worth their cost happen (stickiness low/medium/high). Pins and
  never-together rules still win.
- `tableSignsHtml` in `calc.mjs` - a print-ready page, one sheet per table (big number, guest names), opened from the "Print table signs" button.
- `floorPlanHtml` in `calc.mjs` - a print-ready floor plan, landscape, three tables across: each table is a circle with its guests around it in seat order (the order the signs and CSV use), so you see who sits next to whom. No meals shown; opened from "Print floor plan". It does not model the room itself, only the tables.
- `escortBoardHtml` in `calc.mjs` - a print-ready "find your table" list, every guest by last name with their table number, for the welcome sign or escort cards.
- `placeCardsHtml` in `calc.mjs` - folded tent place cards, 8 to a US Letter page: each guest's name upside down on the top half and the right way up with their table number below, so it reads from both sides once folded. Grouped by table, no meals shown; opened from "Print folded place cards".
- Group column and mixing: a third column (`Name | party | group`, e.g. "Bride side", "Singles", "Kids") plus a spread / cluster setting. Spread nudges each group to different tables so sides of the family mingle; cluster seats a group together. Pairs, parties and pins still win; the report shows each group's head-count per table (`groupMix`).
- Meal column and caterer sheet: a fourth column (`Name | party | group | meal`, e.g. "vegetarian") is tallied per table (`mealTally`) and shown in the report; "Print meal counts for the caterer" (`catererSheetHtml`) gives one total per meal plus a per-table grid, and the CSV gains a Meal column. Meals never appear on table signs or the find-your-table list.
- Different-sized tables: the optional box `1: 12, 5: 6` gives table 1 twelve seats and table 5 six (a head table, a kids table); every other table keeps the seats-per-table figure, fill-evenly shares what the sized tables leave, and the table count grows to fit when left blank (`parseTableSizes`, `capacitiesOf`). Capacity checks, `verifyPlan` and late-RSVP `reseat` all use each table's own size.
- Access needs: list the step-free tables in the "Accessible tables" box (`1, 2`) and add `Grandma Rose @ accessible` to the wishes (also `access`, `step-free`, `wheelchair`). That guest is only ever seated at a listed table, in the search, the polish and late-RSVP re-seats; `validateSpec` says so when no table is listed, a pin contradicts it, or the accessible tables are too small (`parseAccessTables`, `accessSeated`). Which tables are accessible is your call; the tool does not know the venue.
- Save and return: guests, wishes, settings and the last plan CSV are remembered on this device and can be saved to or loaded from a setup file, so a planner can come back as RSVPs arrive.
- `shareFragment` / `parseShareFragment` in `calc.mjs` - "Copy share link": the whole setup packed into the URL fragment (`#s=...`), so a partner or planner opens the same lists from one link. The fragment is never sent to a server; the link contains the guest names, so share it only with people who may see them.
- `importGuestSheet` in `calc.mjs` - paste rows from a spreadsheet or RSVP export (or choose a .csv): tab, comma or semicolon separated, header columns for name (or first and last), household/party, side/group, meal, RSVP and plus-one are recognised, declined RSVPs are dropped, and a named plus-one is seated in their host's party.
- `orderTable` in `calc.mjs` - seat order around each table (a ring): exhaustive up to 9 guests, greedy plus swap/reversal passes above; parties and wanted pairs end up neighbours, avoided pairs do not. Table signs, the CSV and the on-screen tables list guests in this order.
- `suggestFixes` in `calc.mjs` - for each wish the plan could not meet, the best single move or swap that raises the score within capacity, pins and accessible tables, and which other wishes it would break. Shown under "Ways to fix a missed wish"; nothing is applied.
- `compareTableCounts` in `calc.mjs` - "would one more table seat better?": re-runs the optimiser at the fewest tables that fit and up to three more, and reports wishes met and the fullest table for each; counts a pin or accessible table rules out are skipped. Nothing is applied.
- `applyMoves` in `calc.mjs` - accept a hand edit: "Apply this move" (after a check) or "Apply this fix" (on a suggested fix) re-seats those guests, refuses anything that overfills a table or breaks a pin or accessible table, re-reports the plan so the CSV, signs, floor plan and place cards all use the edited seating, and "Undo last edit" steps back. `apply-edit.check.mjs` drives it in a browser (needs a server and Playwright; see the file header).
- `checkMove` in `calc.mjs` - "what if I move Aunt Linda to table 3?": reports whether the table has room, the pin and access rules, which wishes the move would break or fix, and the score change, without applying it.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-make-a-wedding-seating-chart.html` - guide whose worked example is
  recomputed by the test suite.
- `how-to-handle-late-wedding-rsvps-and-drop-outs.html` - third guide (late RSVPs and drop-outs: a fresh run moves 9 of 22 returning guests, a re-seat moves 1), recomputed by the tests.
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
