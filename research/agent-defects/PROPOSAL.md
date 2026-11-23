# Proposal: do the usual repository-mining signals find the defects in code written by autonomous agents?

Programme `agent-defects`, opened 2026-11-23 (track 10, the software-engineering
loop, `PROJECTS.md`). Written with AI assistance (Claude Code). This is a plan, not a
result: nothing below has been measured unless it cites a file in this repository.
Citations were checked with `research/_shared/cite_check.py` in the session that
wrote this proposal (see "Related work"). Claims about what a work does come from
its abstract and standard knowledge of the field, not a full re-reading.

## Question

In a repository where autonomous coding-agent sessions write and merge every pull
request with no human review, do the cheap signals that mining-software-repositories
(MSR) research uses to find defect-introducing changes (SZZ fix links, later
follow-up fixes, short-term line survival, reverts, red CI) actually flag the changes
that an independent expert-rubric audit later finds defective? And once the
defects are located by audit rather than by fix, which process choices (task
track, model, prompt version, change size, concurrency) predict them?

It is open for two reasons. First, every SZZ-family method finds a defect only
after someone fixes it and says so in a commit or issue (Śliwerski et al. 2005;
Kim et al. 2006), and its accuracy has been measured against other SZZ outputs or
developer-curated fix sets (da Costa et al. 2017; Rodríguez-Pérez et al. 2020;
Herbold et al. 2022), never against defects found by auditing the code without a
fix. Defects nobody has fixed are invisible to it by construction, and in a
fix-forward agent repository with no human reviewer that may be most of them.
Second, the studies of agent-written pull requests so far (Li et al. 2025, the
AIDev dataset; SWE-bench-style benchmarks) measure acceptance or test pass rates,
not latent defects in merged code.

## Why it matters

