# Safe Ingest Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first safe ingest-planning core for a Mac/iPhone media automation product.

**Architecture:** Keep file-safety decisions in a small Rust library that can later be called by SwiftUI apps or a CLI. The library plans copy-then-verify operations but does not execute copies or delete source media.

**Tech Stack:** Rust 2021, Cargo integration tests, standard library only.

---

## File structure

- `Cargo.toml` defines the Rust package.
- `src/lib.rs` exposes media classification and ingest-plan types.
- `tests/ingest_plan.rs` verifies behavior through the public API.
- `README.md` describes current capability and product direction.
- `docs/design-decisions.md` records durable architecture and safety choices.
- `docs/product-strategy.md` records audience, wedge, and viability.
- `docs/legal/terms-and-conditions.md` records draft legal language for counsel.

## Tasks

### Task 1: Test the desired ingest behavior

- [x] Add integration tests for media classification.
- [x] Add integration tests for copy-then-verify plan shape.
- [x] Add integration tests for outside-root rejection.
- [x] Add integration tests for destination collision rejection.
- [x] Run `cargo test` and confirm the tests fail because the API is missing.

### Task 2: Implement the ingest planner

- [x] Add public `MediaKind`, `IngestFile`, `IngestPlanOptions`, `IngestOperationKind`, `IngestOperation`, and `IngestPlan` types.
- [x] Add `IngestPlanError` with clear display messages.
- [x] Implement lexical path normalization for deterministic planning without requiring files to exist on disk.
- [x] Implement `build_ingest_plan` with source-root validation, safe shoot-slug validation, absolute path validation, bucketed destinations, collision checks, reserved destination checks, and zero delete operations.
- [x] Run `cargo test` and confirm all tests pass.

### Task 3: Document product and safety decisions

- [x] Update the README with current capability.
- [x] Add product strategy notes for photographers and videographers.
- [x] Add design decisions for safe ingest, parallel processing, and VLM usage.
- [x] Add draft terms and indemnification notes for legal review.

### Task 4: Review-driven safety hardening

- [x] Add regression tests for path-traversal shoot slugs.
- [x] Add regression tests for caller-provided reserved destinations.
- [x] Add regression tests for relative source paths.
- [x] Add regression tests for relative reserved destination paths.
- [x] Update the planner to reject unsafe slugs, relative paths, and reserved destination collisions.
- [x] Update documentation to clarify the current API contract and defer symlink-aware filesystem walking to copy execution.

## Self-review

- The plan is scoped to one implementation slice: safe ingest planning.
- Color grading, VLM critique, SD-card detection, symlink-aware copy execution, hashing, and reel assembly are intentionally documented as next stages, not hidden in this slice.
- No placeholders remain; every checked item corresponds to files in this branch.
