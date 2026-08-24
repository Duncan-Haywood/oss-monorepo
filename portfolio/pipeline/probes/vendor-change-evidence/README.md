# Vendor-change evidence probe

This probe tests the `vendor-change-evidence` candidate's narrowest claim: a
before/after snapshot pair of a vendor's terms, privacy, subprocessor, or
security page can produce a section-aware, source-linked change report,
without a fetch failure reading as "nothing changed" and without a reorder or
whitespace reflow reading as a substantive edit.

Run it with:

```sh
python3 -m pytest -q portfolio/pipeline/probes/vendor-change-evidence/test_vendor_diff.py
python3 portfolio/pipeline/probes/vendor-change-evidence/vendor_diff.py \
  portfolio/pipeline/probes/vendor-change-evidence/fixtures/substantive-before.json \
  portfolio/pipeline/probes/vendor-change-evidence/fixtures/substantive-after.json \
  /tmp/vendor-change-report.json
```

The fixtures stand in for fetched page snapshots and contain only heading/text
pairs, a fetch status, and capture metadata — no real vendor pages are fetched
or scraped. Sections are matched by heading, not position, so a reordered page
does not read as changed, and text is whitespace-normalized before comparison
so a reflow alone does not either. A snapshot whose `fetch_status` was not
`ok` (rate-limited, blocked, timed out) forces `inconclusive`, never
`unchanged` — the candidate write-up's stated failure mode is that a missing
snapshot can look like stability, and the fixture pair for that case never
had its own text compared.

Result on 2026-08-24: on the substantive fixture pair, the probe flags the two
sections that actually changed (a shortened subprocessor-notice window, a new
subprocessor added) and correctly ignores a third section that was only
reordered and re-whitespaced across the same snapshot pair. On the
reorder-only fixture pair it reports zero changes. On the fetch-failure
fixture pair it reports `inconclusive` with the failing side's fetch status
named, not `observed` with an empty diff.

This is a local diff experiment, not demand evidence and not a live page
fetcher — building the scheduled fetch/hash/snapshot loop the candidate
describes is unstarted, and so is any customer contact. The candidate
write-up's first experiment (ten public vendor pages, ten practitioner
conversations, one paid pilot) remains the next step and is unrun.
