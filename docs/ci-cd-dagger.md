# Monorepo Dagger CI/CD Infrastructure Guide

## Overview

The monorepo utilizes a **programmable, containerized Dagger CI engine** (`platform/ci/`) that provides 100% execution parity between local developer environments and remote CI runners (GitHub Actions & Gitea Actions).

---

## Key Capabilities

1. **Local = CI Parity**: The exact same CI engine runs locally via `bash scripts/verify-all.sh` and inside GitHub/Gitea Actions runners (`.github/workflows/ci-cd.yml`).
2. **BuildKit Caching**: When Docker/Dagger is available, step builds, npm dependencies, and pytest runs are cached automatically.
3. **Monorepo Affected Path Resolution**: The CI engine analyzes `git diff` against `main` to identify changed components. Pull requests only build and verify affected ventures, saving build time.
4. **CI Self-Testing**: The CI infrastructure tests itself! Run `bash scripts/test-ci.sh` to run unit tests on the CI engine, validate security scanner logic, analyze shell scripts with ShellCheck, and lint workflow YAML files with actionlint.
5. **Seamless Host Fallback**: In environments without a Docker/Dagger daemon, the engine seamlessly falls back to isolated host execution, ensuring zero build breakage.

---

## Commands & Usage

### Running Local Verification
- **Run Full Monorepo CI (Affected Paths)**:
  ```bash
  bash scripts/verify-all.sh
  ```
- **Force Run All Ventures**:
  ```bash
  bash scripts/verify-all.sh --all
  ```
- **Target a Specific Venture**:
  ```bash
  bash scripts/verify-all.sh --venture quick-pick-survey
  ```

### Testing the CI Infrastructure
- **Run CI Self-Test Suite**:
  ```bash
  bash scripts/test-ci.sh
  ```
- **Run Dagger CI Unit Tests**:
  ```bash
  npm --prefix platform/ci test
  ```

---

## Directory Layout

```
platform/ci/
├── package.json         # Node module definition for CI engine & tests
├── src/
│   └── pipeline.mjs     # Programmable Dagger CI pipeline engine & runner
└── test/
    └── pipeline.test.mjs # Unit tests for CI engine logic
scripts/
├── verify-all.sh        # Primary monorepo verification entrypoint
├── test-ci.sh           # Dedicated CI self-test runner
└── security/            # Security policy & failure logging scripts
.github/workflows/       # GitHub Actions workflow definitions
.gitea/workflows/        # Gitea Actions workflow definitions
```

---

## Security & Reliability Principles

- **Least Privilege**: All workflows enforce `permissions: contents: read` by default.
- **Action Pinning**: Third-party GitHub Actions are pinned to immutable 40-character commit SHAs.
- **Provider Agnostic Contexts**: Workflows use standard GitHub Action context variables (`github.ref`, `github.sha`, `github.workspace`) supported natively across GitHub and Gitea.
