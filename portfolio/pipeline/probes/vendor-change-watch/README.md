# Vendor-change evidence monitor probe

This probe tests the `vendor-change-evidence` candidate's narrowest claim: a
customer-selected public vendor page can produce a source-linked record of a
substantive text change without pretending to decide its contractual meaning.

Run it with:

```sh
python3 -m pytest -q portfolio/pipeline/probes/vendor-change-watch/test_watch.py
python3 portfolio/pipeline/probes/vendor-change-watch/watch.py \
  portfolio/pipeline/probes/vendor-change-watch/fixtures/before.json \
  portfolio/pipeline/probes/vendor-change-watch/fixtures/after.json \
  /tmp/vendor-change-report.json
```

The fixtures stand in for fetches from a customer-selected public page. A
failed fetch is `inconclusive`, never `unchanged`; a changed page retains the
raw before/after text and a unified diff. The artifact is a local experiment,
not legal advice, contract interpretation, or demand evidence.

Result on 2026-08-24: the sample records a subprocessor-page change while
preserving the source and fetch metadata. A second fixture exercises a failed
fetch so silence cannot be mistaken for stability. The remaining experiment is
distribution: show the record to security, procurement, or privacy
practitioners and test whether three will provide watch lists and one will
pilot at EUR50/month, as specified in the candidate.