Teams adopting coding agents decide how much review to keep, and they are told to
measure agent quality with the signals their dashboards already compute: change
failure rate, revert rate, rework (Forsgren et al. 2018's DORA metrics), and in
research, SZZ-labelled just-in-time defect prediction (Kamei et al. 2013). If those
signals miss most of what an expert audit finds in agent code, the dashboards say
"no rework" while defects accumulate, which is what this repository's first
reading suggests: 0 reverts and a median 14-day line survival of 0.963 across 3,389
agent PRs (`docs/reports/rework-first-reading-2026-11-13.md`), while the quality
audit finds at least one defect in every one of 667 audited subjects
(`portfolio/quality/audits/`). The people who would act on the answer are
engineering leads deciding review policy for agent fleets and MSR researchers
building defect datasets from agent-era repositories. The artefact is a script
set and a linked dataset (audited defect, line, introducing PR, fix PR, process
features) that runs on any repository with a line-located audit log.

## Related work

**Finding defect-introducing changes from fixes (SZZ and its evaluation).**

- Śliwerski, Zimmermann and Zeller (2005). When do changes induce fixes? MSR 2005.
  doi:10.1145/1083142.1083147. The original SZZ: link fix commits to bug reports,
  blame the lines a fix touches. Settles how to locate introducing changes *given a
  fix*; says nothing about unfixed defects.
- Kim, Zimmermann, Pan and Whitehead (2006). Automatic identification of
  bug-introducing changes. ASE 2006. doi:10.1109/ASE.2006.23. Annotation-graph
  refinements that drop cosmetic lines; same fix-first dependence.
- da Costa, McIntosh, Shang, Kulesza, Coelho and Hassan (2017). A framework for
  evaluating the results of the SZZ approach for identifying bug-introducing
  changes. IEEE TSE 43(7). doi:10.1109/TSE.2016.2616306. Evaluation criteria for SZZ
  without ground truth (earliest-bug appearance, future impact); our audit gives an
  independent ground truth they lacked.
- Rodríguez-Pérez, Robles, Serebrenik and González-Barahona (2020). How bugs are
  born: a model to identify how bugs are introduced in software components.
  Empirical Software Engineering 25. doi:10.1007/s10664-019-09781-y. Manual
  analysis showing many bugs are not introduced by the lines a fix touches; a
  manual baseline for SZZ error.
- Herbold, Trautsch, Trautsch and Ledel (2022). Problems with SZZ and features: an
  empirical study of the state of practice of defect prediction data collection.
  Empirical Software Engineering 27. doi:10.1007/s10664-021-10092-4. Measures
  SZZ label noise against manually validated bug fixes; still fix-anchored.
- Bird, Bachmann, Aune, Duffy, Bernstein, Filkov and Devanbu (2009). Fair and
  balanced? Bias in bug-fix datasets. ESEC/FSE 2009. doi:10.1145/1595696.1595716.
  Linked fixes are a biased sample of all fixes; the bias we test is the stronger
  one, fixed versus never-fixed defects.
- Herzig, Just and Zeller (2013). It's not a bug, it's a feature: how
  misclassification impacts bug prediction. ICSE 2013.
  doi:10.1109/ICSE.2013.6606585. A third of "bug" reports are not bugs; motivates
  reading the audit's severity and category rather than trusting a keyword.

**Change-level defect prediction and rework metrics.**

- Mockus and Votta (2000). Identifying reasons for software changes using historic
  databases. ICSM 2000. doi:10.1109/ICSM.2000.883028. Classifying changes as
  corrective from their messages, the keyword step our fix-touch proxy uses.
- Kamei, Shihab, Adams, Hassan, Mockus, Sinha and Ubayashi (2013). A large-scale
  empirical study of just-in-time quality assurance. IEEE TSE 39(6).
  doi:10.1109/TSE.2012.70. Just-in-time defect prediction from change features
  (size, diffusion, experience) with SZZ labels; our H3 asks the same question
  with audit labels.
- McIntosh and Kamei (2018). Are fix-inducing changes a moving target? A
  longitudinal case study of just-in-time defect prediction. IEEE TSE 44(5).
  doi:10.1109/TSE.2017.2693980. Change-risk features drift over time; relevant
  because this repository's prompt versions change weekly.
- Forsgren, Humble and Kim (2018). Accelerate. IT Revolution Press. Change
  failure rate and time to restore as delivery stability measures
  (https://itrevolution.com/product/accelerate/). The industry metric whose
  validity for agent code H1 tests.

**Agent-written code and pull requests.**

- Jimenez, Yang, Wettig, Yao, Pei, Press and Narasimhan (2024). SWE-bench: can
  language models resolve real-world GitHub issues? ICLR 2024. arXiv:2310.06770.
  Judges agents by hidden tests on fixed issues, not latent defects in merged work.
- Yang, Jimenez, Wettig, Lieret, Yao, Narasimhan and Press (2024). SWE-agent:
  agent-computer interfaces enable automated software engineering. NeurIPS 2024.
  arXiv:2405.15793. The agent architecture class this repository runs.
- Li, Zhang and Hassan (2025). The rise of AI teammates in software engineering
  (SE) 3.0: how autonomous coding agents are reshaping software engineering.
  arXiv:2507.15003. AIDev, hundreds of thousands of agent-authored PRs on GitHub;
  measures acceptance and review, with humans as gatekeepers, not post-merge
  defects without a human in the loop.
- Pearce, Ahmad, Tan, Dolan-Gavitt and Karri (2022). Asleep at the keyboard?
  Assessing the security of GitHub Copilot's code contributions. IEEE S&P 2022.
  arXiv:2108.09293. Audits generated code for one defect class (CWEs) in
  scenarios, not merged repository history.
- Kapoor, Stroebl, Siegel, Nadgir and Narayanan (2024). AI agents that matter.
  arXiv:2407.01502. Argues agent evaluations need cost and real-use validity; our
  H1 is a validity check of one such measure.

**Case-control design.**

- Mantel and Haenszel (1959). Statistical aspects of the analysis of data from
  retrospective studies of disease. JNCI 22(4). doi:10.1093/jnci/22.4.719. The
  stratified odds ratio for matched case-control data, used with audits as strata.

**This repository's own prior work.** `research/swe-audit` (re-running committed
research results), `research/swe-reccover` (run records against git),
`research/swe-fieldfill`, `prompts/derive.py` and
`docs/reports/rework-first-reading-2026-11-13.md` (14-day survival and follow-ups),
and the quality-audit programme `portfolio/quality/` (667 rubric audits, 4,661
located defects by 2026-11-23) whose audits are the ground truth here.

## Gap

No published study measures how many defects found by an independent audit of
merged code were ever flagged by SZZ-family or rework signals, and none does it
for a repository written and merged end to end by agents. The narrow novelty
claim: (i) a line-level case-control link from rubric-audited defects to the
pull requests that wrote them, with matched control lines from the same file and
tree; (ii) the sensitivity and odds ratio of each standard proxy against that
ground truth; (iii) for the audited defects that were later fixed, the accuracy of
SZZ run forward from the fix against the auditor's location. The audit is itself
done by agents (Claude sessions with a fixed rubric), which is a limitation the
paper has to carry: milestone 4 measures auditor agreement on a re-audited sample.

## Hypotheses

- **H1 (proxies are blind).** Pull requests that wrote an audited defect line are
  flagged by a 14-day proxy (named follow-up fix, fix-keyword commit on the same
  file, reverted) at an odds ratio under 2 against matched control lines.
  Refuted if the Mantel-Haenszel odds ratio for any proxy is 2 or more with a 95%
  interval excluding 1.
- **H2 (detection is late).** The median time from the introducing merge to the
  audit that found the defect exceeds 14 days, the window every rework proxy
  here uses. Refuted if the median is 14 days or less.
- **H3 (size predicts defects).** Per line written, PRs over 1,000 added lines
  are more likely to write a high- or medium-severity audited defect line than
  smaller PRs (odds ratio above 1.5). Refuted if the interval excludes 1.5 from
  above or the ratio is under 1.
- **H4 (SZZ misattributes).** For audited defects later fixed by a recorded fix
  PR, SZZ run on that fix names the auditor-located introducing PR for at most
  60% of defects. Refuted if 80% or more.

## Method

Data. Main's first-parent history (one squash commit per PR, about 16,800
commits from 2026-05 to 2026-11), the 667 audit files and their `where`
`path:line` locations (4,311 of 4,661 defects), run records in `prompts/runs/`
for model, track and prompt version, and `prompts/derived/` for survival and CI.

