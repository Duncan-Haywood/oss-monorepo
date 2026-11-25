/**
 * The 110 NIST SP 800-171 Rev. 2 security requirements, each with the point
 * value the DoD Assessment Methodology (NIST SP 800-171 DoD Assessment
 * Methodology, Version 1.2.1, 24 June 2020, Annex A) subtracts from 110 when
 * the requirement is not implemented.
 *
 * Labels are short paraphrases for scanning a list, not the requirement text.
 * Read the full wording in NIST SP 800-171 Rev. 2 before deciding whether a
 * requirement is met. Sources and how they were checked: SOURCES.md.
 *
 * Special cases (DoD Assessment Methodology v1.2.1; 32 CFR 170.24):
 *   3.5.3  MFA: 5 if not implemented for any users, 3 if implemented only for
 *          remote and privileged users.
 *   3.13.11 FIPS-validated cryptography: 5 if no encryption is used, 3 if
 *          encryption is used but is not FIPS-validated.
 *   3.12.4 System security plan: carries no point value; without an SSP the
 *          methodology says an assessment cannot be completed.
 */
export const FAMILIES = {
  "3.1": "Access Control",
  "3.2": "Awareness and Training",
  "3.3": "Audit and Accountability",
  "3.4": "Configuration Management",
  "3.5": "Identification and Authentication",
  "3.6": "Incident Response",
  "3.7": "Maintenance",
  "3.8": "Media Protection",
  "3.9": "Personnel Security",
  "3.10": "Physical Protection",
  "3.11": "Risk Assessment",
  "3.12": "Security Assessment",
  "3.13": "System and Communications Protection",
  "3.14": "System and Information Integrity",
};

