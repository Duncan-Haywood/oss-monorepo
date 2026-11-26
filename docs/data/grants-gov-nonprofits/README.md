# Grants.gov: what a 501(c)(3) can apply for, snapshot

`snapshot.py` reads the keyless [Grants.gov REST API](https://www.grants.gov/api/api-guide)
(search2, then fetchOpportunity per hit) and keeps every **posted** opportunity whose
eligible applicants include code 12 (501(c)(3) nonprofits other than colleges) or
99 (unrestricted). Standard library only.

```
SSL_CERT_FILE=<proxy CA, if any> python3 snapshot.py fetch --out snapshot-YYYY-MM-DD.json
python3 snapshot.py report snapshot-YYYY-MM-DD.json
```

`snapshot-2026-11-26.json` was taken at 2026-11-26T23:42:23Z: 471 opportunities, 471
detail calls, no errors. The post that reads it:
[`docs/posts/2026-11-26-federal-grants-a-small-nonprofit-can-apply-for.md`](../../posts/2026-11-26-federal-grants-a-small-nonprofit-can-apply-for.md).

Limits, stated in the post too:

- "Research" is a heuristic (`is_research`): NIH, NSF, DOD or NASA as agency, or an
  NIH-style activity code such as "(R01)" in the title. It puts a few program
  opportunities in the wrong bucket in both directions.
- Award ceilings of 0 or 1 are placeholders on Grants.gov and are counted as not stated.
  A close date of 2099-01-01 means an open-ended annual program statement.
- Grants.gov lists federal opportunities only. Federal money that reaches a small
  nonprofit through a state agency (a subaward) and foundation grants are not in it.
- Data is a public US government work; the snapshot is committed so the numbers can be
  checked.
