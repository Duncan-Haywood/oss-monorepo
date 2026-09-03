# Candidate: Backup verification evidence

**One line.** A free local CLI that turns a backup job's real exit code and
artifact stat into a dated, source-linked verified/suspicious/failed/inconclusive
record, so a silent backup failure never reads as success.

**Verdict: probe.** The artifact is cheap, deterministic, and the liability
boundary is clear (evidence, not a restore guarantee), but demand and
distribution are unmeasured — the first slice has not been shown to a single
practitioner.

Scored 2026-08-24. Composite 6.5 · floor 4 (defensibility, distribution).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 5 | Classification is deterministic (exit code, size, age against named thresholds); a model could later help interpret unfamiliar tool log formats, but the core value does not depend on inference |
| Autonomous ops | 9 | `record` wraps a cron/systemd job and `check` runs unattended in the same job or a separate monitor; no operator queue |
| Time to revenue | 6 | Freelance sysadmins and small MSPs can adopt the CLI immediately; paid conversion depends on an unproven recurring workflow (scheduling, alerting, a portable history) |
| Gross margin | 9 | Local CLI, no hosting, no paid API, no per-customer cost |
| Defensibility | 4 | A generic exit-code-plus-stat checker is trivially copyable; a signed, portable, per-client verification history could compound, but that is untested |
| Distribution | 4 | No owned channel yet; sysadmin/MSP/DevOps communities and cyber-insurance-questionnaire context are plausible but unproven |
| Liability containment | 7 | `verified` is explicitly scoped to "exit code 0 and artifact meets stated size/age expectations," never "your data is safe" or "restorable" — the README and CLI output both say so |
| Ethical robustness | 8 | Processes only metadata the customer already owns (tool name, exit code, file size/timestamp); no personal data, no ranking of people, fully local |

## Boundary

The product is a run-record classifier, not a backup tool, a monitoring
service, or a restore guarantee. It must:

- never run, delete, or upload a customer's actual backup or backup data;
- treat a nonzero exit code as `failed` even if an artifact looks fine, and a
  zero exit code with a missing/undersized/stale artifact as `suspicious`,
  never silently as `verified`;
- report `inconclusive` rather than guessing when required fields are
  missing or a timestamp cannot be parsed;
- never claim an artifact is restorable, uncorrupted, or complete — only that
  it exists and meets the size/age expectations it was given; and
- keep everything local: no network calls, no telemetry beyond an optional,
  content-free local usage counter.

## Why this is distinct

This is not [DNS configuration evidence](dns-configuration-evidence.md) or
[vendor-change evidence](vendor-change-evidence.md): both watch externally
observed state over time; this watches the outcome of a customer's own
scheduled job against its own declared expectations, using only local
filesystem metadata, no network fetch at all. It is not
[repository branch hygiene](repository-branch-hygiene.md): different domain,
different customer, no Git object model involved. It does not overlap any
existing venture in `ventures/` — none currently touch backup jobs.

## Where it can fail

- **Distribution is unproven.** Sysadmins already watch cron output or use
  commercial platforms (Veeam, Duplicati's own reporting) with built-in
  status pages; a bare CLI has to earn a place in an existing workflow.
- **The "restorable" gap is the biggest liability risk if not stated
  clearly.** A customer could read `verified` as "my data is safe." The CLI
  output and README both state the narrower claim on every report; this
  needs to survive contact with real practitioners' expectations.
- **A generic version is copyable in an afternoon.** The wedge, if one
  exists, is a portable per-client verification history and, later, a
  scheduling/alerting layer — neither is built in this slice.

## First experiment

Two weeks, under USD100:

1. Wire the `record`/`check` pair into one real, recurring backup job (this
   repo's own CI or a personal box) for a week and confirm the exit codes it
   reports match reality, including at least one induced failure (kill the
   destination, truncate an artifact) to confirm `suspicious`/`failed` fire
   correctly outside the fixture suite.
2. Show the tool and a sample markdown report to ten practitioners in
   existing sysadmin/MSP/DevOps communities. Ask three whether they would run
   it against a real client backup and one whether a paid, hosted
   scheduling/alerting layer on top would be worth a monthly fee.

Kill it if the probe cannot produce three qualified conversations, or if
practitioners consistently say cron's own exit-code logging already covers
this and a separate tool adds no value.

## Mitigations required by the rubric

The floor scores require named mitigations before graduation. For
defensibility, retain a dated, portable, per-client verification history
(not just point-in-time checks) and measure whether a competitor could
reconstruct the same trend without it. For distribution, secure a named
sysadmin/MSP community or one repeatable practitioner conversation channel
before building any hosted or scheduled component.
