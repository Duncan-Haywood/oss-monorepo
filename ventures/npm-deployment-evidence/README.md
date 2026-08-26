# npm Deployment Evidence

If a JavaScript vulnerability scanner lists packages your deployed app never loads, this local, free-first CLI shows the lockfile evidence behind that distinction. It reads `package-lock.json` v2/v3, separates production-path dependencies from npm-marked dev-only dependencies, and exports a portable Markdown or JSON report.

After using this, you can now review which dependencies reach your production path, which used to require manually tracing a lockfile.

## Run

```bash
python3 npm_deployment_evidence.py package-lock.json
python3 npm_deployment_evidence.py package-lock.json --format json --output evidence.json
python3 npm_deployment_evidence.py package-lock.json --usage-file .usage.json
```

The report is deterministic apart from its generated date. It never makes network calls and never uploads the lockfile. Usage counting is optional, local, aggregate-only, and can be disabled with `--no-usage`; it records only the number of reports generated.

## Limits and safety

Build-only is a positive lockfile classification, not a security verdict. A package marked build-only can still be exposed on the build machine. Dynamic imports and other runtime behavior need human review. This tool is evidence, not an attestation, conformity assessment, or compliance advice.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** This CLI runs on your machine. Any hosted copy of these files is free, experimental, and may be moved or taken offline without notice. Do not use a hosted URL as a system of record. If a report needs to survive, keep the generated Markdown or JSON.

The tool is free and full-featured. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Opportunity assessment

The existing portfolio includes fee calculators, DNS evidence, and Shopify permission evidence, but no npm deployment-surface report. The portfolio probe measured 64.6% to 66.0% false positives in matched advisory findings across 3,573 components, with deployment mode as the discriminating signal. The EU Vulnerability Database integration proposed by the related CRA candidate is unreachable from this environment, so this launch deliberately uses local lockfile evidence and existing advisory workflows rather than claiming EUVD coverage.

Potential future business model: a hosted or CI-integrated team report with retention and policy annotations, priced per repository after free usage proves repeat demand. No payment, account, or hosted data collection is included now.

## Privacy

Everything runs locally. Customer lockfiles and source are never uploaded; there are no accounts, cookies, tracking pixels, or analytics vendors. The optional usage file contains only an aggregate event count.
