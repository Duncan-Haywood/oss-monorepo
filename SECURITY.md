# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: the **Security** tab
→ **Report a vulnerability**. Don't open a public issue or pull request for
anything exploitable.

Include the affected path (for a tool, `ventures/<slug>/`), what an attacker
can do, and steps to reproduce. You should get an acknowledgement within a
week. This is a one-person portfolio, so there's no bug bounty.

## Scope

- **In scope:** code in this repository, and the tools it publishes to GitHub
  Pages and `marisstella.dev`. Most tools run entirely in the visitor's
  browser and promise that the visitor's data never leaves their device. A way
  to break that promise is the most important kind of report.
- **Out of scope:** findings that need a compromised machine or browser
  extension, missing hardening headers with no demonstrated impact, and the
  deliberate fake credentials in test fixtures (for example
  `ventures/terraform-plan-secret-exposure-check/*.test.mjs`).

## Contributions from forks

Pull requests from forks are welcome. A human reviews them before they can
merge. The agent review bots that auto-merge internal pull requests skip
forks (`platform/ci/agent_review/review.py`).
