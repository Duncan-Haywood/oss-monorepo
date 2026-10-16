# Commercial Lease Effective Rent Calculator

A free browser tool for small-business tenants (retail, restaurants, clinics, studios, offices, light industrial)
weighing commercial lease offers: **enter up to three offers and see each one's net effective rent, its levelized
all-in cost per square foot, what leaving early costs, and the base rent that would make a worse offer match the best
one.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/commercial-lease-effective-rent-calculator/

After using this, you can now **rank lease offers on what they really cost and go back to the landlord with a
specific rent number**, which used to take a broker's spreadsheet or a lease-analysis subscription.

## Model

- Monthly schedule: base rent = SF x rent / 12, stepped up by the escalation each lease year, zero during free
  rent; operating costs (NNN / CAM / taxes / insurance) = SF x NNN / 12, growing at their own rate, payable during
  free rent unless abated.
- Up-front: (build-out - TI allowance) x SF + one-time costs + deposit (returned at the end of the term).
- Net effective rent = (base rent paid - TI allowance) / years / SF.
- Levelized all-in cost = present value of everything at the tenant's discount rate, divided by the annuity factor,
  shown per SF per year. Offers are ranked on it.
- Counter-offer rent: present value is linear in base rent, so the rent that equalises a worse offer with the best
  one is solved exactly and checked in the tests.
- Early exit: cost to month k over the months stayed, fit-out unrecovered.

Not modelled: percentage rent, personal guarantees, renewal and termination options, restoration obligations, tax
treatment, lease accounting.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of landlords, brokers and listing services; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
