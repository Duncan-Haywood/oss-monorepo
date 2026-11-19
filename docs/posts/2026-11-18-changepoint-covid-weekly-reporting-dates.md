---
title: "When did your data feed go weekly? Checking a stale-data detector against 27 documented dates"
seo_title: "Dating a data feed's switch to weekly: 27 real test cases"
date: 2026-11-18
tags: [changepoint-detection, data-quality, statistics, covid-19]
description: "A free check that says when a series started repeating itself dated 20 of 27 US states' documented switches to weekly COVID-19 reporting, most within 3 days."
---

A number that stops changing is easy to miss. A price feed stops refreshing, a dashboard starts publishing once a week, a sensor sits still, and the series keeps arriving every day as if nothing happened. Any model fitted to it then reads the flat days as calm and the catch-up day as a jump.

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a check for this. It counts the days on which a value exactly repeats the day before and says when that share changed: "this series began updating less often around 2022-06-29 (repeats 31% of days before, 85% after)". It runs beside every model on the page and in the CLI, and it never moves a change the model reports. It only tells you which ones to read with care.

Until this week it had been scored in simulation only. That says nothing about whether it finds real feed changes on the dates they happened. This morning's round tried [currency pegs](2026-11-18-changepoint-currency-pegs-update-rate.md) and dated 4 of 7. The other three were cases where a peg didn't make the quote repeat. What it needed was a provider writing down, in advance of anyone's test, when its own publication schedule changed.

## A labelled set nobody made for this

Johns Hopkins CSSE kept the most-used COVID-19 case series of the pandemic, and its README has a section called "Irregular Update Schedules". State by state, it records when each health department stopped publishing daily: "Minnesota: Providing data once per week (Thursdays) (as of June 30, 2022). ~~Providing data Monday-Friday.~~" In JHU's daily series, a day with no publication repeats the day before. Monday-to-Friday reporting repeats on about 2 days in 7. Weekly reporting repeats on 6.

Before looking at a single series, I wrote down every US line that gives a dated switch to once a week and names the schedule it replaced. That came to 27 events, plus 19 smaller schedule changes and the rules for leaving lines out. The bars were the same as the peg round's: at least 19 of 27 dated (a change in the right direction whose date range comes within 10 days), and a median range of at most 60 days. That file was committed before the check ran.

## What it found

**20 of 27 dated, median range 13.5 days.** Both bars pass. Sixteen of the twenty are within three days of the README's date, most with repeats jumping from about 30% to 85%. Switches from a sparser schedule (Monday/Wednesday/Friday to weekly) come with wider ranges, 17 to 31 days, because the jump in repeats is smaller.

The misses are mostly not the check's fault:

- **Four states' schedules never showed in the numbers.** California and Texas change every single day through 2022. Missouri and New Hampshire keep a Monday-to-Friday pattern into 2023. There is no switch in the data to date, so silence is right.
- **Two states switched at another time.** DC and Kentucky went weekly-looking for a few weeks in March 2022, went back, and settled into weekly in October. The check dates October.
- **South Dakota** went weekly in the data in mid-March. The README says April 12. The check's range ends two days before the window opens.

One result is a real limit. **Brief returns to more frequent publication were dated 0 of 8.** Vermont, Arkansas and Alabama went back to daily reporting for a few months during the Delta wave of 2021. Their repeats fell from about 20% to nothing, and the check said nothing. Its penalty was set so that a series with no change gets a false alarm about once in a hundred. At that setting, two cuts around a two-month dip don't pay for themselves. So the check dates large, lasting changes in how often a feed publishes, and it misses short, modest ones. Lowering the penalty for that direction is the next thing to pre-register, on simulated short returns first.

## Use it

Paste a daily series into the [changepoint detector page](https://marisstella.app/changepoint-detector/), or run `node cli.mjs your.csv`, and the update-rate note appears under "Read with care" whenever 10 or more steps repeat. The full scoring, every date and the seven misses are in the README section "A provider's own schedule changes". The script is `eval/update-rate-covid-schedules.mjs`, and `sh eval/covid-schedules-fetch.sh` fetches the data (CC BY 4.0, JHU CSSE).
