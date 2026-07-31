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
# Secret findings come from a filesystem search, so they remain trustworthy on a
# run that could not reach the registry. Tracked apart from HIGH_COUNT so the
# offline waiver can key on evidence the scan actually produced.
SECRET_COUNT=0

IS_OFFLINE=0
if [ -n "${SECURITY_SCAN_OFFLINE+x}" ]; then
  IS_OFFLINE="${SECURITY_SCAN_OFFLINE}"
elif ! node -e 'require("dns").lookup("registry.npmjs.org", (err) => process.exit(err ? 1 : 0))' >/dev/null 2>&1; then
  IS_OFFLINE=1
  echo "ℹ Network access to registry.npmjs.org is unavailable (offline/sandboxed environment)."
  echo "  Skipping remote dependency audit; running local secret exposure audit..."
fi

FINDINGS_TMP=$(mktemp)
# An audit that could not run is not the same as an audit that found nothing.
# Every unusable result lands here, and a non-empty file means this run may not
# overwrite the recorded findings.
AUDIT_GAPS_TMP=$(mktemp)
trap 'rm -f "${FINDINGS_TMP}" "${AUDIT_GAPS_TMP}"' EXIT

# Function to audit a single package directory
audit_node_package() {
  local target_dir="$1"
  local component_name="$2"

  # Being offline is an audit that could not run, not an audit that found
  # nothing. Counting these as audited would satisfy the completeness guard
  # below and republish the roadmap as CLEAN, erasing every recorded finding —
  # the precise failure that guard exists to prevent.
  if [ "${IS_OFFLINE}" -eq 1 ]; then
    if [ -f "${target_dir}/package.json" ]; then
      printf '%s\tregistry unreachable, dependency audit skipped\n' \
        "${component_name}" >> "${AUDIT_GAPS_TMP}"
    fi
    return
  fi

  if [ -f "${target_dir}/package.json" ]; then
    pushd "${target_dir}" >/dev/null

    if [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ] && [ ! -f pnpm-lock.yaml ]; then
      local parent_dir
      parent_dir="$(dirname "${target_dir}")"
      if [ -f "${parent_dir}/pnpm-lock.yaml" ] || [ -f "${parent_dir}/../pnpm-lock.yaml" ] || [ -f "${parent_dir}/pnpm-workspace.yaml" ]; then
        popd >/dev/null
        return
      fi
      printf '%s\tno npm or pnpm lockfile to audit\n' "${component_name}" >> "${AUDIT_GAPS_TMP}"
      popd >/dev/null
      return
    fi

    echo "Auditing Node package: ${component_name}..."

    local audit_json audit_stderr
    audit_stderr=$(mktemp)
    if [ -f pnpm-lock.yaml ]; then
      audit_json=$(pnpm audit --json 2>"${audit_stderr}" || true)
    else
      audit_json=$(npm audit --json 2>"${audit_stderr}" || true)
    fi

    local counts
    if ! counts=$(node -e '
      const data = JSON.parse(process.argv[1]);
      const vulns = (data.metadata || {}).vulnerabilities;
      if (!vulns) {
        throw new Error("audit returned no vulnerability metadata");
      }
      const total = typeof vulns.total === "number" ? vulns.total : (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0) + (vulns.low || 0);
      console.log(`${vulns.critical || 0} ${vulns.high || 0} ${vulns.moderate || 0} ${vulns.low || 0}`);
    ' "${audit_json}" 2>/dev/null); then
      local reason
      reason=$(head -n 1 "${audit_stderr}")
      printf '%s\t%s\n' \
        "${component_name}" \
        "${reason:-audit produced no usable JSON report}" >> "${AUDIT_GAPS_TMP}"
      rm -f "${audit_stderr}"
      popd >/dev/null
      return
    fi
    rm -f "${audit_stderr}"

    AUDITED_COUNT=$((AUDITED_COUNT + 1))

    read -r crit high med low <<< "${counts}"
    CRITICAL_COUNT=$((CRITICAL_COUNT + crit))
    HIGH_COUNT=$((HIGH_COUNT + high))
    MEDIUM_COUNT=$((MEDIUM_COUNT + med))
    LOW_COUNT=$((LOW_COUNT + low))

    node -e '
      const data = JSON.parse(process.argv[1]);
      const component = process.argv[2];
      const vulns = data.vulnerabilities || {};

      for (const [pkg, info] of Object.entries(vulns)) {
        const severity = (info.severity || "info").toUpperCase();
        const via = Array.isArray(info.via) ? info.via.map(v => typeof v === "string" ? v : v.title || v.name).join(", ") : info.via;
        const fixAvailable = info.fixAvailable ? (typeof info.fixAvailable === "boolean" ? "npm audit fix" : `Upgrade ${info.fixAvailable.name}@${info.fixAvailable.version}`) : "Manual fix required";
        const range = info.range || "N/A";

        console.log(`| ${component} | \`${pkg}\` | **${severity}** | ${range} | ${via || "Vulnerability in dependency"} | ${fixAvailable} | [ ] Scheduled |`);
      }
    ' "${audit_json}" "${component_name}" >> "${FINDINGS_TMP}"

    popd >/dev/null
  fi
}

# Scan Node projects (recursively finding all package.json files in ventures/ and portfolio/)
while IFS= read -r pkg_file; do
  if [ -n "${pkg_file}" ]; then
    pkg_dir="$(dirname "${pkg_file}")"
    rel_dir="${pkg_dir#"${REPO_ROOT}/"}"
    audit_node_package "${pkg_dir}" "${rel_dir}"
  fi
done < <(find "${REPO_ROOT}/ventures" "${REPO_ROOT}/portfolio" -type d \( -name "node_modules" -o -name ".next" -o -name ".open-next" -o -name "dist" -o -name "build" -o -name ".pnpm-store" \) -prune -o -name "package.json" -print 2>/dev/null)

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
      SECRET_COUNT=$((SECRET_COUNT + 1))
    fi
  done <<< "${SECRET_RESULTS}"
fi

echo "Scan completed. Summary:"
echo "  Critical: ${CRITICAL_COUNT}"
echo "  High:     ${HIGH_COUNT}"
echo "  Medium:   ${MEDIUM_COUNT}"
echo "  Low:      ${LOW_COUNT}"
echo "  Packages audited: ${AUDITED_COUNT}"

# The roadmap is the release gate, so it may only be rewritten by a scan that
# actually observed every package. A run that cannot reach the registry, or that
# runs before dependencies are installed, otherwise reports a clean bill of
# health and erases the recorded findings.
if [ -s "${AUDIT_GAPS_TMP}" ] || [ "${AUDITED_COUNT}" -eq 0 ]; then
  echo "" >&2
  echo "Incomplete audit: refusing to rewrite ${ROADMAP_FILE#"${REPO_ROOT}/"}." >&2
  if [ "${AUDITED_COUNT}" -eq 0 ]; then
    echo "  No package produced a usable npm audit report." >&2
  fi
  while IFS=$'\t' read -r gap_component gap_reason; do
    [ -n "${gap_component}" ] && echo "  ${gap_component}: ${gap_reason}" >&2
  done < "${AUDIT_GAPS_TMP}"
  echo "" >&2
  # SECURITY_SCAN_ALLOW_OFFLINE may waive the non-zero exit so a network-isolated
  # runner can still complete the secret audit. It may never waive the refusal to
  # rewrite: both branches below exit before the roadmap is touched. Severity
  # counters must not appear in this condition — offline they are zero precisely
  # because nothing was audited, which made an earlier version of this waiver
  # unconditionally true and let every pipeline run erase the recorded findings.
  if [ "${SECURITY_SCAN_ALLOW_OFFLINE:-0}" -eq 1 ] && [ "${SECRET_COUNT}" -eq 0 ]; then
    echo "SECURITY_SCAN_ALLOW_OFFLINE=1: exiting zero with the recorded findings left" >&2
    echo "in place. The dependency audit did not run, so this run is not evidence" >&2
    echo "that the recorded vulnerabilities are resolved." >&2
    exit 0
  fi
  if [ "${SECRET_COUNT}" -ne 0 ]; then
    echo "  ${SECRET_COUNT} hardcoded credential pattern(s) detected; the offline waiver does not apply." >&2
  fi
  echo "Install dependencies and restore registry access, then re-run." >&2
  exit 1
fi

# Write updated SECURITY_ROADMAP.md
cat << EOF > "${ROADMAP_FILE}"
# Security Roadmap & Vulnerability Log

> **Automated Security Scanning & Governance Status**
> - **Last Scan Execution**: \`${TIMESTAMP}\`
> - **CI Pipeline Scanner**: Enabled (\`.gitea/workflows/security.yml\`)
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
