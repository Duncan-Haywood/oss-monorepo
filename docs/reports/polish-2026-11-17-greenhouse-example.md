---
kind: polish
topics: [tools, showcase]
date: 2026-11-17
---
# Polish: Greenhouse Bench Planner's worked example grows the crops it can

Date: 2026-11-17. Track: polish/0. Picked item 3 of "Still weakest" in
`polish-2026-11-17-gallery-crops.md` ("Greenhouse Bench Planner's example sows 0 of three crops").
Open PRs searched (`list_pull_requests`, open): none touch `greenhouse-bench-planner`.

## What was wrong

The planner booked crops in a single fixed order: margin per sq ft-week, greedy. On its own example it
sold 1,534 of 1,870 units for $3,801.60, with 0 peppers, 0 baskets and 0 geraniums. A brute force over
all 5,040 booking orders (`planCore` with an explicit order) finds $4,548.10 and 1,723 units. The
example's "today" (2027-03-01) also came after the basket and geranium sow dates.

## What changed

- `calc.mjs`: `planCore` takes an optional booking order and returns the order it used. A new `plan()`
  tries three more orders, then single-crop moves (short crops first), accepting only improvements. The
  replan budget is `min(150, 3000 / crops)`, at least 10. Result on the example: $4,548.10, 1,723 units,
  equal to the brute-force best. Timing: 7 crops 68 ms, 70 crops 202 ms, 280 crops 78 ms (whole
  `analyze`, including the 5-row space sweep).
- `index.html`: the example's today is 2027-01-15; status text, "Priority" bullet and FAQ describe the
  search. Dates in the tables are `nowrap`: at 390 px the report is 3,209 px tall, down from 3,809, with
  no sideways page scroll (scrollWidth 390).
- `llms.txt`: canonical marisstella.app URL; a Limits line saying the plan is a search, not a proof.
- Two tests: the example equals the brute-force best, and a 280-crop list stays inside the bench and under 5 s.

Before and after report screenshots (1,280 and 390 px) were taken locally and are not committed. The
numbers above come from them.

## Still weakest, and what I would do next

1. **Recapture the showcase still** for greenhouse-bench-planner (`node platform/pages/showcase/capture.mjs`),
   since the example's result changed. The gallery still shows the old plan until the next capture.
2. **`today` only warns.** A crop whose sow date has passed is still booked. An option to exclude it, or
   to plan it from today, would make mid-season replanning honest. It needs a UI choice, because growers
   who already sowed want it kept.
3. **The space-sweep table can sell fewer units at a bigger size** (+50 sells 1,833, +100 sells 1,796)
   because it ranks by margin. That is right but reads oddly; a one-line note under the table would help.
4. Carried over from `polish-2026-11-17-gallery-crops.md`: item 1 (the reel from 2026-10-20) and item 2
   (600 px crops on 2x screens).
