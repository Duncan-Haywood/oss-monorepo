# Example dataset: AEP hourly electric load, every day of 2017

`aep-2017-day-by-hour.csv` holds the hourly load (MW) of the American Electric
Power (AEP) zone of PJM Interconnection for the 365 days of 2017, laid out as
a table: one row per day (`date`), one column per hour ending (`he01` is
midnight to 1 am, `he24` is 11 pm to midnight).

- **Source:** PJM publishes hourly zonal load through Data Miner 2. This copy
  is built from the widely mirrored Kaggle "Hourly Energy Consumption" extract
  (Rob Mulla), already in this repository at
  `research/infra-dcopf/data/AEP_hourly.csv` (its `data/README.md` records the
  mirror and commit). Built by `eval/extract_example.py` on 2026-11-15.
- **Licence:** CC0 (public-domain dedication of the extract).
- **Hour ending:** the extract stamps each reading with the hour it ends. It
  lists a day as 01:00 ... 23:00 followed by the next date's 00:00, which is
  that day's hour ending 24 (so `2018-01-01 00:00` is `he24` of 2017-12-31).
  An earlier draft of this table used clock hours 00 to 23 within one date,
  which put each day's last hour at the start of the next day; the
  robust PCA flagged that column in 103 of 365 rows, which is how the
  convention was caught.
- **Daylight saving:** the extract skips the 03:00 stamp on 2017-03-12
  (spring forward); that cell is left empty, and the tool fills it. It
  repeats the 02:00 stamp on 2017-11-05 (fall back); the first of the two
  readings is kept.
- Nothing else was changed.
