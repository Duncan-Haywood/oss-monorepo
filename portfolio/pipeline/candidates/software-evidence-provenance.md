# Candidate: Software evidence provenance ledger

**One line.** A developer tool that turns a release's customer-supplied build
artifacts, dependency manifests, and source references into a reproducible
evidence bundle showing exactly what was examined and when.

**Verdict: reject; distribution and defensibility are unresolved.** This is a
useful internal capability, but the standalone product is a thin wrapper around
existing build metadata and artifact-signing tools. It should not graduate until
a named channel partner demonstrates a buyer and a durable data advantage.

Scored 2026-08-24. Composite 6.375 · floor 3 (defensibility).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 6 | Models can normalize manifests, explain changed inputs, and draft a review summary, but hashes and provenance links are deterministic |
| Autonomous ops | 8 | A CI action can collect artifacts and render a bundle without a human in the normal path |
| Time to revenue | 5 | A team can trial it quickly, but procurement and security review slow the first paid deployment |
| Gross margin | 9 | Storage and modest inference are the main variable costs |
| Defensibility | 3 | SLSA, SPDX, CycloneDX, Sigstore, and CI vendors already cover the underlying records |
| Distribution | 4 | The buyer is already in a code host or build platform, but those platforms are the channel and likely substitutes |
| Liability containment | 8 | The output is an attributed record of inputs and checks, not a security, license, or compliance conclusion |
| Ethical robustness | 8 | Better provenance makes review claims more inspectable; the customer retains responsibility for the release decision |

## What this is not

- Not a software bill of materials generator, vulnerability scanner, or generic
  security questionnaire product; those are already represented in the venture
  catalog or the pipeline.
- Not a signing authority, certification service, or statement that a release is
  secure, compliant, or correctly licensed.
- Not a hosted repository for source code. Inputs are customer-supplied files,
  hashes, and public references; the smallest version can run in the customer's
  CI and emit a local bundle.
- Not a replacement for Sigstore, SLSA, SPDX, CycloneDX, or the customer's own
  review and release controls.

## The shape

The narrow wedge is a review artifact, not another scanner. Given a pinned build
manifest, lockfile, generated artifact, and commit identifier, the tool records
their hashes, the checks actually run, unresolved inputs, and links to the
customer's source evidence. A reviewer can reproduce the bundle or see exactly
where reproduction stopped. Models may summarize differences, but every claim in
the rendered record must point back to an input or be labelled as interpretation.

Possible pricing is €29–€99/month per repository, but that price is only a
hypothesis. Existing standards and platform features make willingness to pay
particularly uncertain.

## Liability and ethics

- The customer decides whether to release and remains responsible for security,
  licensing, and compliance conclusions.
- Missing, stale, or unverified evidence is shown as missing, stale, or
  unverified. The product must never turn an absent check into a green status.
- Customer source and private artifacts stay in the customer's CI in the first
  experiment. No scraping, purchased data, or cross-customer training is needed.
- Any generated summary is subordinate to the linked evidence and must not claim
  that the bundle proves a property it did not test.

## Where it can fail

- **The standards are already free.** A bundle format without a workflow or
  distribution advantage is a feature, not a business.
- **The buyer may prefer existing CI output.** The experiment must test whether
  a reviewer values a provenance narrative beyond an SBOM and signed artifact.
- **Evidence can become a false assurance.** A polished bundle is harmful if it
  hides skipped checks, so the positive control must include missing and stale
  inputs.

## First experiment

Seven days, under €50, with no external account or credential:

1. Build a local CLI that emits JSON and Markdown from a fixture commit, lockfile,
   build manifest, and artifact. Include hashes, timestamps, check status, and
   explicit missing-input states.
2. Add mutations for a changed lockfile, absent test result, stale artifact, and
   mismatched commit. The CLI must surface each mutation and never report a clean
   bundle.
3. Show the bundle privately to five maintainers or release engineers reachable
   through existing public technical communities. Ask whether it replaces a
   current review step and whether they would trial it at €49/month.

Kill it if fewer than two of five say the bundle is materially better than their
existing CI evidence, or if no one names a paid channel. Record the result before
considering a new feature.

## Why this is not already in the pipeline

The existing catalog covers SBOM/CRA evidence and API monitoring, while the
pipeline's agent-permission harness covers attacks against an agent or MCP
server. This candidate is narrower and different: it records provenance of a
specific software release without scanning vulnerabilities, monitoring a vendor,
or testing agent behavior. Its rejection is nevertheless deliberate because the
distinction is a workflow detail, not a defensible business advantage.

## Graduation note (2026-08-24)

Graduated as a free venture at `ventures/software-evidence-provenance` — a
local, deterministic CLI that hashes a release's named build inputs into a
reproducible evidence bundle and reproduces it later. **The `reject` verdict
above is retained deliberately and the scores are unchanged.** That verdict is
about the *paid product*: defensibility (3) — the mechanism is an afternoon's
work and SLSA/Sigstore/SBOM tooling already covers the adjacent records — and
distribution (4) — the portfolio has no warm channel to release engineers or
security reviewers. Neither blocks shipping *free* value now, which is the
current product-first brief. The venture measures whether a reproducible
input-hash record earns a place beside existing attestation tooling before any
paid tier or moat claim is entertained. The liability and ethics gates (8/8),
this candidate's strongest dimensions, are what make it safe to ship: every
claim points back to a named input or is labelled unverified, and the tool
never asserts a release is secure, licensed, or compliant.
