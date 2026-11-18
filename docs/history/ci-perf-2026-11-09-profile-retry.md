# Perf tooling: ci_profile.py retries truncated API reads (2026-11-09)

Perf track. The reading `ci_profile.py --runs 600 --top 25` died after about
550 runs with `http.client.IncompleteRead` (proxy truncated one jobs response),
losing minutes of work. `http_api` now retries a truncated body, connection
reset or timeout up to three times; HTTP errors still fail at once.
Test: `test_http_api_retries_truncated_body` (14 pass).

No pool reading this run. Open perf items P063 and P064 both edit `.github/`
(CODEOWNERS) and wait for the owner; the gallery search is already 24.9 s to
13.8 s (`ci-perf-2026-11-09-gallery-search-threads.md`). Ranked not-changed:
P063 sparse checkout (22.7 s/job), P064 stamp cache, `Test the site builder`.
