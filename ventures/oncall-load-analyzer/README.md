# On-Call Load Analyzer

A free browser tool (and small Node CLI) for engineering teams: **paste an incident
export from PagerDuty, Opsgenie, Grafana OnCall or any tool that writes CSV, and see
who carries the pager, which nights were broken, which alerts fix themselves or
repeat, and how many hours a cleanup would give back.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/oncall-load-analyzer/

After using this, you can now **show your team, with numbers, whether the rotation is
fair and which three alerts to fix first**, which used to need a vendor analytics tier
or an afternoon in a spreadsheet.

## Use

1. Export incidents as CSV (needs a timestamp column and a responder column).
2. Open `index.html`, paste or choose the file, set your team's UTC offset.
3. CLI: `node cli.mjs incidents.csv --tz -5` (exit 1 when someone is overloaded;
   `--json` for the full report).

## Rules

- **Weighted load**: night page 3, evening/weekend 2, business hours 1; compared with an even split. Overloaded = 1.5x or more.
- **Self-resolved**: resolved within N minutes (default 5). **Repeat**: same alert (numbers, hosts, ids ignored) on the same service within 30 minutes. Counted as one or the other, never both.
- **Hours** are an assumption (20 min per daytime page, 45 per night page), not a measurement.

Not modelled: per-person timezones, primary/secondary roles, effort behind a page.
Pages are not stress; use this to start a conversation, not to rate a person.
No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
