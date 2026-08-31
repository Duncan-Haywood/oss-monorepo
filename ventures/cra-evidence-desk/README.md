# CRA evidence desk

**Find affected software components and assemble a customer-reviewed Cyber Resilience Act incident draft in minutes.** This free local CLI accepts a customer-owned SBOM and advisory export, makes only exact name/ecosystem/version matches, and produces JSON evidence or a copyable Article 14 draft.

```sh
cd ventures/cra-evidence-desk
PYTHONPATH=src python3 -m cra_evidence_desk examples/sbom.json examples/advisories.json --product "Demo service" --version 2026.08 --format draft
PYTHONPATH=src python3 -m unittest discover -s . -p 'test_*.py' -v
```

The tool never contacts an authority, files a notification, claims compliance, infers affected version ranges, or retains input content. It is deliberately a reporting-readiness evidence tool, not conformity assessment.

## Coverage boundary

The v0 matcher requires exact component name, ecosystem, and version equality. It does not resolve aliases, ranges, reachability, exploitability, or whether a legal reporting obligation applies. Advisory source and coverage are printed so a reviewer can verify them against the authoritative source.

## Privacy and usage

Everything runs locally. SBOMs, advisories, product names, and draft contents never leave the machine. `--usage-file` is optional and stores only the aggregate event `evidence_report_generated`; omit it to disable counting. There are no accounts, cookies, IPs, or analytics vendors.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The customer remains responsible for deciding whether a report is required, reviewing the evidence, and submitting through the proper authority.

**Best-effort hosting, no SLA.** This CLI runs on your machine. Any hosted copy of these files is free, experimental, and may be moved or taken offline without notice. Do not use a hosted URL as a system of record. If a draft needs to survive, keep the generated JSON or text.

The tool is free and full-featured. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## FAQ

### Does this submit a CRA notification?

No. It creates a draft only; the customer reviews and submits it.

### Does a match prove a vulnerability is exploitable?

No. It is an exact inventory/advisory observation requiring independent review.
