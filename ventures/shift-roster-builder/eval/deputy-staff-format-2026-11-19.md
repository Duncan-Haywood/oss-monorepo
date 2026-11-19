# Deputy's staff resources, as an open-source client shows them (2026-11-19)

**Why.** `flagships.yaml` listed "Deputy staff and wages from its API" as buildable: rosters came in by API
(`import-deputy.mjs`, 2026-11-17) but people and pay still came by CSV.

**Source.** `git clone https://github.com/communityds/deputy-api-wrapper` (MIT, read 2026-11-19), the same client
`eval/deputy-api-format-2026-11-17.md` used. Its `src/Model/*.php` doc blocks list each resource's properties in
camelCase; its mock INFO answers (`tests/Adapter/MockClient.php`) spell the same fields in PascalCase (`Active`,
`Company`, `OperationalUnitName`, `DisplayName`), which is how the resource API sends them.

| Resource | Fields read | Meaning taken |
| --- | --- | --- |
| Employee | `Id`, `DisplayName`, `FirstName`, `OtherName`, `LastName`, `Active`, `Company`, `TerminationDate` | a person; `Company` their main location |
| EmployeeAgreement | `Id`, `EmployeeId`, `Active`, `BaseRate` (float), `PayPoint` (a Company id), `StartDate`, `EndDate`, `SalaryPayRule` | a pay agreement; `BaseRate` the hourly rate, `PayPoint` where it pays |
| EmployeeWorkplace | `Id`, `EmployeeId`, `Company`, `Agreement1..3`, `SortOrder` | one location a person works at and the agreements that pay there |
| Company | `Id`, `CompanyName` | location names |

Not read: `EmploymentContract`/`PayRules` (award interpretation: penalty rates, overtime rules), `EmployeeAvailability`
(a separate resource, would be the next reader), the OperationalUnit association `RosterEmployeeOperationalUnit`
(which areas a person may be rostered to; its answer shape is not in the wrapper's mocks, so roles are not guessed).

**Not claimed.** No Deputy account, token or real response was used. That `BaseRate` is the hourly rate (and not, for a
salaried agreement, something else), that `PayPoint` is a Company id, and that a workplace's `Agreement1` is the
agreement paying there are readings of the field names and types, not checked against a live install. The fetch's
`Active eq true` search follows the search syntax Google's Apache-2.0 client uses for the roster fetch.
