# Static application security testing

`docs/ENGINEERING-ROADMAP.md` requires SAST to be a required check. Until
2026-08-01 nothing in the repository ran one. `.gitea/workflows/security.yml`
had a secret scanner (gitleaks), a dependency and misconfiguration scanner
(trivy), and a repository policy scanner of our own — and no tool that read the
application source looking for vulnerable code.

## What runs

`scripts/ci/sast_scan.py`, from the `sast` job in
[the security workflow](../.gitea/workflows/security.yml):

| Tool | Scope | Threshold |
| --- | --- | --- |
| Semgrep, ruleset `p/default` (1074 rules) | every tracked file it can parse | all severities |
| Bandit | Python | medium severity and above |

It writes `sast-report.md`, retained as a build artifact for 30 days, and exits
non-zero on any finding that is not in
[the baseline register](../platform/sast-baseline.yaml).

## Why `p/default` and not the language packs

This matters, because the obvious configuration is close to useless and looks
identical from the outside.

The first version of this gate used `p/javascript`, `p/typescript`, `p/python`
and `p/nextjs`. Measured on 2026-08-01 against three deliberately vulnerable
probe files:

| Probe | Narrow packs | `p/default` |
| --- | --- | --- |
| `eval(userInput)` in `.ts` | not detected | detected |
| `eval(userInput)` in `.js` | not detected | detected |
| `exec("ls " + userInput)` | not detected | detected |

The narrow combination loaded 74 rules for a TypeScript file and found none of
these. It reported 3 findings across 710 TypeScript files and would have passed
CI as a green "SAST" check while detecting essentially nothing in the largest
part of the codebase. `p/default` loads 1074 rules and reports 193.

If this configuration is ever narrowed, re-run that measurement first.

## The baseline register

Two kinds of entry, and the distinction is the point of the file.

**`reviewed`** — somebody read the finding, established why it is not
exploitable, and wrote that down. The gate enforces a minimum reason length;
"false positive" does not pass. There are 4, covering a sanitized email
template, a JSON-LD script block, and two `/tmp` string literals that are the
subject of negative tests.

**`inherited`** — present when the gate was switched on, counted but not
individually assessed. There are 73, covering 191 findings. Claiming each had
been cleared in the hour the gate was written would have been untrue, and a
register full of untrue statements is one nobody re-reads. Each carries a
`plan` rather than a justification, and a 90-day expiry rather than 180.

Both are enforced identically and in both directions:

- a finding not in the register fails the run — the new vulnerability;
- a count higher than declared fails — a new occurrence hiding among known ones;
- a count lower than declared fails — a stale waiver, which would otherwise sit
  there ready to silently cover the next finding of that rule in that file;
- an expired entry fails.

Matching is on `(tool, rule, path)` and never on line number. A line-keyed
baseline churns on every unrelated edit above a finding, and a register that has
to be regenerated after unrelated edits gets regenerated without being read.

`path` is an exact path, not a glob, so a new file cannot inherit an existing
waiver.

## Adding an entry

Fix the finding if you can. If you cannot, add to
`platform/sast-baseline.yaml`:

```yaml
  - id: SAST-0NN
    tool: semgrep            # or bandit
    rule: <check_id from sast-report.md>
    path: <exact repository-relative path>
    count: <exact number of occurrences>
    status: reviewed
    owner: <person>
    issue: docs/SAST.md#sast-0nn
    expires: <at most 180 days out>
    reason: >-
      Why this specific occurrence cannot be exploited. At least 20 words, and
      it should name the control that makes it safe.
```

A finding you understand and have decided to accept is not a baseline entry —
it is a `SEC-xxx` in [the security audit log](SECURITY_AUDIT_LOG.md).

## Inherited findings

Remediation order, highest value first. Counts are occurrences.

| Rule | Count | Severity | Next step |
| --- | --- | --- | --- |
| `run-shell-injection` (GitHub Actions) | 6 | error | Move the `${{ }}` input into an `env:` block and reference `"$VAR"` in the script. All six are `workflow_dispatch` inputs in `ventures/local-site-studio/.github/workflows/`, so exploitation needs dispatch access — but this is the classic Actions injection shape and it should not be the pattern in the repository. |
| `detect-child-process` / `dangerous-spawn-shell` / `spawn-shell-true` | 7 | error | `platform/ci/src/pipeline.mjs` and `ventures/retail-pilot-intel/scripts/ci.ts`. Convert to array-argument spawn without a shell. |
| `gha-curl-pipe-shell` | 3 | error | Replace `curl … \| sh` with download, checksum against a pinned digest, then execute — the pattern `.gitea/workflows/ci-cd.yml` already uses for actionlint. |
| ~~`detected-bcrypt-hash`~~ | 0 | — | Resolved 2026-08-05. The literal was the stand-in hash the login route compared against for a non-existent account, pinned at cost 12 while `hashPassword` could issue less; it is now derived at run time by `absentAccountHash()` so the two costs cannot drift. Entry removed from the register. |
| `missing-user-entrypoint` | 1 | error | Add a non-root `USER` to the agent-runner image, as SEC-014 did for the homepage image. |
| `github-actions-mutable-action-tag` | 59 | warning | Pin venture-local `.github/` workflow actions to full commit SHAs. The `.gitea/workflows/` set is already pinned. |
| `path-join-resolve-traversal` | 31 | warning | Mostly CI paths and test fixtures. Assess whether any joined segment can originate outside the repository. |
| `allow-privilege-escalation-no-securitycontext` / `run-as-non-root` | 24 | warning/info | Mechanical `securityContext` additions across `platform/k8s`; worth one change. |
| `unsafe-formatstring` | 45 | info | Largest and lowest-severity group, all in `local-site-studio`. Most are template literals in log and error strings. |
| everything else | 14 | mixed | See the `plan` field on each entry. |

