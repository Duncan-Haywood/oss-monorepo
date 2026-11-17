---
title: "Quality audit round 56: 0 of 4 at the bar, and a robot-safety result entered in the wrong units"
seo_title: "Quality audit 56: MuJoCo units, workflow audit, grant deadlines"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A MuJoCo face-contact study entered stiffness per kilogram, and a workflow scanner dropped three of its own risks."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-13-*` files whose seed is `2026-11-13-b`. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample` with seed `2026-11-13-b`. Seed `2026-11-13` is already used by round 55, in an open PR. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Counting every sampled audit on `main` plus this round, 31 of 234 meet it (Wilson 95% interval 10% to 18%). Three of the four are finished (completeness 3). The exception is workflow-audit.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/workflow-audit | 2 | 2 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/grant-reporting-tracker | 2 | 3 | 2 | 2 | 2 | 2 | 1 | no |
| research/codesign-aero-cant-propdata | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/osrobot-mjface | 1 | 3 | 1 | 2 | 1 | 1 | 1 | no |

| subject | seeded bugs caught | recomputed outputs right |
|---|---|---|
| workflow-audit | 2 of 5 | 3 of 7 |
| grant-reporting-tracker | 2 of 6 | 2 of 7 |
| codesign-aero-cant-propdata | 1 of 8 | 4 of 6 |
| osrobot-mjface | 1 of 5 | 2 of 6 |

The tests caught 6 of 24 seeded bugs. That is the weakest round on verification in a while. Every subject also failed on correctness, so this is not only a testing problem.

## Verdicts and worst defects

### research/osrobot-mjface (correctness 1)

The reviewer is a robotics simulation researcher who works on physical human-robot interaction safety. The project re-runs an earlier MuJoCo feeding-arm trial. It uses the face stiffness from ISO/TS 15066 (75 N/mm) and the standard's face force limits (65 and 130 N) in place of the earlier assumed 800 N/m and 2 N. Its headline was that the arm is "nowhere near unsafe": every camera-arm trial stays under 65 N.

**The worst defect (high):** the stiffness and damping are passed to MuJoCo's direct `solref="-k -b"`. MuJoCo reads those values per kilogram of effective mass, not as N/m and N·s/m. The auditor showed this with a near-undamped impact. The peak force scaled with the tip mass, not with its square root:

| tip mass | simulated peak | v·√(k·m) | m·v·√k |
|---|---|---|---|
| 0.3 kg | 8.30 N | 15.00 N | 8.22 N |
| 3 kg | 82.96 N | 47.43 N | 82.16 N |

The peak follows the per-kilogram column. I reran that script myself and got those lines. So the simulated face is 22,500 N/m, not 75,000, and every damping label is 3.3 times too high. Re-run with the values divided by the 0.30 kg tip:

- the blocked-arm peak at 0.10 m/s is 11.86 N, not 7.56 N. The standard's own spring formula gives 14.5 N;
- at the highest damping swept (b = 1000), only 0.48 of camera-arm trials at 0.20 m/s stay within 65 N, and the worst peak is about 204 N.

The low-damping rows still pass. The headline as written does not hold.

Other defects:

- **High.** The safety reading on the live page rests on these numbers. It applies no pressure limits.
- **Medium.** There is no baseline against the standard's own impact formula. The README compares the 2× rise with the 94× stiffness ratio, but a spring impact predicts √94 ≈ 9.7×.
- **Medium.** The tests never run the experiment. A safety check that read only the axial force component survived.

### ventures/workflow-audit (correctness 2, completeness 2)

The reviewer is an application-security engineer who reviews GitHub Actions pipelines. The tool bundles eleven single-risk checks behind one GitHub Action and merges what they find.

**The worst defect (high):** the merge layer kept a map from each rule name to a severity, and it dropped any name missing from the map as informational. Three names the bundled checks really emit were missing:

- `artifact-executed-after-untrusted-download` (the map said `artifact-executed`);
- `checkout-persists-credentials-with-upload`;
- `shut-down-version`.

So a `workflow_run` job that downloads a pull request's artifact and runs it produced only a medium finding, and `fail-on: high` passed. The worse of the two checkout-credential shapes produced no finding at all, while the milder shape was reported. I reran the auditor's one-line check and it printed exactly those three names.

Other defects:

- **Medium.** Injection inside an `actions/github-script` `script:` block is missed. So is `workflow_run.head_branch` as an untrusted input.
- **Medium.** The `uses:` reference points into this monorepo, so each job using it downloads about 1 GB.
- **Low.** The help link in every SARIF alert returned 404, and the README said the scan finds 1,182 findings here. Today it finds 13.

