# Referee & Umpire Pay Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sports-official-game-fee-calculator/>

A free browser tool: **enter a game fee, the drive and your season, and get pay per hour after the assignor and the drive, what a
doubleheader is worth, season take-home after self-employment tax, and the lowest fee worth driving for.** Nothing is uploaded.

After using this, you can now **tell which games are worth the drive and how many you need for a take-home goal**, which used to
be a guess about whether $55 covers the gas.

## Use

1. Open `index.html`, enter your numbers, click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`); tests: `node --test`.

Real driving cost drives your cash; the IRS standard mileage rate drives the tax deduction. Not modelled: state tax, QBI
deduction, Social Security wage cap, rainouts. No warranty; see the page footer. MIT licensed (`LICENSE`).
