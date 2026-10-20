# Git Timesheet

Turn `git log` into estimated hours per day, a plain-language summary of what shipped, and the
amount to invoice at your rate — Markdown, CSV or JSON. After using this, a freelancer or agency
can send a client a readable work report in a minute, which used to mean reconstructing the week
from memory.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/git-timesheet/

```
git log --no-merges --since=2026-09-01 --pretty=format:'%H|%an|%aI|%s' | node cli.mjs --rate 90 --client Acme
node cli.mjs --repo . --since 2026-09-01 --author "Ada" --format csv
node cli.mjs --repo . --since 2026-09-01 --max-hours 40     # CI/cron gate: exit 1 over the cap
```

Browser version: `index.html` (paste the log; nothing is uploaded).

## Method

Commits less than `--gap` minutes apart (default 120) form one session. A session is worth its
span plus `--lead` minutes (default 30) for work before its first commit. Each contributor is
estimated separately, so two people committing in the same hour are both counted. Exit 1 when
`--max-hours`/`--max-amount` is exceeded; 2 on bad input.

## What it is not

An estimate from timestamps. Meetings, research, review and debugging without commits are not
seen. Not a time record, tax or accounting advice; check it before billing.

## Privacy

No network call, no account, no analytics vendor.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
