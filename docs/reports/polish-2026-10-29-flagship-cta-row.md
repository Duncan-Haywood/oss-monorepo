# Polish 2026-10-29: first-screen buttons on three more flagship pages

**Weak spot.** The 2026-10-29 scan found AI Bookkeeper's first screen at 390 px had no action. A Playwright
sweep of the other flagship tool pages found the same on `shift-roster-builder`, `league-schedule-generator`
and `sales-agent`: a heading, a long lead and a wall of links, with the first form field below the fold.
(`wall-framing-takeoff` and `einvoice-preflight` already put the form within the first screen;
`changepoint-detector` has an action at y = 762.)

**Change.** A button row under the lead paragraph on each page: a primary "Build a schedule" / "Make a
schedule" / "Paste your replies" that jumps to the first card (`#start`), and "Try an example", which clicks
the page's existing `#load-example` button. Same style as the AI Bookkeeper row, in each page's own colours;
visible focus ring; wraps on phones. No new request, works as plain anchors without JavaScript (the example
button needs JS, as the page does).

**Measured** (Playwright over http, 390 x 844): first button top at y = 459 (shift roster), 385 (league
schedule), 385 (sales agent), all above the fold; `scrollWidth` 390 on all three; clicking "Try an example"
fills the inputs on all three. `league-schedule-generator` `deploy.test.mjs` + `calc.test.mjs`: 173 pass, 0 fail.
Screenshot only checked by eye (not committed).

**Still weakest / next.** The lead plus the cross-link paragraph is ~400 px of text before the buttons on
shift-roster-builder; moving the link paragraph below the tool would help. `changepoint-detector`'s action is at
y = 762, barely above the fold. The floating mic button overlap noted earlier is not fixed. Lighthouse not run;
traffic and ranking unmeasured.
