#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail

# Monorepo Security Auditor and Roadmap Sync Script
# Scans all sub-projects for dependency vulnerabilities, exposed credentials, and security misconfigurations.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROADMAP_FILE="${REPO_ROOT}/SECURITY_ROADMAP.md"
TIMESTAMP="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"

echo "=== Monorepo Security Audit & Roadmap Update ==="
echo "Repository Root: ${REPO_ROOT}"
echo "Execution Time: ${TIMESTAMP}"

CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

AUDITED_COUNT=0

FINDINGS_TMP=$(mktemp)
# An audit that could not run is not an audit that found nothing. Every package
# whose dependency state could not be established lands here, and a non-empty
# file bars this run from rewriting the roadmap.
AUDIT_GAPS_TMP=$(mktemp)
trap 'rm -f "${FINDINGS_TMP}" "${AUDIT_GAPS_TMP}"' EXIT

record_audit_gap() {
  printf '%s\t%s\n' "$1" "$2" >> "${AUDIT_GAPS_TMP}"
}

# True when the package is a member of a pnpm workspace whose root lockfile
# already covers it, so auditing the member directory would prove nothing.
covered_by_pnpm_workspace() {
  local dir="$1"

  while [ "${dir}" != "${REPO_ROOT}" ] && [ "${dir}" != "/" ]; do
    dir="$(dirname "${dir}")"
    if [ -f "${dir}/pnpm-workspace.yaml" ]; then
      return 0
    fi
  done

  return 1
}

