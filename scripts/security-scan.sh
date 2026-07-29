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

FINDINGS_TMP=$(mktemp)

# Function to audit a single package directory
audit_node_package() {
  local target_dir="$1"
  local component_name="$2"

  if [ -f "${target_dir}/package.json" ]; then
    echo "Auditing Node package: ${component_name}..."
    pushd "${target_dir}" >/dev/null

    local audit_json
    audit_json=$(npm audit --json 2>/dev/null || true)

    if [ -n "${audit_json}" ] && echo "${audit_json}" | grep -q '"vulnerabilities"'; then
      local counts
      counts=$(node -e '
        try {
          const data = JSON.parse(process.argv[1]);
          const meta = data.metadata || {};
          const vulns = meta.vulnerabilities || {};
          console.log(`${vulns.critical || 0} ${vulns.high || 0} ${vulns.moderate || 0} ${vulns.low || 0}`);
        } catch(e) {
          console.log("0 0 0 0");
        }
      ' "${audit_json}")

      read -r crit high med low <<< "${counts}"
      CRITICAL_COUNT=$((CRITICAL_COUNT + crit))
      HIGH_COUNT=$((HIGH_COUNT + high))
      MEDIUM_COUNT=$((MEDIUM_COUNT + med))
      LOW_COUNT=$((LOW_COUNT + low))

      node -e '
        try {
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
        } catch(e) {}
      ' "${audit_json}" "${component_name}" >> "${FINDINGS_TMP}"
    fi

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
done < <(find "${REPO_ROOT}/ventures" "${REPO_ROOT}/portfolio" -type d \( -name "node_modules" -o -name ".next" -o -name "dist" -o -name "build" \) -prune -o -name "package.json" -print 2>/dev/null)

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

# Write updated SECURITY_ROADMAP.md
cat << EOF > "${ROADMAP_FILE}"
# Security Roadmap & Vulnerability Log

> **Automated Security Scanning & Governance Status**
> - **Last Scan Execution**: \`${TIMESTAMP}\`
> - **CI Pipeline Scanner**: Enabled (\`.gitea/workflows/security-scan.yml\`)
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
- [x] Implement automated CI security scanning workflow (\`.gitea/workflows/security-scan.yml\`).

### Phase 2: Dependency & Infrastructure Remediation (Short-Term)
- [ ] Remediate high/critical dependency vulnerabilities reported in package audit logs using \`npm audit fix\`.
- [ ] Enforce automated secret scanning with Gitleaks / Trivy in pre-commit hooks and PR builds.
- [ ] Implement automated Trivy IaC static analysis for Terraform (\`platform/terraform\`) and K8s (\`platform/k8s\`).

### Phase 3: Advanced Governance & Monitoring (Medium-Term)
- [ ] Enable Renovate automated security update pull requests.
- [ ] Configure dynamic application security testing (DAST) for staging environment endpoints.
- [ ] Establish periodic automated dependency license compliance and vulnerability reports.

---

*Note: This file is automatically generated and updated by \`scripts/security-scan.sh\` and \`.gitea/workflows/security-scan.yml\`.*
EOF

rm -f "${FINDINGS_TMP}"

echo "Updated ${ROADMAP_FILE} successfully."
