# Development Quality & Completeness Framework

This document defines the quality standards and completeness requirements for all ventures and the platform. It serves as the baseline for product maturity and readiness.

## Scope note: reference material, not a work queue

**Updated 2026-08-24 for [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md).**
This is a checklist to reach for when a product has users and something in here
would fix a problem they are actually having. It is not a mandate to spend
sessions raising tier scores, and a tier number is not a goal.
[`portfolio/pipeline/distribution-first.md`](portfolio/pipeline/distribution-first.md)
and [`portfolio/ledger/break-even.md`](portfolio/ledger/break-even.md) reach the
same conclusion from the cost and distribution angles: polishing an unshipped,
unmeasured product is the more expensive mistake than shipping something
imperfect and finding out whether anyone uses it.

Three things this document no longer implies:

- **It is not a review gate.** Human code review was removed from the dev flow:
  you verify by running the tests, the linter, and the product itself, and merge
  when CI is green. What still needs the account owner is the short owner-only
  list in `DIRECTION.md`, not this framework.
- **It is not the default next task.** The default is putting something a
  stranger can already run on a public URL. If `main` has undeployed
  products, that deploy outranks this tier chart and outranks the next
  `build-now` candidate. Host is GitHub Pages or the Hetzner product box
  ([`portfolio/hosting/README.md`](portfolio/hosting/README.md)). See
  [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md)
  "Current priority". `python3 portfolio/ledger/session_gate.py` names a
  concrete target in two seconds; take that over the roadmap here.
- **It does not outrank the five things every product ships** — license,
  disclaimer, privacy line, usage counting, and discoverability. Those are in
  [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) and they are the real definition
  of done. A Tier 3 product that a stranger cannot find or safely use has failed
  at something this tier chart does not measure.

Use it as reference — the checklists below are good ones — in the order the
product's own users would rank them.

## Quality Tiers

### Tier 1: Foundation (Minimum)
Every venture in the portfolio must meet these baseline standards:

- **Documentation**
  - [ ] `VENTURE.yaml` with complete metadata
  - [ ] `README.md` with project description, setup instructions, and usage guide
  - [ ] Contributing guidelines (if applicable)
  - [ ] License clearly stated

- **Version Control**
  - [ ] `.gitignore` properly configured
  - [ ] No secrets or credentials in version control
  - [ ] Clean commit history with descriptive messages
  - [ ] Protected main branch with PR requirements

- **Project Structure**
  - [ ] Clear, organized directory layout
  - [ ] Separated concerns (source, tests, docs, config)
  - [ ] Standard naming conventions followed
  - [ ] No orphaned or unused files

### Tier 2: Maturity (Strongly Encouraged)
Ventures targeting customer release should meet these standards:

- **Testing**
  - [ ] Unit tests for core logic (minimum 50% coverage)
  - [ ] Integration tests for critical paths
  - [ ] Test documentation and examples
  - [ ] CI/CD pipeline running tests on all PRs
  - [ ] Test results visible in PR checks

- **Code Quality**
  - [ ] Linting configured and passing (`eslint`, `pylint`, `cargo clippy`, etc.)
  - [ ] Code formatting standard (`prettier`, `black`, `rustfmt`, etc.)
  - [ ] Type checking enabled where applicable (`TypeScript`, `mypy`, `mypy`)
  - [ ] No high-severity or critical warnings in linters

- **Package Management**
  - [ ] `package.json`, `requirements.txt`, `Cargo.toml`, etc. present
  - [ ] Lock files committed (`package-lock.json`, `Cargo.lock`, etc.)
  - [ ] Dependency versions pinned and documented
  - [ ] Regular security audits and updates via CI/CD

- **Documentation**
  - [ ] API documentation (JSDoc, docstrings, etc.)
  - [ ] Architecture decision records (ADRs) for major choices
  - [ ] Deployment and environment setup guides
  - [ ] Troubleshooting and FAQ sections

### Tier 3: Excellence (Production-Ready)
Ventures with active users must meet these standards:

- **Observability**
  - [ ] Error tracking and logging configured
  - [ ] Performance monitoring in place
  - [ ] User analytics (privacy-respecting)
  - [ ] Health checks and status endpoints
  - [ ] Alerting on critical issues

- **Security**
  - [ ] Security audit completed (self or third-party)
  - [ ] No known vulnerabilities in dependencies
  - [ ] OWASP top 10 mitigations implemented (where applicable)
  - [ ] Security headers configured (web apps)
  - [ ] Authentication/authorization properly implemented

- **Performance**
  - [ ] Load testing completed
  - [ ] Performance targets defined and met
  - [ ] Response time SLAs documented
  - [ ] Database query optimization completed
  - [ ] Asset optimization (images, bundles, etc.)

- **User Experience**
  - [ ] Accessibility tested (WCAG 2.1 AA minimum)
  - [ ] Cross-browser/device testing completed
  - [ ] Error messages are user-friendly
  - [ ] Onboarding flow documented
  - [ ] Support channels established

## Venture-Specific Quality Profiles