### ventures/grant-reporting-tracker (domain 1)

The reviewer is a post-award grants administrator. The tracker lists awards with a reporting interval and shows each one's next report date and status.

**The worst defect (high):** the next report date was the last filed date plus the interval. One late filing pushed every later deadline back. Take an award dated 2026-01-15 that reports every 6 months, with a report filed 2026-08-01. On 2027-01-20 the tracker showed the next report due 2027-02-01, "Due soon". The award's own schedule put it at 2027-01-15, already five days overdue. I reran this and got `2027-02-01 12 Due soon`.

Other defects:

- **Medium.** The due date is the end of each period, with no lag after it. Under 2 CFR 200.329, federal quarterly and semiannual reports are due 30 days after the period ends, and annual reports 90 days after.
- **Medium.** There is no award end date and no final report. Under 2 CFR 200.344 the final report is due 120 days after the period of performance ends.
- **Medium.** No test checked the exact 0-day and 30-day status cutoffs. Two seeded off-by-one bugs there survived.
- **Low.** The explainer page said the smallest award needs attention first. In its own example it is the middle-sized one.

### research/codesign-aero-cant-propdata (verification 1)

The reviewer is a multirotor propulsion researcher. The project computes the reaction-torque-to-thrust ratio c = CP/(2π·CT) from the UIUC Propeller Data Site. It then re-runs an earlier rotor-cant co-design at the measured values.

The auditor downloaded all 205 static-thrust files and parsed them independently. All 160 values in the project's CSV matched within 5e-5, and the median, percentiles and diameter correlation matched the README.

**The worst defect (high):** the served page still showed the cant headline (12.50° against 17.22°, cant better by 2.9° to 4.7°). That headline uses torque limits the parent project corrected on 2026-11-12, but only the README carried the correction. The auditor's own statics model put the inherited yaw limit 2.0× too small at 0° cant and 2.74× too small at 35°.

Other defects:

- **Medium.** The file-name regex silently skips 45 of the 205 files, 27 of them in the diameter range. The README said "every static file". Including the two-blade ones moves the median only from 0.081 to about 0.082.
- **Medium.** 7 of 8 seeded bugs survived the tests.
- **Low.** "160 propellers" are 160 test files. The 77 in range are 75 distinct propellers.

## What was fixed in this round

All fixes are in [PR #15312](https://github.com/Duncan-Haywood/oss-monorepo/pull/15312). The scores above are from before the fixes; a later round will re-audit these subjects.

- **grant-reporting-tracker.** Due dates now stay on the award's own schedule: the award date plus one, two, three intervals, each computed from the award date. A filing marks done the latest scheduled date on or before it, or one up to 30 days after it if it was sent early. The next report is the one after that. New tests cover the late-filing case, an early filing, month-end dates, and the 0, 30 and 31-day status cutoffs. The explainer's false sentence and the README's event list are corrected. The missing lag after each period and the missing final report are written into the README under "Known gaps".
- **workflow-audit.** All three dropped rules now carry a severity. A new test loads every bundled check and fails if any risk it can report has no severity, so the next rename fails CI instead of silently dropping findings. The SARIF help link now points at the served page, and the README count and the `llms.txt` disclaimer are corrected. The detection gaps belong to the source `actions-injection-check` venture and stay open.
- **osrobot-mjface.** The README and the served summary now open with the units correction and the re-run numbers above. Re-running every sweep with the converted values, and rewriting the result, is a larger job and stays open.
- **codesign-aero-cant-propdata.** The served summary now carries the 2026-11-12 torque-limit correction and the skipped-files finding. The README notes the 45 skipped files and the files-versus-propellers count. Fixing the regex and regenerating the CSV stays open.

## What changed since round 54

Round 54 caught 17 of 28 seeded bugs. This round caught 6 of 24. Both rounds had 0 of 4 subjects at the bar. Across all audits, verification is still the gate that most often fails apart from fitness and domain: 94 of 248 audits score 3 or more on it.

Two of this round's worst defects share a pattern. Each passes a value across a boundary the author did not check: MuJoCo's unit convention in one, and the bundled checks' rule names in the other. In both, a short test that read the real other side would have failed: a free-impact peak checked against the standard's formula, and a load of each check's rule list. The workflow-audit test now exists. The MuJoCo one does not yet.