// [id, weight, short label]; weight null = no point value (3.12.4).
const ROWS = [
  ["3.1.1", 5, "Limit system access to authorized users, processes and devices"],
  ["3.1.2", 5, "Limit access to the transactions and functions users are permitted"],
  ["3.1.3", 1, "Control the flow of CUI"],
  ["3.1.4", 1, "Separate the duties of individuals"],
  ["3.1.5", 3, "Least privilege, including for security functions and privileged accounts"],
  ["3.1.6", 1, "Use non-privileged accounts for non-security functions"],
  ["3.1.7", 1, "Stop non-privileged users running privileged functions; log them"],
  ["3.1.8", 1, "Limit unsuccessful logon attempts"],
  ["3.1.9", 1, "Privacy and security notices"],
  ["3.1.10", 1, "Session lock with pattern-hiding display"],
  ["3.1.11", 1, "Terminate user sessions automatically"],
  ["3.1.12", 5, "Monitor and control remote access sessions"],
  ["3.1.13", 5, "Cryptography to protect remote access sessions"],
  ["3.1.14", 1, "Route remote access through managed access control points"],
  ["3.1.15", 1, "Authorize remote privileged commands and remote access to security information"],
  ["3.1.16", 5, "Authorize wireless access before allowing connections"],
  ["3.1.17", 5, "Protect wireless access with authentication and encryption"],
  ["3.1.18", 5, "Control connection of mobile devices"],
  ["3.1.19", 3, "Encrypt CUI on mobile devices and mobile computing platforms"],
  ["3.1.20", 1, "Verify and control connections to external systems"],
  ["3.1.21", 1, "Limit use of portable storage devices on external systems"],
  ["3.1.22", 1, "Control CUI posted or processed on publicly accessible systems"],
  ["3.2.1", 5, "Security awareness for managers, administrators and users"],
  ["3.2.2", 5, "Role-based security training"],
  ["3.2.3", 1, "Insider-threat awareness training"],
  ["3.3.1", 5, "Create and retain system audit logs"],
  ["3.3.2", 3, "Trace actions to individual users"],
  ["3.3.3", 1, "Review and update logged events"],
  ["3.3.4", 1, "Alert on audit logging failure"],
  ["3.3.5", 5, "Correlate audit review, analysis and reporting"],
  ["3.3.6", 1, "Audit record reduction and report generation"],
  ["3.3.7", 1, "Authoritative time source for audit timestamps"],
  ["3.3.8", 1, "Protect audit information and tools"],
  ["3.3.9", 1, "Limit management of audit logging to a subset of privileged users"],
  ["3.4.1", 5, "Baseline configurations and inventories"],
  ["3.4.2", 5, "Enforce security configuration settings"],
  ["3.4.3", 1, "Track, review, approve and log system changes"],
  ["3.4.4", 1, "Analyse the security impact of changes"],
  ["3.4.5", 5, "Access restrictions associated with changes"],
  ["3.4.6", 5, "Least functionality"],
  ["3.4.7", 5, "Restrict nonessential programs, functions, ports, protocols and services"],
  ["3.4.8", 5, "Deny-by-exception or permit-by-exception software policy"],
  ["3.4.9", 1, "Control and monitor user-installed software"],
  ["3.5.1", 5, "Identify users, processes and devices"],
  ["3.5.2", 5, "Authenticate users, processes and devices"],
  ["3.5.3", 5, "Multifactor authentication (partial credit possible)"],
  ["3.5.4", 1, "Replay-resistant authentication for network access"],
  ["3.5.5", 1, "Prevent reuse of identifiers"],
  ["3.5.6", 1, "Disable identifiers after inactivity"],
  ["3.5.7", 1, "Minimum password complexity"],
  ["3.5.8", 1, "Prohibit password reuse"],
  ["3.5.9", 1, "Temporary passwords changed at first use"],
  ["3.5.10", 5, "Store and transmit only cryptographically protected passwords"],
  ["3.5.11", 1, "Obscure feedback of authentication information"],
  ["3.6.1", 5, "Operational incident-handling capability"],
  ["3.6.2", 5, "Track, document and report incidents"],
  ["3.6.3", 1, "Test the incident response capability"],
  ["3.7.1", 3, "Perform maintenance on systems"],
  ["3.7.2", 5, "Control maintenance tools, techniques, mechanisms and personnel"],
  ["3.7.3", 1, "Sanitize equipment removed for off-site maintenance"],
  ["3.7.4", 3, "Check diagnostic media for malicious code"],
  ["3.7.5", 5, "MFA for nonlocal maintenance sessions"],
  ["3.7.6", 1, "Supervise maintenance personnel without access authorization"],
  ["3.8.1", 3, "Protect system media containing CUI"],
  ["3.8.2", 3, "Limit access to CUI on system media"],
  ["3.8.3", 5, "Sanitize or destroy media before disposal or reuse"],
  ["3.8.4", 1, "Mark media with CUI markings"],
  ["3.8.5", 1, "Control and account for media during transport"],
  ["3.8.6", 1, "Cryptography for CUI on digital media during transport"],
  ["3.8.7", 5, "Control the use of removable media"],
  ["3.8.8", 3, "Prohibit portable storage with no identifiable owner"],
  ["3.8.9", 1, "Protect CUI in backups"],
  ["3.9.1", 3, "Screen individuals before granting access"],
  ["3.9.2", 5, "Protect CUI and systems during terminations and transfers"],
  ["3.10.1", 5, "Limit physical access to systems and equipment"],
  ["3.10.2", 5, "Protect and monitor the physical facility"],
  ["3.10.3", 1, "Escort and monitor visitors"],
  ["3.10.4", 1, "Keep physical access logs"],
  ["3.10.5", 1, "Control and manage physical access devices"],
  ["3.10.6", 1, "Safeguarding CUI at alternate work sites"],
  ["3.11.1", 3, "Periodic risk assessment"],
  ["3.11.2", 5, "Scan for vulnerabilities"],
  ["3.11.3", 1, "Remediate vulnerabilities"],
  ["3.12.1", 5, "Periodically assess security controls"],
  ["3.12.2", 3, "Plans of action to correct deficiencies"],
  ["3.12.3", 5, "Monitor security controls on an ongoing basis"],
  ["3.12.4", null, "System security plan (required; no point value)"],
  ["3.13.1", 5, "Monitor, control and protect communications at boundaries"],
  ["3.13.2", 5, "Architectural designs and engineering principles for security"],
  ["3.13.3", 1, "Separate user functionality from system management"],
  ["3.13.4", 1, "Prevent unintended information transfer via shared resources"],
  ["3.13.5", 5, "Subnetworks for publicly accessible components"],
  ["3.13.6", 5, "Deny network traffic by default, permit by exception"],
  ["3.13.7", 1, "Prevent split tunneling for remote devices"],
  ["3.13.8", 3, "Cryptography for CUI in transmission"],
  ["3.13.9", 1, "Terminate network connections after inactivity"],
  ["3.13.10", 1, "Establish and manage cryptographic keys"],
  ["3.13.11", 5, "FIPS-validated cryptography for CUI (partial credit possible)"],
  ["3.13.12", 1, "Prohibit remote activation of collaborative computing devices"],
  ["3.13.13", 1, "Control and monitor mobile code"],
  ["3.13.14", 1, "Control and monitor VoIP"],
  ["3.13.15", 5, "Protect the authenticity of communications sessions"],
  ["3.13.16", 1, "Protect CUI at rest"],
  ["3.14.1", 5, "Identify, report and correct system flaws"],
  ["3.14.2", 5, "Malicious code protection"],
  ["3.14.3", 5, "Monitor security alerts and advisories"],
  ["3.14.4", 5, "Update malicious code protection"],
  ["3.14.5", 3, "Periodic and real-time scans"],
  ["3.14.6", 5, "Monitor systems to detect attacks"],
  ["3.14.7", 3, "Identify unauthorized use of systems"],
];

export const REQUIREMENTS = ROWS.map(([id, weight, label]) => ({
  id,
  family: id.split(".").slice(0, 2).join("."),
  weight,
  label,
}));

/** Requirements with a partial-credit status, and what that status deducts. */
export const PARTIAL = {
  "3.5.3": { deduct: 3, label: "MFA only for remote and privileged users" },
  "3.13.11": { deduct: 3, label: "Encryption used, but not FIPS-validated" },
};

export const MAX_SCORE = 110;

/**
 * Level 2 requirements that may never be on a POA&M, whatever their point
 * value: 32 CFR 170.21(a)(2)(iii)(A)-(F). The DoD CIO CMMC FAQ counts six.
 * All six carry 1 point (3.12.4 none), so the general "1-point only" rule
 * would otherwise let them through. Read through search excerpts of the
 * eCFR page on 25 Nov 2026 (eCFR not reachable directly); see SOURCES.md.
 */
export const POAM_PROHIBITED = {
  "3.1.20": "AC.L2-3.1.20 External Connections (CUI Data)",
  "3.1.22": "AC.L2-3.1.22 Control Public Information (CUI Data)",
  "3.12.4": "CA.L2-3.12.4 System Security Plan",
  "3.10.3": "PE.L2-3.10.3 Escort Visitors (CUI Data)",
  "3.10.4": "PE.L2-3.10.4 Physical Access Logs (CUI Data)",
  "3.10.5": "PE.L2-3.10.5 Manage Physical Access (CUI Data)",
};