### Web Applications
- Framework configured correctly (Next.js, React, Vue, etc.)
- Static type checking enabled (TypeScript)
- Database migrations versioned and tested
- Environment variables documented and validated
- Build process reproducible and fast (<5 min)
- Deployed to staging environment
- E2E tests for critical user journeys

### Desktop/Mobile Apps
- Code signing configured
- Automated builds working
- Auto-update mechanism tested
- Offline functionality (where applicable)
- Native platform guidelines followed
- Device/OS testing matrix completed

### Data Processing/ML
- Data pipeline documented
- Model versioning and tracking
- Experiment tracking enabled
- Data quality checks in place
- Reproducible results documented
- Bias and fairness assessment completed

### Command-Line Tools
- Help text and man pages complete
- Exit codes documented
- Input validation robust
- Error messages actionable
- Shell completion scripts (bash/zsh)
- Installation and usage documented

## Quality Metrics & Tracking

### Completeness Checklist
Each venture should track its progress against the appropriate tier using:

```
# Venture Completeness Status

## Foundation (Tier 1)
- [ ] Documentation complete
- [ ] Version control clean
- [ ] Project structure organized

## Maturity (Tier 2)  
- [ ] Unit tests present
- [ ] Linting configured
- [ ] Type checking enabled
- [ ] Documentation complete

## Excellence (Tier 3)
- [ ] Observability configured
- [ ] Security audit complete
- [ ] Performance targets met
- [ ] UX tested and documented
```

### Recommended CI Checks
All ventures should run these checks in CI:

```yaml
- Linting (appropriate to language)
- Type checking (if applicable)
- Tests (minimum coverage threshold)
- Security scanning (dependencies, secrets)
- Documentation generation
- Build verification
```

## Implementation Strategy

There is no scheduled multi-week rollout of this framework, and no session
should spend a whole pass auditing ventures against it — that is the
meta-work `portfolio/DIRECTION.md` asks sessions to stop doing. Apply these
tiers opportunistically, in order of actual value:

- **When you're already in a venture's code for a feature or a fix**, bring
  the file you're touching up to Tier 1 basics (valid `VENTURE.yaml`, no
  secrets, a README that says what the thing does) as part of that same PR.
- **Before a product goes live to real users**, make sure it has the
  liability disclaimer and usage tracking `portfolio/DIRECTION.md` requires
  of every shipped product — that is the one Tier-3-ish item that is not
  optional.
- **Everything else here** (full test coverage, load testing, accessibility
  audits, ADRs) is worth doing when it's cheap and you're already there, and
  is not worth blocking a launch on.

## Quality Governance

Per `CLAUDE.md`'s "Ship without review ceremony": merge on green CI, no
human review gate. The items below are things to check yourself before
merging your own work, not a review cycle to wait on anyone for.

### Before merging your own PR
- Run the venture's own CI-equivalent checks locally if CI hasn't reported yet
- Fix what's cheap to fix (lint auto-fix, obvious type errors); don't let a
  cosmetic issue hold back a working feature
- If it has a liability-relevant surface (user data, financial/medical/legal
  claims), make sure the disclaimer required by `portfolio/DIRECTION.md` is
  actually in the product, not just planned
- Secrets and credentials never go in version control — that one blocks a
  merge, full stop

### Escalation Path
- Linting/formatting: auto-fix with pre-commit hooks where available
- Test failures on code you touched: fix them before merging, but don't block
  an otherwise-working product on unrelated pre-existing failures — file them
  and keep shipping
- Security issues (secrets committed, known-critical dependency CVE): fix
  before merging
- Missing docs/tests on a fast-moving product: a follow-up note, not a
  blocker

## Measuring Success

The metric that matters is the one `portfolio/DIRECTION.md` asks for:
**products shipped that a real person can use, and whether they actually use
them.** Everything below this is secondary to that:

- **Shipped**: new products/features live on the VM or in a repo people can
  use today
- **Usage**: recorded usage numbers (requests, active users, feature-use
  counts) per shipped product — an unmeasured product tells you nothing
- **Coverage**: % of ventures at each tier (useful context, not the goal)
- **Stability**: test pass rate and incident count on things people depend on

## Resources & Tools

### Testing Frameworks
- JavaScript: Jest, Vitest, Playwright
- Python: pytest, unittest, coverage.py
- Rust: cargo test
- Go: testing package

### Linting & Formatting
- JavaScript: ESLint, Prettier
- Python: pylint, black, isort
- Rust: clippy, rustfmt
- Go: golint, gofmt

### CI/CD Platforms
- GitHub Actions (primary)
- Local validation with pre-commit hooks

### Security & Dependency Management
- Dependabot for automated updates
- npm/pip audit for vulnerability scanning
- OWASP dependency-check integration

## Updating This Framework

This framework evolves as the portfolio matures. Proposed changes are
agent-decidable like any other doc change per `CLAUDE.md` — no discussion
cycle required, just make the edit and note what changed.

---

**Last Updated**: 2026-08-24
**Current Focus**: Ship products people use; apply these tiers opportunistically, not as a standalone project.
