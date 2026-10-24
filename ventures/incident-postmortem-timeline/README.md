# Incident Postmortem Timeline

Paste a timestamped incident log (chat export, pager notes, terminal history) and
get the numbers every postmortem needs: time to detect, acknowledge, mitigate and
resolve, the longest silent gaps in the record, and a blameless postmortem draft in
Markdown. Phases are inferred from plain wording ("alert fired", "rolled back",
"incident closed") or tagged explicitly with `start:`, `detected:`, `ack:`,
`mitigated:`, `resolved:`.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/incident-postmortem-timeline/

[`index.html`](index.html) runs it in a browser; nothing is uploaded and the page
makes no network requests.
[`how-to-write-a-blameless-postmortem.html`](how-to-write-a-blameless-postmortem.html)
is a short guide to using the result.

## CLI

```
node postmortem.mjs incident.txt                 # metrics summary
node postmortem.mjs incident.txt --md --title "Checkout outage" > postmortem.md
node postmortem.mjs incident.txt --json
node postmortem.mjs incident.txt --max-ttr 60m   # exit 1 if resolution took longer
```

Exit 2 means the file could not be read or had fewer than two timestamped lines.
Node 18+, no dependencies; `-` reads stdin.

## Limits

Time-only lines are placed on the most recent dated line, and a time earlier than
the previous one is read as the next day. Phase inference is keyword based and can
be wrong; tag the lines that matter. The draft is a starting point, not a finished
review. Not professional advice. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
