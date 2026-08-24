# Consent change record probe

This probe tests the `consent-change-record` candidate's narrowest claim: a
customer-owned site can produce a reproducible before/after record of observed
requests and storage changes without turning the output into a compliance
assertion.

Run it with:

```sh
python3 -m pytest -q portfolio/pipeline/probes/consent-change-record/test_consent_diff.py
python3 portfolio/pipeline/probes/consent-change-record/consent_diff.py \
  portfolio/pipeline/probes/consent-change-record/fixtures/honest-before.json \
  portfolio/pipeline/probes/consent-change-record/fixtures/honest-after.json \
  /tmp/consent-change-report.json
```

The fixtures stand in for browser captures and contain only request metadata and
storage names. A context mismatch returns `unknown`, not an absence claim. The
artifact is a local experiment, not demand evidence and not a browser-
compliance scanner.

Result on 2026-08-24: the honest fixture records one post-consent analytics
request and one storage key; the early-analytics fixture records no change
because the request is already present before consent. The remaining experiment
is distribution: privately show the report to web agencies or privacy
implementers and test whether three would pay EUR50/month for recurring
evidence. No public listing, account registration, payment, or customer data is
involved.
