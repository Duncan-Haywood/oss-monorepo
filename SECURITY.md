# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **GitHub private vulnerability reporting:** the repository's **Security**
  tab, then **Report a vulnerability**.

Tell us what you found, where (file, page or package and version), and how
to reproduce it. We aim to acknowledge a report within 3 business days and
to fix or mitigate within the deadlines in
[`docs/security/policies/vulnerability-management.md`](docs/security/policies/vulnerability-management.md)
(2 days for critical, 14 for high). We will credit you in the fix unless you
ask us not to.

## Scope

In scope: code in this repository, the site at https://marisstella.app/,
the edge Worker in `platform/edge/`, and the packages this repository
publishes.

Out of scope: third-party services (report those to the vendor), findings
that need a compromised device, volumetric denial of service, and automated
scanner output without a demonstrated impact.

## Safe harbour

Research done in good faith within this policy is authorised: we will not
pursue or support legal action against you for it. Please don't access
other people's data beyond what you need to show the problem, don't degrade
the service, and give us reasonable time to fix before you publish.

## How the portfolio is secured

The security programme, written to the SOC 2 Trust Services Criteria, is in
[`docs/security/`](docs/security/README.md). It is a self-assessment, not an
audit: the portfolio has no SOC 2 report.
