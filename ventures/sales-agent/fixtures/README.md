# Fixtures

`gov-uk-bank-holidays-2026-11-12.json`: GOV.UK's bank holidays list for England and Wales, Scotland and Northern
Ireland, 2019-2028, as served at https://www.gov.uk/bank-holidays.json on 2026-11-12, unmodified. `holidays.test.mjs`
checks the rules in `holidays.mjs` against it date for date.

Contains public sector information licensed under the Open Government Licence v3.0
(https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

`canada-federal-holidays.json`: the observed dates of Canada's federal holidays for 2022-2028, as
https://canada-holidays.ca/api/v1/holidays?year=<y>&federal=true listed them on 2026-11-12 (dates only). That is an
open-source site, not the Government of Canada; canada.ca timed out from this host that day. `holidays.test.mjs`
checks `caFederalHolidays` against it date for date.