## Reviewed findings

An entry marked `reviewed` claims somebody read the finding and can say why it
is not exploitable. That claim needs somewhere to live at more than the length
a YAML `reason` invites, so it lives here, and the entry's `issue` field points
at it.

Every `reviewed` entry's `issue` now resolves. Until 2026-08-06 four of them —
SAST-001, SAST-002, SAST-004 and SAST-005 — pointed at `docs/SAST.md#sast-0nn`
anchors nobody had written, and nothing checked, because `issue` was a required
field four controls demanded and none had ever opened. The 61 `inherited`
entries share the [Inherited findings](#inherited-findings) anchor, which is
what that section is for and is not a gap.

`scripts/ci/register_claims.py` now resolves every `issue:` in this register and
fails on one that names a file or a heading that does not exist. The four
sections below were written from the code, not generated from their `reason`
fields: an empty section that satisfies an anchor check would be the same defect
one level down.

### SAST-001

`raw-html-format`, one occurrence in
`ventures/local-site-studio/src/app/api/contact/[slug]/route.ts`.

The contact endpoint sends a notification email whose body is built by string
interpolation, which is what the rule fires on. Every interpolated value passes
through `escapeHtmlForEmail` (`src/lib/inquiries/reply.ts:33`) first, which
replaces `&`, `<`, `>`, `"` and `'` with entities — the five that matter, and in
that order, so the ampersand rewrite cannot double-escape the entities the later
rules introduce. `plainTextToEmailHtml` on line 44 is the only other path into
the template and it calls the same function before splitting into paragraphs.

Semgrep does not recognise a project's own sanitizer, so it sees the
interpolation and not the escape. Every interpolation site in the template was
read on 2026-08-01 and again on 2026-08-06; there is no unescaped one.

Revisit if the template gains a value that is inserted without passing through
`escapeHtmlForEmail`, or if the email body moves to a renderer that reintroduces
raw HTML. The rule firing again after such a change would be correct.

### SAST-002

`react-dangerouslysetinnerhtml`, one occurrence in
`ventures/local-site-studio/src/app/preview/[slug]/page.tsx`.

The call emits an `application/ld+json` structured-data block. This is the one
case where React offers no alternative: JSON-LD has to be script content, and
script content cannot be set as text.

The value goes through `safeJsonLdScript` (`src/lib/seo.ts:69`), which is
`JSON.stringify(jsonLd).replace(/</g, "\\u003c")`. That is the standard defence
and it is total rather than heuristic: the only way out of a JSON string inside
a `<script>` element is a literal `</script>`, and escaping every `<` makes that
sequence unrepresentable in the output while `JSON.parse` still recovers an
identical object. The rule fires on any non-constant argument and cannot see
that the helper admits no input it fails on.

This page is public and unauthenticated, so the assessment matters more here
than the rule's confidence suggests. Revisit if anything is ever inserted into
that script element without going through `safeJsonLdScript`.

### SAST-004

Bandit `B108` (`hardcoded_tmp_directory`), one occurrence in
`ventures/photo-editing/tests/test_assembly.py`.

The match is the string `/tmp/instagram_reel.mp4` at line 639, assigned as the
`outputs` of a render task in a deliberately malformed manifest. The next two
lines write that manifest and assert that `load_render_tasks_manifest` raises
`AssemblyPlanError` matching "Unsafe render task output path".

So the literal is the attack, not a temporary file: it is a workspace-escaping
absolute path fed to a loader whose job is to reject exactly that, and the test
immediately above it does the same for the input side. Nothing is created at or
read from `/tmp` — the manifest is written under a `TemporaryDirectory`, and the
loader raises before touching the declared output. Removing the literal to
satisfy Bandit would delete the test's subject and leave the path traversal
guard uncovered.

Revisit if the assertion ever stops being a rejection.

### SAST-005

Bandit `B108` (`hardcoded_tmp_directory`), one occurrence in
`ventures/photo-editing/tests/test_production_status_cli.py`.

The match is `/tmp/missing-ingest-manifest.json` at line 802, passed as
`--ingest-manifest` alongside `--use-production-status`. The assertions are that
the CLI exits 1, writes nothing to stdout, and reports "cannot be combined" on
stderr.

The path is never opened. The two flags are mutually exclusive and argument
handling rejects the combination before any file is read, which is what the test
exists to pin — the literal only has to be a syntactically valid path that does
not exist, and its non-existence is part of the fixture. Bandit matches the
`/tmp` prefix textually and cannot see that the value is never used as a
filesystem location.

Revisit if the CLI ever reads the manifest before validating flag combinations,
which would make this an ordering bug rather than a false positive.

### SAST-090

`detect-non-literal-regexp`, three occurrences in
`ventures/quick-pick-survey/src/lib/retentionWindow.test.ts`.

The file is a source contract: it reads the three rate limiters and asserts each
declares its retention through `checkedRetentionMs`, against its own window
constant. To do that it builds a pattern per limiter from that limiter's
constant names, which is what the rule fires on.

Not exploitable, and the reason is the shape of the input rather than a control
wrapped around it. Every interpolated value comes from `LIMITER_SOURCES`, a
`const [...] as const` literal 25 lines above, holding three fixed records of
identifier names. No request, environment variable, file read, or test parameter
reaches the pattern; changing what it matches means editing the literal. The
constructed regexes are then run over source files this repository ships, so
neither injection nor backtracking has an attacker-supplied side, and the file
is never bundled.

Writing the patterns as literals would repeat each limiter's constant names in a
fourth place, which is exactly the drift the contract exists to catch. Revisit
if `LIMITER_SOURCES` ever stops being a literal in this file.

### SAST-091 — withdrawn, the code it described is gone

This section used to justify a waiver for two `detect-non-literal-regexp`
findings in `ventures/local-site-studio/src/lib/pricing/tier-price-binding.test.ts`,
which built `new RegExp("\\b" + tier.token + "\\b")` to bind an advertised
amount to the tier it is advertised under.

It was resolved by fixing the code rather than waiving it (`ad560a0e`): the
match is now a literal `String.indexOf` scan with hand-rolled word-boundary
semantics, and the dynamic patterns are gone. That was the stronger choice for
a reason unrelated to security — the regex was also *wrong*: `Growth+` matched
`Growthh`, and a tier named `Starter (Pro)` threw at import. A regression test
pins the metacharacter cases.

There is no `SAST-091` entry in `platform/sast-baseline.yaml`, and there should
not be: the two-directional gate treats a waiver whose finding no longer
reproduces as a failure, so a stale waiver here would go red exactly as an
unregistered finding does.

Kept as history because the live-voice version of this section outlived the fix
and was read as a current waiver more than once. Nothing checks prose in this
file against the register — `sast_scan.py` validates that an entry's `issue`
field is present, never that the anchor it names still describes anything.

## Known limits

State these rather than discovering them later.

- **The counts are load-sensitive, and degrade in the direction that looks like
  a code change.** Semgrep applies a per-file timeout. A file that hits it is
  reported as partially parsed and its findings are simply absent — so on a busy
  machine the partial-parse count rises *and* individual `count:` values fall,
  with no error saying either happened. Measured 2026-08-05 on this repository:
  a full scan run while a test suite was running reported
  `path-join-resolve-traversal` in `platform/ci/src/pipeline.mjs` as 29
  occurrences and 54 partially-parsed files; a second full run reported 31 and
  56; scanning that one file on its own, twice, reported 31 both times. The
  register's 31 was correct the whole time.

  This matters more than the flapping itself, because of what the failure invites
  you to do. The gate says `now occurs 29x, baseline allows 31 — lower the
  count`, and lowering it is a one-line edit that makes the gate green. It is
  also wrong: it permanently under-reserves a real finding, and the next quiet
  run fails in the opposite direction. **Never move a `count:` or the
  `semgrep_unparsed_max` ceiling on the strength of one full-scan number.**
  Re-measure the specific file on its own, on an otherwise idle machine, twice,
  and move the register only to a number that reproduces. A count that will not
  reproduce is a measurement problem, not a register problem.

- **The unparsed set used to flap, and no longer does. Resolved 2026-08-08.**
  Two full scans on an idle machine, minutes apart, once both reported 54 files
  — but not the same 54. Between them
  `ventures/quick-pick-survey/src/lib/ogCardFields.ts` left the set (fixed) and
  `ventures/local-site-studio/src/lib/process/prompt_process.tsx` entered it,
  untouched by either run. Membership was decided by wall-clock: semgrep's
  per-rule-per-file timeout defaults to 5s, a timeout is reported at
  `level: warn` exactly as a parse failure is, and `run_semgrep` folded both
  into one set.

  Two changes fixed it, and both were needed. `--timeout=0` removes the
  wall-clock term, so membership follows the grammar alone. And the `warn`
  errors are now partitioned on their tag against an allowlist,
  `SEMGREP_FILE_PROPERTY_WARNINGS`: only tags that describe a *file* may enter
  the set, while anything else — a timeout above all — describes the *run* and
  raises `ScanError`. A degraded run now fails loudly instead of quietly
  rewriting the register in either direction. That second half matters more
  than the flag: without it, a future semgrep whose timeout is not fully
  disabled by `--timeout=0` would silently reintroduce the same defect.

  Evidence, all on one tree at load average 326. With the default timeout: 57
  files, including 9 `Timeout` warnings over 5 files. With `--timeout=0`: two
  consecutive scans producing byte-identical 52-file sets, zero timeouts. The
  earlier account in this document was right about the mechanism and wrong
  about the remedy — `prompt_process.tsx` really does sit on the timeout
  boundary, but it never fails to *parse*, so it was never a grammar problem
  and no amount of fixing files would have settled the set.

  Two tags are on the allowlist, not one. Besides `PartialParsing`, semgrep
  reports `Other syntax error` for the three Helm templates under
  `platform/terraform/helm/`, whose Go templating is not valid YAML. That is as
  deterministic as a grammar rejection and belongs in the register; a
  first pass that allowed only `PartialParsing` turned the gate red on those
  three files, which is how the distinction was found.

- **`coverage.semgrep_unparsed_max` is not cap-ratcheted.** Every other ceiling
  in this repository has its floor pinned to the lowest value it has ever held
  by `scripts/ci/cap_ratchet.py`, precisely because the tempting response to a
  failing ceiling is to raise it. This one is watched by nothing, so raising it
  costs a single line and no review, and — per the limit above — a contended run
  produces exactly the pressure to do so. Enrolling it is open work.

- **The rule set is not pinned.** The tool version is pinned in
  `requirements-sast.txt`; `p/default` is resolved from the Semgrep registry at
  run time. A registry update that adds a rule can turn the job red without
  anything here changing. That is the accepted trade — the alternative is
  vendoring 1074 rules and never learning about a new one — but it means a red
  SAST job is not automatically someone's regression.
- **52 files are only partially parsed.** Semgrep's grammar rejects some
  constructs (`>()` on a generic arrow, a bare `&` in JSX text; Go templating in
  the Helm templates; `${{ }}` in workflow YAML); it scans the file up to that
  point and warns rather than erroring. Those files are therefore not fully
  covered. They are named one per line in `coverage.semgrep_unparsed` in
  `platform/sast-baseline.yaml`, and the gate compares that list to what the run
  observed in both directions: a file that newly stops parsing fails, and a file
  that starts parsing again must be struck from the list, so recovered coverage
  is not quietly given back. `coverage.semgrep_unparsed_max` bounds the size of
  the list itself. Do not look for the affected files in `sast-report.md` —
  that file is gitignored, so it only ever existed on whichever machine last ran
  a scan, which is why the identity of the unscanned set is committed here.
- **Bandit is gated at medium severity.** At low severity it adds 88 findings,
  42 of them `assert` in test files and 44 `subprocess` calls in CI scripts
  using list arguments and no shell. The full count is in the report.
- **`nosemgrep` is an escape hatch and is registered as one.**
  `scripts/ci/audit_exceptions.py` detects it as a `scanner-suppression`, so
  suppressing a finding at the source requires an entry in
  [the exception register](EXCEPTION-REGISTER.md) with an owner and an expiry.
  Without that, a finding could be silenced one line at a time and this register
  would never see it.
- **Trivy license scanning is still not enabled**, and should not be enabled
  naively. Measured 2026-08-01: `trivy fs --scanners license` returns zero
  findings on this repository, but only because it cannot read licences without
  `node_modules` installed — it logs `"npm install" needs to be performed
  beforehand` and reports clean. Turning it on in the `scan` job, which does not
  install dependencies, would add a permanently green check that measures
  nothing. It needs an install step first.

## Verifying the gate still binds

A scanner that cannot fail is the defect this repository keeps finding in its
own controls. `tests/test_sast_scan.py` covers the register logic and the
fail-closed paths, and `platform/ci/test/sast-workflow-contract.test.mjs` holds
the workflow to invoking the scanner and installing its tools. Neither proves
the scanner detects a real vulnerability. That was checked by hand on
2026-08-01 by adding files containing `subprocess.run(..., shell=True)` with
interpolated input and `eval(input)` in TypeScript; the gate failed on each,
naming the file and rule, and passed again once removed. Repeat that after any
change to `SEMGREP_CONFIGS`.