# Function to audit a single package directory
audit_node_package() {
  local target_dir="$1"
  local component_name="$2"

  [ -f "${target_dir}/package.json" ] || return 0

  local manager
  if [ -f "${target_dir}/pnpm-lock.yaml" ]; then
    manager=pnpm
  elif [ -f "${target_dir}/package-lock.json" ] || [ -f "${target_dir}/npm-shrinkwrap.json" ]; then
    manager=npm
  elif covered_by_pnpm_workspace "${target_dir}"; then
    echo "Skipping ${component_name}: covered by its pnpm workspace lockfile."
    return 0
  elif ! node -e '
    const pkg = require(process.argv[1]);
    const declared = ["dependencies", "devDependencies", "optionalDependencies"]
      .some((field) => Object.keys(pkg[field] || {}).length > 0);
    process.exit(declared ? 0 : 1);
  ' "${target_dir}/package.json" 2>/dev/null; then
    echo "Skipping ${component_name}: no declared dependencies to audit."
    AUDITED_COUNT=$((AUDITED_COUNT + 1))
    return 0
  else
    record_audit_gap "${component_name}" "declares dependencies but has no lockfile"
    return 0
  fi

  echo "Auditing Node package: ${component_name} (${manager})..."
  pushd "${target_dir}" >/dev/null

  local audit_json audit_stderr
  audit_stderr=$(mktemp)
  # Both package managers exit non-zero when they find vulnerabilities, so the
  # exit code cannot distinguish findings from a failed run. The payload can.
  audit_json=$("${manager}" audit --json 2>"${audit_stderr}" || true)

  local counts
  if ! counts=$(node -e '
    const data = JSON.parse(process.argv[1]);
    const vulns = (data.metadata || {}).vulnerabilities;
    const severities = ["critical", "high", "moderate", "low"];
    if (!vulns || severities.some((s) => typeof vulns[s] !== "number")) {
      throw new Error("audit returned no vulnerability metadata");
    }
    console.log(severities.map((s) => vulns[s]).join(" "));
  ' "${audit_json}" 2>/dev/null); then
    local reason
    reason=$(grep -v '^(node:' "${audit_stderr}" | head -n 1)
    record_audit_gap \
      "${component_name}" \
      "${reason:-${manager} audit produced no usable JSON report}"
    rm -f "${audit_stderr}"
    popd >/dev/null
    return 0
  fi
  rm -f "${audit_stderr}"

  AUDITED_COUNT=$((AUDITED_COUNT + 1))

  read -r crit high med low <<< "${counts}"
  CRITICAL_COUNT=$((CRITICAL_COUNT + crit))
  HIGH_COUNT=$((HIGH_COUNT + high))
  MEDIUM_COUNT=$((MEDIUM_COUNT + med))
  LOW_COUNT=$((LOW_COUNT + low))

  # npm reports a package-keyed `vulnerabilities` map; pnpm reports an
  # advisory-keyed `advisories` map. Normalize both into roadmap rows.
  node -e '
    const data = JSON.parse(process.argv[1]);
    const component = process.argv[2];

    for (const [pkg, info] of Object.entries(data.vulnerabilities || {})) {
      const severity = (info.severity || "info").toUpperCase();
      const via = Array.isArray(info.via) ? info.via.map(v => typeof v === "string" ? v : v.title || v.name).join(", ") : info.via;
      const fixAvailable = info.fixAvailable ? (typeof info.fixAvailable === "boolean" ? "npm audit fix" : `Upgrade ${info.fixAvailable.name}@${info.fixAvailable.version}`) : "Manual fix required";
      const range = info.range || "N/A";

      console.log(`| ${component} | \`${pkg}\` | **${severity}** | ${range} | ${via || "Vulnerability in dependency"} | ${fixAvailable} | [ ] Scheduled |`);
    }

    for (const advisory of Object.values(data.advisories || {})) {
      const severity = (advisory.severity || "info").toUpperCase();
      const range = advisory.vulnerable_versions || "N/A";
      const title = advisory.title || "Vulnerability in dependency";
      const fix = advisory.patched_versions && advisory.patched_versions !== "<0.0.0"
        ? `Upgrade ${advisory.module_name} to ${advisory.patched_versions}`
        : "Manual fix required";

      console.log(`| ${component} | \`${advisory.module_name}\` | **${severity}** | ${range} | ${title} | ${fix} | [ ] Scheduled |`);
    }
  ' "${audit_json}" "${component_name}" >> "${FINDINGS_TMP}"

  popd >/dev/null
}

# Scan Node projects (recursively finding all package.json files in ventures/ and portfolio/)
while IFS= read -r pkg_file; do
  if [ -n "${pkg_file}" ]; then
    pkg_dir="$(dirname "${pkg_file}")"
    rel_dir="${pkg_dir#"${REPO_ROOT}/"}"
    audit_node_package "${pkg_dir}" "${rel_dir}"
  fi
done < <(find "${REPO_ROOT}/ventures" "${REPO_ROOT}/portfolio" -type d \( -name "node_modules" -o -name ".next" -o -name ".open-next" -o -name ".turbo" -o -name ".vercel" -o -name "dist" -o -name "build" \) -prune -o -name "package.json" -print 2>/dev/null)

# Secret Scanning in Node.js
echo "Running Secret Exposure Audit..."
SECRET_RESULTS=$(node -e '
  const fs = require("fs");
  const path = require("path");

  const repoRoot = process.argv[1];
  const ignoreDirs = new Set(["node_modules", ".git", ".next", "dist", "build", ".venv", "venv", ".terraform"]);
  const ignoreFiles = new Set(["SECURITY_ROADMAP.md", "package-lock.json", "security-scan.sh"]);
  const patterns = [/AWS_SECRET_ACCESS_KEY\s*=/i, /BEGIN\s+RSA\s+PRIVATE\s+KEY/i, /BEGIN\s+OPENSSH\s+PRIVATE\s+KEY/i];

  let matches = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoreDirs.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && !ignoreFiles.has(entry.name)) {
          if (entry.name.endsWith(".log") || entry.name.endsWith(".png") || entry.name.endsWith(".jpg")) continue;
          try {
            const content = fs.readFileSync(fullPath, "utf8");
            for (const pat of patterns) {
              if (pat.test(content)) {
                const relPath = path.relative(repoRoot, fullPath);
                matches.push(`${relPath}`);
                break;
              }
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  walk(repoRoot);
  console.log(matches.join("\n"));
' "${REPO_ROOT}")

if [ -n "${SECRET_RESULTS}" ]; then
  while IFS= read -r secret_file; do
    if [ -n "${secret_file}" ]; then
      echo "| \`${secret_file}\` | Hardcoded Credential Pattern | **HIGH** | File Search | Potential hardcoded credential pattern detected | Rotate and migrate to environment variables | [ ] Action Required |" >> "${FINDINGS_TMP}"
      HIGH_COUNT=$((HIGH_COUNT + 1))
    fi
  done <<< "${SECRET_RESULTS}"
fi

echo "Scan completed. Summary:"
echo "  Critical: ${CRITICAL_COUNT}"
echo "  High:     ${HIGH_COUNT}"
echo "  Medium:   ${MEDIUM_COUNT}"
echo "  Low:      ${LOW_COUNT}"
echo "  Packages audited: ${AUDITED_COUNT}"

# The roadmap is the release gate, so only a scan that actually observed every
# package may rewrite it. A run that cannot reach the registry, or that runs
# before dependencies are installed, would otherwise publish a clean bill of
# health and erase the recorded findings.
if [ -s "${AUDIT_GAPS_TMP}" ] || [ "${AUDITED_COUNT}" -eq 0 ]; then
  {
    echo ""
    echo "Incomplete audit: refusing to rewrite ${ROADMAP_FILE#"${REPO_ROOT}/"}."
    if [ "${AUDITED_COUNT}" -eq 0 ]; then
      echo "  No package produced a usable audit report."
    fi
    while IFS=$'\t' read -r gap_component gap_reason; do
      [ -n "${gap_component}" ] && echo "  ${gap_component}: ${gap_reason}"
    done < "${AUDIT_GAPS_TMP}"
    echo ""
    echo "Install dependencies and restore registry access, then re-run."
  } >&2
  exit 1
fi

# Write updated SECURITY_ROADMAP.md
cat << EOF > "${ROADMAP_FILE}"
# Security Roadmap & Vulnerability Log

> **Automated Security Scanning & Governance Status**
> - **Last Scan Execution**: \`${TIMESTAMP}\`
> - **CI Pipeline Scanner**: Enabled (\`.gitea/workflows/security.yml\`)
> - **Audit Coverage**: ${AUDITED_COUNT} package(s) audited. A scan that cannot
>   audit every package refuses to rewrite this file, so a clean dashboard always
>   means a complete scan rather than a failed one.
> - **Policy Enforcement**: Block PR merges on Critical/High vulnerabilities; track all findings in this roadmap.

---

## Executive Summary & Vulnerability Dashboard

| Severity | Active Issues | Target SLA | Mitigation Priority |
| :--- | :--- | :--- | :--- |
| 🚨 **CRITICAL** | **${CRITICAL_COUNT}** | Immediate (24h) | Block Release |
| ⚠️ **HIGH** | **${HIGH_COUNT}** | 7 Days | Sprint Backlog |
| 🟡 **MEDIUM** | **${MEDIUM_COUNT}** | 30 Days | Scheduled Update |
| 🔵 **LOW** | **${LOW_COUNT}** | 90 Days | Maintenance Window |

---

## Active Security Findings & Problem Log

| Component / File | Package / Target | Severity | Range | Issue / Vulnerability | Recommended Fix | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
EOF

if [ -s "${FINDINGS_TMP}" ]; then
  cat "${FINDINGS_TMP}" >> "${ROADMAP_FILE}"
else
  echo "| All Components | None | **CLEAN** | N/A | No active vulnerability findings detected | Maintain regular automated CI scans | [x] Passed |" >> "${ROADMAP_FILE}"
fi

cat << EOF >> "${ROADMAP_FILE}"

---

## Security Hardening Roadmap & Action Items

### Phase 1: High-Priority Baseline Hardening (Current Sprint)
- [x] Enforce least-privilege permissions (\`permissions: contents: read\`) across all Gitea Actions workflows.
- [x] Configure non-root unprivileged container users in application Dockerfiles.
- [x] Harden \`.gitignore\` to prevent credential, token, and SSH/TLS private key accidental check-ins.
- [x] Implement automated CI security scanning workflow (\`.gitea/workflows/security.yml\`).

### Phase 2: Dependency & Infrastructure Remediation (Short-Term)
- [ ] Remediate high/critical dependency vulnerabilities reported in package audit logs using \`npm audit fix\`.
- [ ] Extend the blocking \`dependency-audit\` matrix in \`.gitea/workflows/security.yml\` to every package this scan audits; it currently gates four of ${AUDITED_COUNT}.
- [ ] Enforce automated secret scanning with Gitleaks / Trivy in pre-commit hooks and PR builds.
- [ ] Implement automated Trivy IaC static analysis for Terraform (\`platform/terraform\`) and K8s (\`platform/k8s\`).

### Phase 3: Advanced Governance & Monitoring (Medium-Term)
- [ ] Enable Renovate automated security update pull requests.
- [ ] Configure dynamic application security testing (DAST) for staging environment endpoints.
- [ ] Establish periodic automated dependency license compliance and vulnerability reports.

---

*Note: This file is automatically generated and updated by \`scripts/security-scan.sh\` and \`.gitea/workflows/security.yml\`.*
EOF

rm -f "${FINDINGS_TMP}"

echo "Updated ${ROADMAP_FILE} successfully."