Linking. Blame each defect line at the parent of the commit that added its audit
(the tree the auditor read) and map the blamed commit to its PR. For each file,
draw three control lines (non-blank, at least 10 lines from any defect line in
that audit) and blame them the same way. A hand check of a random sample of
links measures how often the blamed line is the defect's line (validity).

Analysis. Each proxy is computed for the PR that wrote each case and control
line, using only history before that line's audit. Odds ratios are
Mantel-Haenszel stratified by audit file, with Robins-Breslow-Greenland
intervals, and a cluster bootstrap over audits as a check. Latency (H2) is the
distribution of audit date minus merge date for case lines. H3 uses the same
case-control frame with PR size as exposure. H4 runs SZZ (lines the fix PR
deletes or changes, blamed at its parent) and compares with the audit link.

## Evaluation

Baselines are the proxies practitioners and researchers already use: SZZ (B-SZZ,
with cosmetic-change filtering as in Kim et al. 2006), 14-day follow-up fixes and
survival as in `prompts/derive.py`, reverts, red CI on the PR. Metrics:
sensitivity, odds ratio with 95% intervals, and SZZ precision and recall against
the audit link. Ablations: severity (high only), stratum (venture, research,
platform), sampled versus census audits (sampled audits are a uniform draw, census
audits are not), and control distance (10 and 30 lines). Every number is
regenerated by one command per table.

## Milestones

1. **Link and H1, H2** (this session): extract case and control lines, map them
   to PRs, compute the proxies and latency, report odds ratios.
2. **Validity**: hand-check 60 random case links (is the blamed line the defect's
   line; is the defect an omission with no line to blame) and report link
   precision; re-run M1 without omission-type defects.
3. **H4, SZZ against the audit**: for the 1,072 defects with `fixed_by`, run SZZ on
   the fix PRs and score it against the audit link.
4. **Auditor agreement**: compare first audits with the 9+ re-audits and with
   blind pairs in `portfolio/quality/blind-pairs/`; report kappa on "defect
   present at this line".
5. **H3 and process features**: size, track, model, prompt version and
   concurrency as exposures, with run-record joins.
6. **External check**: run the same pipeline on an AIDev subset with a
   line-located audit of a small sample, to see whether the findings hold where
   humans review.
7. **Paper**: `paper/` in the MSR format.

## Target venue

MSR 2027 technical papers track (10 pages plus 2 of references, ACM format, with
the data and scripts in the artefact). *Empirical Software Engineering* as the
journal option for the extended version. This is an aim, not a claim that the work
will be accepted.

## Deep-tech application

The system is the agent loop that builds this portfolio's engineering tools
(IFC quantity takeoff, chip-flow and robotics research code, schedule checkers)
with no human reviewer. The number it moves is the share of latent defects a team's
quality dashboard can see. The people who would act on it are engineering leads
deciding how much review to keep on agent fleets in any of those fields. Trying
it on the real thing means running the pipeline on another organisation's
repository with a line-located audit, which milestone 6 starts.
