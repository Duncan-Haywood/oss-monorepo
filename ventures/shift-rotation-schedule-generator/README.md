# Shift Rotation Schedule Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shift-rotation-schedule-generator/>

Generate rotating shift calendars for **Pitman 2-2-3, 4-on-4-off, 3-on-3-off, DuPont (28-day)
and 24/48 / 48/96** patterns. See the real hours per week, the worst 7-day stretch, days off and
full weekends off a year; find your crew and cycle day from a few dates you remember; export an
`.ics` calendar for Google, Apple or Outlook.

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no network
calls. [`rotating-shift-schedules-compared.html`](rotating-shift-schedules-compared.html)
compares the patterns.

After using this, you can put your whole rotation into your phone's calendar and know what a
proposed pattern change does to your hours and weekends, which used to take counting squares on a
paper roster.

## CLI

```
node cli.mjs --pattern pitman --crew B --anchor 2026-10-12 --days 90
node cli.mjs --pattern dupont --crew A --anchor 2026-10-12 --ics shifts.ics
node cli.mjs --compare
```

Node 18+, no dependencies.

## Limits

Standard published patterns only; your employer's roster is authoritative. Not legal, labour or
payroll advice: overtime and rest rules vary by jurisdiction and agreement. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
