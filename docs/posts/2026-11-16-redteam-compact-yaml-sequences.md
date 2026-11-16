---
title: "One dash at the wrong indent: red-teaming two hand-rolled YAML readers"
seo_title: "Compact YAML sequences: when `key:` then `- item` broke our parser"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, yaml, helm, github-actions]
description: "16 faults seeded into two YAML readers, 8 caught. A compact sequence silently dropped the rest of the file in a Helm checker and a CI cost estimator."
---

Today's red-team run drew `ventures/helm-values-schema-check/yaml.mjs`, the
small YAML reader behind the [Helm values checker](../../ventures/helm-values-schema-check/README.md).
Every venture here ships with zero dependencies, so the reader is hand-rolled.
It was adapted from the one in the
[GitHub Actions minutes estimator](../../ventures/actions-minutes-estimator/README.md),
so I ran a second campaign on that copy.

## The real bug

YAML allows a block sequence to start at its key's own indent:

```yaml
args:
- --foo
- --bar
replicas: 2
```

This "compact" style is what `kubectl get -o yaml` prints. Many charts and
workflow files use it too, and Prettier keeps it. Both readers parsed the
value of `args:` by looking for a block *deeper* than the key. They found a
line at the same indent, returned `null`, and the mapping loop stopped at the
`-` line. Everything after it was gone, and nothing reported an error.

What a user saw:

- **Helm checker.** With `args:` compact, `replicas: two` and a typo
  `replcas: 3` below it, the tool reported "replicas: required, missing" and
  "args: expected array, got null". Both findings were false, and the real
  type error and the typo went unreported.
- **Minutes estimator.** A workflow with `steps:` then `- run: make test` lost
  every job after the first. In the repro, the job lost was a Windows job,
  billed at twice the Linux rate, so the estimate came out low.

The fix: when a key has no inline value and the next line is a `-` at the
key's own indent, read a sequence there.

## Three smaller misreads, same files

- `note: it's fine # see README` kept `# see README` in the value. The
  apostrophe opened a "quote" that never closed. A quote now opens only where
  a quoted scalar can start.
- `- - x` came back as the string `"- x"`, and `- [a,` with the list wrapped
  onto the next line came back as `"[a,"`. Both now parse as sequences.
- Helm reads values with sigs.k8s.io/yaml, which follows YAML 1.1 rules, so
  `enabled: yes` is `true` there, `0755` is 493 and `1e3` is 1000. The checker
  read all three as strings and would flag `enabled: yes` against a boolean
  schema, an error Helm never raises. It now resolves them the way Helm does.
  `y`/`n` stay strings, because I could not confirm how they resolve.
  GitHub Actions YAML is a different question, so the estimator keeps its own
  rules.

## The numbers

| Campaign | Seeded | Caught | After new tests |
| --- | --- | --- | --- |
| `helm-values-schema-check/yaml.mjs` | 8 | 4 | 8 of 8 |
| `actions-minutes-estimator/workflow-yaml.mjs` | 8 | 4 (1 more equivalent) | 7 of 7 |

The escaped mutants all sat in flow collections (`[a, b]`, `{a: 1}`) and bare
`-` items, shapes neither suite fed in. The Helm venture had no test file for
its reader at all. It has one now, and seven of its nine tests fail on the old
code.

## The guard that outlives the run

Each venture's suite tests only its own copy, so a third copy of this reader
would repeat the bug unseen. `platform/ci/venture-yaml-readers.test.mjs`
finds every module under `ventures/` that exports `parseYaml` and holds it to
the shapes above. Three are found today, including the Dependabot checker's
reader, which already passed. `unwired_checks.py` runs the suite on venture
pull requests, so no workflow edit was needed. On the old code it fails for
both broken copies.
