# Monorepo Dagger CI/CD Infrastructure Guide

## Overview

The monorepo uses a **programmable, containerized Dagger CI engine**
(`platform/ci/`) to provide execution parity between local development and the
self-hosted Gitea Actions runners.

---

## Key Capabilities

1. **Local = CI Parity**: The same CI engine runs locally via `bash scripts/verify-all.sh` and in Gitea Actions (`.gitea/workflows/ci-cd.yml`).
2. **BuildKit Caching**: When Docker/Dagger is available, step builds, npm dependencies, and pytest runs are cached automatically.
3. **Monorepo Affected Path Resolution**: The CI engine diffs an explicit range to identify changed components — the branch against its merge target on pull requests, and the whole pushed range (`before...HEAD`) on pushes, so a change in the middle of a multi-commit push is not missed. Only affected ventures are built and verified, saving build time.

   Detection widens rather than narrows when it is unsure. A base it cannot resolve — a new branch, a force-pushed tip that is gone, a shallow checkout, a missing event payload — verifies the whole catalog and logs the reason. Paths that decide how everything is verified (`scripts/`, `platform/ci/`, `tests/`, `pytest.ini`, `requirements-ci.txt`, the coverage baseline and the exception register, and the workflow definitions) also force a full run. This requires `fetch-depth: 0` on the checkout; with the default depth of 1 no base is reachable and every run falls back to the full catalog.
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
.gitea/workflows/        # Gitea Actions workflow definitions
```

---

## Security & Reliability Principles

- **Least Privilege**: All workflows enforce `permissions: contents: read` by default.
- **Action Pinning**: Third-party Actions used by Gitea are pinned to immutable
  40-character commit SHAs.
- **Gitea Contexts**: Workflows use the Actions-compatible context variables
  (`github.ref`, `github.sha`, `github.workspace`) exposed by Gitea.
