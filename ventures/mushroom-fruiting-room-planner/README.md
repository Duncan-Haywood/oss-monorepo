# Mushroom Fruiting Room Planner

Free, private browser tool for small mushroom farms: enter block cost, yield per flush, price, contamination and fruiting-room slots. It gives profit per block and per slot-week, the best number of flushes, the most blocks the room can carry per week, the lowest cash point before the first sale, and the contamination rate and price that break even. Exports a week-by-week CSV.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mushroom-fruiting-room-planner/

After using this, you know whether another flush or another block start is worth the slot, and how much cash the first weeks take, which used to take a spreadsheet and guesswork.

Open `index.html`. Tests: `node --test 'ventures/mushroom-fruiting-room-planner/**/*.test.mjs'`.

Not agronomic, food-safety, legal or tax advice. See `VENTURE.yaml`.
