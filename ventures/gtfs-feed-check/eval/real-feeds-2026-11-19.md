# Four real GTFS feeds through gtfs-feed-check, 2026-11-19

What the checker reports on four published feeds, judged against
2026-11-19. Produced by `eval/real-feeds.mjs`; nothing below is edited by hand
except this header. The feeds are not committed (each has its own licence);
fetch them and compare the hashes to reproduce.

| label | downloaded from (2026-11-19) | sha256 |
|---|---|---|
| Google's GTFS sample feed | https://developers.google.com/static/transit/gtfs/examples/sample-feed.zip | `46404f91b8f852bf1037f7901abc215d91d1bbe2a4362c5b02a3f9ced53c8d65` |
| BART | https://www.bart.gov/dev/schedules/google_transit.zip | `838bae35002f76c217aa7350ff65e137b5d89c312c28c0a1c43ec32ab1ed6170` |
| Halifax Transit | https://gtfs.halifax.ca/static/google_transit.zip | `f5d95091c8134716834734e2695b16689fd19c2302932e147c7075c6a9f6bb76` |
| TriMet | https://developer.trimet.org/schedule/gtfs.zip | `e6c6a68e6b33232de60387552a84f9a2a860f31bafb749bf18f9d7eb64b4605c` |

```
node --max-old-space-size=4096 eval/real-feeds.mjs --today=2026-11-19 \
  "Google's GTFS sample feed=google-sample.zip" "BART (Bay Area Rapid Transit)=bart.zip" \
  "Halifax Transit=halifax.zip" "TriMet (Portland)=trimet.zip"
```

Timings are from one run on the cloud container (Node 22), including unzip.

## Reading

- **No errors in any of the three live feeds**, and no `too_fast` or
  `stop_far_from_others` hit across 3.0 million stop times: the sanity
  ceilings did not fire on real data.
- **Google's own sample feed** (dated 2007) has expired, has 13 rows in
  `stop_times.txt` shorter than the header, and a header field
  `drop_off_time` that the reference does not define (the field is
  `drop_off_type`).
- **BART**: `feed_info.txt` says the feed ends 2026-08-30, but `calendar.txt`
  runs to 2027-01-10. One of the two is stale; a consumer that trusts
  `feed_end_date` treats the feed as expired.
- **Halifax**: service ends 2026-11-29, 10 days after the check (a note: under
  30 days); 153,548 `stop_times.txt` times are written with a leading space
  (`" 5:49:00"`); 60 routes print black text on pure blue (2.44:1).
- **TriMet**: 70 stop names end with a space; route 313 has no trips.

Not a finding about any agency's service quality: these are format checks,
and every info-level line is a convention, not a defect.

## Output

### Google's GTFS sample feed

0.0 MB zipped; 1 agencies, 5 routes, 11 trips, 9 stops, 28 stop times; service 20070101 to 20101231, 0 of the next 30 days; checked in 52 ms.

1 errors, 13 warnings, 2 notes.

| severity | code | file | count | first example |
|---|---|---|---|---|
| error | `feed_expired` | calendar.txt | 1 | last service 2010-12-31 |
| warning | `short_row` | stop_times.txt | 13 | line 17: 5 values, header has 9 |
| info | `no_feed_info` | feed_info.txt | 1 |  |
| info | `unknown_field` | stop_times.txt | 1 | line 1: drop_off_time |

### BART (Bay Area Rapid Transit)

1.0 MB zipped; 1 agencies, 14 routes, 6,377 trips, 291 stops, 76,409 stop times; service 20260810 to 20270110, 30 of the next 30 days; checked in 351 ms.

0 errors, 2 warnings, 143 notes.

| severity | code | file | count | first example |
|---|---|---|---|---|
| warning | `feed_info_end_before_service` | feed_info.txt | 1 | line 2 |
| warning | `feed_info_expired` | feed_info.txt | 1 | line 2 |
| info | `desc_repeats_name` | stops.txt | 132 | line 161: 12TH_1 |
| info | `unused_shape` | shapes.txt | 2 | line 4606: 001D_shp |
| info | `unused_stop` | stops.txt | 2 | line 39: E30-1 |
| info | `no_feed_contact` | feed_info.txt | 1 | line 2 |
| info | `unknown_field` | trips.txt | 1 | line 1: trip_load_information |
| info | `unknown_file` | calendar_attributes.txt | 1 | calendar_attributes.txt |
| info | `unknown_file` | directions.txt | 1 | directions.txt |
| info | `unknown_file` | fare_rider_categories.txt | 1 | fare_rider_categories.txt |
| info | `unknown_file` | realtime_routes.txt | 1 | realtime_routes.txt |
| info | `unknown_file` | route_attributes.txt | 1 | route_attributes.txt |

### Halifax Transit

6.1 MB zipped; 1 agencies, 81 routes, 9,239 trips, 2,358 stops, 324,165 stop times; service 20260824 to 20261129, 11 of the next 30 days; checked in 1506 ms.

0 errors, 153610 warnings, 2 notes.

| severity | code | file | count | first example |
|---|---|---|---|---|
| warning | `value_spaces` | stop_times.txt | 153,548 | line 2: arrival_time=" 5:49:00" |
| warning | `low_color_contrast` | routes.txt | 60 | line 2: 1: 000000 on 0000FF = 2.44:1 |
| warning | `value_spaces` | stops.txt | 2 | line 2049: stop_desc="0 " |
| info | `feed_covers_under_30_days` | calendar.txt | 1 | last service 2026-11-29 |
| info | `no_feed_contact` | feed_info.txt | 1 | line 2 |

### TriMet (Portland)

32.5 MB zipped; 3 agencies, 82 routes, 52,877 trips, 6,029 stops, 2,638,858 stop times; service 20261025 to 20270227, 30 of the next 30 days; checked in 7808 ms.

0 errors, 71 warnings, 8 notes.

| severity | code | file | count | first example |
|---|---|---|---|---|
| warning | `value_spaces` | stops.txt | 70 | line 390: stop_name="W Burnside & SW 21st " |
| warning | `unused_route` | routes.txt | 1 | line 83: 313 |
| info | `unknown_field` | stops.txt | 2 | line 1: direction |
| info | `unknown_field` | agency.txt | 1 | line 1: bikes_policy_url |
| info | `unknown_field` | trips.txt | 1 | line 1: trip_type |
| info | `unknown_file` | route_directions.txt | 1 | route_directions.txt |
| info | `unknown_file` | stop_features.txt | 1 | stop_features.txt |
| info | `unknown_file` | linked_datasets.txt | 1 | linked_datasets.txt |
| info | `unused_stop` | stops.txt | 1 | line 5448: 13754 |

