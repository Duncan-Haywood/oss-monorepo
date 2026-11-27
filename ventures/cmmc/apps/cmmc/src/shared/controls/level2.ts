// CMMC Level 2 = the 110 security requirements of NIST SP 800-171 Rev. 2 (32 CFR 170.14(c)(3)),
// each with its NIST SP 800-171A (June 2018) determination statements ("assessment objectives", 320 in
// total) and its DoD Assessment Methodology v1.2.1 point value (the weight subtracted from 110 when the
// requirement is not implemented). Sources and verification status: ./sources.ts. Public domain.
//
// Weights: 5 / 3 / 1 per DoD Assessment Methodology v1.2.1 Annex A (same values in 32 CFR 170.24).
// 3.12.4 (system security plan) carries no point value: without an SSP no score can be produced.
// Partial-credit cases (3.5.3, 3.13.11) are in ./scoring.ts.

export const FAMILIES = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PS: "Personnel Security",
  PE: "Physical Protection",
  RA: "Risk Assessment",
  CA: "Security Assessment",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
} as const;
export type FamilyCode = keyof typeof FAMILIES;

/** NIST family number (3.N) -> CMMC domain abbreviation. */
const FAMILY_BY_NUMBER: Record<string, FamilyCode> = {
  "1": "AC",
  "2": "AT",
  "3": "AU",
  "4": "CM",
  "5": "IA",
  "6": "IR",
  "7": "MA",
  "8": "MP",
  "9": "PS",
  "10": "PE",
  "11": "RA",
  "12": "CA",
  "13": "SC",
  "14": "SI",
};

export interface Objective {
  /** e.g. "3.1.1[a]" */
  id: string;
  text: string;
}

export interface Level2Requirement {
  /** CMMC identifier, e.g. "AC.L2-3.1.1" */
  id: string;
  /** NIST SP 800-171 Rev. 2 number, e.g. "3.1.1" */
  nistId: string;
  family: FamilyCode;
  /** Basic (from FIPS 200) or derived (from SP 800-53) requirement, per SP 800-171 Rev. 2. */
  kind: "basic" | "derived";
  /** DoD Assessment Methodology v1.2.1 point value; 0 only for 3.12.4. */
  weight: 0 | 1 | 3 | 5;
  text: string;
  objectives: Objective[];
}

type Row = [
  nistId: string,
  kind: "b" | "d",
  weight: 0 | 1 | 3 | 5,
  text: string,
  objectives: string[],
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function build(row: Row): Level2Requirement {
  const [nistId, kind, weight, text, objectives] = row;
  const familyNo = nistId.split(".")[1] ?? "";
  const family = FAMILY_BY_NUMBER[familyNo];
  if (!family) throw new Error(`unknown family for ${nistId}`);
  return {
    id: `${family}.L2-${nistId}`,
    nistId,
    family,
    kind: kind === "b" ? "basic" : "derived",
    weight,
    text,
    objectives: objectives.map((t, i) => ({ id: `${nistId}[${LETTERS[i]}]`, text: t })),
  };
}

// Helpers for the long, regular objective lists (3.4.5, 3.4.7, 3.6.1, 3.3.8).
const each = (subjects: string[], tail: (s: string) => string) => subjects.map(tail);

const ROWS: Row[] = [
  // ---------------- 3.1 Access Control ----------------
  [
    "3.1.1",
    "b",
    5,
    "Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).",
    [
      "authorized users are identified.",
      "processes acting on behalf of authorized users are identified.",
      "devices (and other systems) authorized to connect to the system are identified.",
      "system access is limited to authorized users.",
      "system access is limited to processes acting on behalf of authorized users.",
      "system access is limited to authorized devices (including other systems).",
    ],
  ],
  [
    "3.1.2",
    "b",
    5,
    "Limit system access to the types of transactions and functions that authorized users are permitted to execute.",
    [
      "the types of transactions and functions that authorized users are permitted to execute are defined.",
      "system access is limited to the defined types of transactions and functions for authorized users.",
    ],
  ],
  [
    "3.1.3",
    "d",
    1,
    "Control the flow of CUI in accordance with approved authorizations.",
    [
      "information flow control policies are defined.",
      "methods and enforcement mechanisms for controlling the flow of CUI are defined.",
      "designated sources and destinations (e.g., networks, individuals, and devices) for CUI within the system and between interconnected systems are identified.",
      "authorizations for controlling the flow of CUI are defined.",
      "approved authorizations for controlling the flow of CUI are enforced.",
    ],
  ],
  [
    "3.1.4",
    "d",
    1,
    "Separate the duties of individuals to reduce the risk of malevolent activity without collusion.",
    [
      "the duties of individuals requiring separation are defined.",
      "responsibilities for duties that require separation are assigned to separate individuals.",
      "access privileges that enable individuals to exercise the duties that require separation are granted to separate individuals.",
    ],
  ],
  [
    "3.1.5",
    "d",
    3,
    "Employ the principle of least privilege, including for specific security functions and privileged accounts.",
    [
      "privileged accounts are identified.",
      "access to privileged accounts is authorized in accordance with the principle of least privilege.",
      "security functions are identified.",
      "access to security functions is authorized in accordance with the principle of least privilege.",
    ],
  ],
  [
    "3.1.6",
    "d",
    1,
    "Use non-privileged accounts or roles when accessing nonsecurity functions.",
    [
      "nonsecurity functions are identified.",
      "users are required to use non-privileged accounts or roles when accessing nonsecurity functions.",
    ],
  ],
  [
    "3.1.7",
    "d",
    1,
    "Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.",
    [
      "privileged functions are defined.",
      "non-privileged users are defined.",
      "non-privileged users are prevented from executing privileged functions.",
      "the execution of privileged functions is captured in audit logs.",
    ],
  ],
  [
    "3.1.8",
    "d",
    1,
    "Limit unsuccessful logon attempts.",
    [
      "the means of limiting unsuccessful logon attempts is defined.",
      "the defined means of limiting unsuccessful logon attempts is implemented.",
    ],
  ],
  [
    "3.1.9",
    "d",
    1,
    "Provide privacy and security notices consistent with applicable CUI rules.",
    [
      "privacy and security notices required by CUI-specified rules are identified, consistent, and associated with the specific CUI category.",
      "privacy and security notices are displayed.",
    ],
  ],
  [
    "3.1.10",
    "d",
    1,
    "Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.",
    [
      "the period of inactivity after which the system initiates a session lock is defined.",
      "access to the system and viewing of data is prevented by initiating a session lock after the defined period of inactivity.",
      "previously visible information is concealed via a pattern-hiding display after the defined period of inactivity.",
    ],
  ],
  [
    "3.1.11",
    "d",
    1,
    "Terminate (automatically) a user session after a defined condition.",
    [
      "conditions requiring a user session to terminate are defined.",
      "a user session is automatically terminated after any of the defined conditions occur.",
    ],
  ],
  [
    "3.1.12",
    "d",
    5,
    "Monitor and control remote access sessions.",
    [
      "remote access sessions are permitted.",
      "the types of permitted remote access are identified.",
      "remote access sessions are controlled.",
      "remote access sessions are monitored.",
    ],
  ],
  [
    "3.1.13",
    "d",
    5,
    "Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.",
    [
      "cryptographic mechanisms to protect the confidentiality of remote access sessions are identified.",
      "cryptographic mechanisms to protect the confidentiality of remote access sessions are implemented.",
    ],
  ],
  [
    "3.1.14",
    "d",
    1,
    "Route remote access via managed access control points.",
    [
      "managed access control points are identified and implemented.",
      "remote access is routed through managed network access control points.",
    ],
  ],
  [
    "3.1.15",
    "d",
    1,
    "Authorize remote execution of privileged commands and remote access to security-relevant information.",
    [
      "privileged commands authorized for remote execution are identified.",
      "security-relevant information authorized to be accessed remotely is identified.",
      "the execution of the identified privileged commands via remote access is authorized.",
      "access to the identified security-relevant information via remote access is authorized.",
    ],
  ],
  [
    "3.1.16",
    "d",
    5,
    "Authorize wireless access prior to allowing such connections.",
    [
      "wireless access points are identified.",
      "wireless access is authorized prior to allowing such connections.",
    ],
  ],
  [
    "3.1.17",
    "d",
    5,
    "Protect wireless access using authentication and encryption.",
    [
      "wireless access to the system is protected using authentication.",
      "wireless access to the system is protected using encryption.",
    ],
  ],
  [
    "3.1.18",
    "d",
    5,
    "Control connection of mobile devices.",
    [
      "mobile devices that process, store, or transmit CUI are identified.",
      "mobile device connections are authorized.",
      "mobile device connections are monitored and logged.",
    ],
  ],
  [
    "3.1.19",
    "d",
    3,
    "Encrypt CUI on mobile devices and mobile computing platforms.",
    [
      "mobile devices and mobile computing platforms that process, store, or transmit CUI are identified.",
      "encryption is employed to protect CUI on identified mobile devices and mobile computing platforms.",
    ],
  ],
  [
    "3.1.20",
    "d",
    1,
    "Verify and control/limit connections to and use of external systems.",
    [
      "connections to external systems are identified.",
      "the use of external systems is identified.",
      "connections to external systems are verified.",
      "the use of external systems is verified.",
      "connections to external systems are controlled/limited.",
      "the use of external systems is controlled/limited.",
    ],
  ],
  [
    "3.1.21",
    "d",
    1,
    "Limit use of portable storage devices on external systems.",
    [
      "the use of portable storage devices containing CUI on external systems is identified and documented.",
      "limits on the use of portable storage devices containing CUI on external systems are defined.",
      "the use of portable storage devices containing CUI on external systems is limited as defined.",
    ],
  ],
  [
    "3.1.22",
    "d",
    1,
    "Control CUI posted or processed on publicly accessible systems.",
    [
      "individuals authorized to post or process information on publicly accessible systems are identified.",
      "procedures to ensure CUI is not posted or processed on publicly accessible systems are identified.",
      "a review process is in place prior to posting of any content to publicly accessible systems.",
      "content on publicly accessible systems is reviewed to ensure that it does not include CUI.",
      "mechanisms are in place to remove and address improper posting of CUI.",
    ],
  ],

  // ---------------- 3.2 Awareness and Training ----------------
  [
    "3.2.1",
    "b",
    5,
    "Ensure that managers, systems administrators, and users of organizational systems are made aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of those systems.",
    [
      "security risks associated with organizational activities involving CUI are identified.",
      "policies, standards, and procedures related to the security of the system are identified.",
      "managers, systems administrators, and users of the system are made aware of the security risks associated with their activities.",
      "managers, systems administrators, and users of the system are made aware of the applicable policies, standards, and procedures related to the security of the system.",
    ],
  ],
  [
    "3.2.2",
    "b",
    5,
    "Ensure that personnel are trained to carry out their assigned information security-related duties and responsibilities.",
    [
      "information security-related duties, roles, and responsibilities are defined.",
      "information security-related duties, roles, and responsibilities are assigned to designated personnel.",
      "personnel are adequately trained to carry out their assigned information security-related duties, roles, and responsibilities.",
    ],
  ],
  [
    "3.2.3",
    "d",
    1,
    "Provide security awareness training on recognizing and reporting potential indicators of insider threat.",
    [
      "potential indicators associated with insider threats are identified.",
      "security awareness training on recognizing and reporting potential indicators of insider threat is provided to managers and employees.",
    ],
  ],

  // ---------------- 3.3 Audit and Accountability ----------------
  [
    "3.3.1",
    "b",
    5,
    "Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.",
    [
      "audit logs needed (i.e., event types to be logged) to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity are specified.",
      "the content of audit records needed to support monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity is defined.",
      "audit records are created (generated).",
      "audit records, once created, contain the defined content.",
      "retention requirements for audit records are defined.",
      "audit records are retained as defined.",
    ],
  ],
  [
    "3.3.2",
    "b",
    3,
    "Ensure that the actions of individual system users can be uniquely traced to those users, so they can be held accountable for their actions.",
    [
      "the content of the audit records needed to support the ability to uniquely trace users to their actions is defined.",
      "audit records, once created, contain the defined content.",
    ],
  ],
  [
    "3.3.3",
    "d",
    1,
    "Review and update logged events.",
    [
      "a process for determining when to review logged events is defined.",
      "event types being logged are reviewed in accordance with the defined review process.",
      "event types being logged are updated based on the review.",
    ],
  ],
  [
    "3.3.4",
    "d",
    1,
    "Alert in the event of an audit logging process failure.",
    [
      "personnel or roles to be alerted in the event of an audit logging process failure are identified.",
      "types of audit logging process failures for which alert will be generated are defined.",
      "identified personnel or roles are alerted in the event of an audit logging process failure.",
    ],
  ],
  [
    "3.3.5",
    "d",
    5,
    "Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.",
    [
      "audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity are defined.",
      "defined audit record review, analysis, and reporting processes are correlated.",
    ],
  ],
  [
    "3.3.6",
    "d",
    1,
    "Provide audit record reduction and report generation to support on-demand analysis and reporting.",
    [
      "an audit record reduction capability that supports on-demand analysis is provided.",
      "a report generation capability that supports on-demand reporting is provided.",
    ],
  ],
  [
    "3.3.7",
    "d",
    1,
    "Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.",
    [
      "internal system clocks are used to generate time stamps for audit records.",
      "an authoritative source with which to compare and synchronize internal system clocks is specified.",
      "internal system clocks used to generate time stamps for audit records are compared to and synchronized with the specified authoritative time source.",
    ],
  ],
  [
    "3.3.8",
    "d",
    1,
    "Protect audit information and audit logging tools from unauthorized access, modification, and deletion.",
    [
      ...each(
        ["access", "modification", "deletion"],
        (s) => `audit information is protected from unauthorized ${s}.`,
      ),
      ...each(
        ["access", "modification", "deletion"],
        (s) => `audit logging tools are protected from unauthorized ${s}.`,
      ),
    ],
  ],
  [
    "3.3.9",
    "d",
    1,
    "Limit management of audit logging functionality to a subset of privileged users.",
    [
      "a subset of privileged users granted access to manage audit logging functionality is defined.",
      "management of audit logging functionality is limited to the defined subset of privileged users.",
    ],
  ],

  // ---------------- 3.4 Configuration Management ----------------
  [
    "3.4.1",
    "b",
    5,
    "Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.",
    [
      "a baseline configuration is established.",
      "the baseline configuration includes hardware, software, firmware, and documentation.",
      "the baseline configuration is maintained (reviewed and updated) throughout the system development life cycle.",
      "a system inventory is established.",
      "the system inventory includes hardware, software, firmware, and documentation.",
      "the inventory is maintained (reviewed and updated) throughout the system development life cycle.",
    ],
  ],
  [
    "3.4.2",
    "b",
    5,
    "Establish and enforce security configuration settings for information technology products employed in organizational systems.",
    [
      "security configuration settings for information technology products employed in the system are established and included in the baseline configuration.",
      "security configuration settings for information technology products employed in the system are enforced.",
    ],
  ],
  [
    "3.4.3",
    "d",
    1,
    "Track, review, approve or disapprove, and log changes to organizational systems.",
    [
      "changes to the system are tracked.",
      "changes to the system are reviewed.",
      "changes to the system are approved or disapproved.",
      "changes to the system are logged.",
    ],
  ],
  [
    "3.4.4",
    "d",
    1,
    "Analyze the security impact of changes prior to implementation.",
    ["the security impact of changes to the system is analyzed prior to implementation."],
  ],
  [
    "3.4.5",
    "d",
    5,
    "Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.",
    [
      ...each(
        ["defined", "documented", "approved", "enforced"],
        (s) => `physical access restrictions associated with changes to the system are ${s}.`,
      ),
      ...each(
        ["defined", "documented", "approved", "enforced"],
        (s) => `logical access restrictions associated with changes to the system are ${s}.`,
      ),
    ],
  ],
  [
    "3.4.6",
    "d",
    5,
    "Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.",
    [
      "essential system capabilities are defined based on the principle of least functionality.",
      "the system is configured to provide only the defined essential capabilities.",
    ],
  ],
  [
    "3.4.7",
    "d",
    5,
    "Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.",
    [
      ...["programs", "functions", "ports", "protocols", "services"].flatMap((s) => [
        `essential ${s} are defined.`,
        `the use of nonessential ${s} is defined.`,
        `the use of nonessential ${s} is restricted, disabled, or prevented as defined.`,
      ]),
    ],
  ],
  [
    "3.4.8",
    "d",
    5,
    "Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.",
    [
      "a policy specifying whether whitelisting or blacklisting is to be implemented is specified.",
      "the software allowed to execute under whitelisting or denied use under blacklisting is specified.",
      "whitelisting to allow the execution of authorized software or blacklisting to prevent the use of unauthorized software is implemented as specified.",
    ],
  ],
  [
    "3.4.9",
    "d",
    1,
    "Control and monitor user-installed software.",
    [
      "a policy for controlling the installation of software by users is established.",
      "installation of software by users is controlled based on the established policy.",
      "installation of software by users is monitored.",
    ],
  ],

  // ---------------- 3.5 Identification and Authentication ----------------
  [
    "3.5.1",
    "b",
    5,
    "Identify system users, processes acting on behalf of users, and devices.",
    [
      "system users are identified.",
      "processes acting on behalf of users are identified.",
      "devices accessing the system are identified.",
    ],
  ],
  [
    "3.5.2",
    "b",
    5,
    "Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.",
    [
      "the identity of each user is authenticated or verified as a prerequisite to system access.",
      "the identity of each process acting on behalf of a user is authenticated or verified as a prerequisite to system access.",
      "the identity of each device accessing or connecting to the system is authenticated or verified as a prerequisite to system access.",
    ],
  ],
  [
    "3.5.3",
    "d",
    5,
    "Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.",
    [
      "privileged accounts are identified.",
      "multifactor authentication is implemented for local access to privileged accounts.",
      "multifactor authentication is implemented for network access to privileged accounts.",
      "multifactor authentication is implemented for network access to non-privileged accounts.",
    ],
  ],
  [
    "3.5.4",
    "d",
    1,
    "Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.",
    [
      "replay-resistant authentication mechanisms are implemented for network account access to privileged and non-privileged accounts.",
    ],
  ],
  [
    "3.5.5",
    "d",
    1,
    "Prevent reuse of identifiers for a defined period.",
    [
      "a period within which identifiers cannot be reused is defined.",
      "reuse of identifiers is prevented within the defined period.",
    ],
  ],
  [
    "3.5.6",
    "d",
    1,
    "Disable identifiers after a defined period of inactivity.",
    [
      "a period of inactivity after which an identifier is disabled is defined.",
      "identifiers are disabled after the defined period of inactivity.",
    ],
  ],
  [
    "3.5.7",
    "d",
    1,
    "Enforce a minimum password complexity and change of characters when new passwords are created.",
    [
      "password complexity requirements are defined.",
      "password change of character requirements are defined.",
      "minimum password complexity requirements as defined are enforced when new passwords are created.",
      "minimum password change of character requirements as defined are enforced when new passwords are created.",
    ],
  ],
  [
    "3.5.8",
    "d",
    1,
    "Prohibit password reuse for a specified number of generations.",
    [
      "the number of generations during which a password cannot be reused is specified.",
      "reuse of passwords is prohibited during the specified number of generations.",
    ],
  ],
  [
    "3.5.9",
    "d",
    1,
    "Allow temporary password use for system logons with an immediate change to a permanent password.",
    [
      "an immediate change to a permanent password is required when a temporary password is used for system logon.",
    ],
  ],
  [
    "3.5.10",
    "d",
    5,
    "Store and transmit only cryptographically-protected passwords.",
    [
      "passwords are cryptographically protected in storage.",
      "passwords are cryptographically protected in transit.",
    ],
  ],
  [
    "3.5.11",
    "d",
    1,
    "Obscure feedback of authentication information.",
    ["authentication information is obscured during the authentication process."],
  ],

  // ---------------- 3.6 Incident Response ----------------
  [
    "3.6.1",
    "b",
    5,
    "Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities.",
    [
      "an operational incident-handling capability is established.",
      ...each(
        [
          "preparation",
          "detection",
          "analysis",
          "containment",
          "recovery",
          "user response activities",
        ],
        (s) => `the operational incident-handling capability includes ${s}.`,
      ),
    ],
  ],
  [
    "3.6.2",
    "b",
    5,
    "Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.",
    [
      "incidents are tracked.",
      "incidents are documented.",
      "authorities to whom incidents are to be reported are identified.",
      "organizational officials to whom incidents are to be reported are identified.",
      "identified authorities are notified of incidents.",
      "identified organizational officials are notified of incidents.",
    ],
  ],
  [
    "3.6.3",
    "d",
    1,
    "Test the organizational incident response capability.",
    ["the incident response capability is tested."],
  ],

  // ---------------- 3.7 Maintenance ----------------
  [
    "3.7.1",
    "b",
    3,
    "Perform maintenance on organizational systems.",
    ["system maintenance is performed."],
  ],
  [
    "3.7.2",
    "b",
    5,
    "Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.",
    [
      ...each(
        ["tools", "techniques", "mechanisms", "personnel"],
        (s) => `${s} used to conduct system maintenance are controlled.`,
      ),
    ],
  ],
  [
    "3.7.3",
    "d",
    1,
    "Ensure equipment removed for off-site maintenance is sanitized of any CUI.",
    [
      "equipment to be removed from organizational spaces for off-site maintenance is sanitized of any CUI.",
    ],
  ],
  [
    "3.7.4",
    "d",
    3,
    "Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.",
    [
      "media containing diagnostic and test programs are checked for malicious code before being used in organizational systems that process, store, or transmit CUI.",
    ],
  ],
  [
    "3.7.5",
    "d",
    5,
    "Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.",
    [
      "multifactor authentication is used to establish nonlocal maintenance sessions via external network connections.",
      "nonlocal maintenance sessions established via external network connections are terminated when nonlocal maintenance is complete.",
    ],
  ],
  [
    "3.7.6",
    "d",
    1,
    "Supervise the maintenance activities of maintenance personnel without required access authorization.",
    [
      "maintenance personnel without required access authorization are supervised during maintenance activities.",
    ],
  ],

  // ---------------- 3.8 Media Protection ----------------
  [
    "3.8.1",
    "b",
    3,
    "Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital.",
    [
      "paper media containing CUI is physically controlled.",
      "digital media containing CUI is physically controlled.",
      "paper media containing CUI is securely stored.",
      "digital media containing CUI is securely stored.",
    ],
  ],
  [
    "3.8.2",
    "b",
    3,
    "Limit access to CUI on system media to authorized users.",
    ["access to CUI on system media is limited to authorized users."],
  ],
  [
    "3.8.3",
    "b",
    5,
    "Sanitize or destroy system media containing CUI before disposal or release for reuse.",
    [
      "system media containing CUI is sanitized or destroyed before disposal.",
      "system media containing CUI is sanitized before it is released for reuse.",
    ],
  ],
  [
    "3.8.4",
    "d",
    1,
    "Mark media with necessary CUI markings and distribution limitations.",
    [
      "media containing CUI is marked with applicable CUI markings.",
      "media containing CUI is marked with distribution limitations.",
    ],
  ],
  [
    "3.8.5",
    "d",
    1,
    "Control access to media containing CUI and maintain accountability for media during transport outside of controlled areas.",
    [
      "access to media containing CUI is controlled.",
      "accountability for media containing CUI is maintained during transport outside of controlled areas.",
    ],
  ],
  [
    "3.8.6",
    "d",
    1,
    "Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport unless otherwise protected by alternative physical safeguards.",
    [
      "the confidentiality of CUI stored on digital media is protected during transport using cryptographic mechanisms or alternative physical safeguards.",
    ],
  ],
  [
    "3.8.7",
    "d",
    5,
    "Control the use of removable media on system components.",
    ["the use of removable media on system components is controlled."],
  ],
  [
    "3.8.8",
    "d",
    3,
    "Prohibit the use of portable storage devices when such devices have no identifiable owner.",
    [
      "the use of portable storage devices is prohibited when such devices have no identifiable owner.",
    ],
  ],
  [
    "3.8.9",
    "d",
    1,
    "Protect the confidentiality of backup CUI at storage locations.",
    ["the confidentiality of backup CUI is protected at storage locations."],
  ],

  // ---------------- 3.9 Personnel Security ----------------
  [
    "3.9.1",
    "b",
    3,
    "Screen individuals prior to authorizing access to organizational systems containing CUI.",
    [
      "individuals are screened prior to authorizing access to organizational systems containing CUI.",
    ],
  ],
  [
    "3.9.2",
    "b",
    5,
    "Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.",
    [
      "a policy and/or process for terminating system access and any credentials coincident with personnel actions is established.",
      "system access and credentials are terminated consistent with personnel actions such as termination or transfer.",
      "the system is protected during and after personnel transfer actions.",
    ],
  ],

  // ---------------- 3.10 Physical Protection ----------------
  [
    "3.10.1",
    "b",
    5,
    "Limit physical access to organizational systems, equipment, and the respective operating environments to authorized individuals.",
    [
      "authorized individuals allowed physical access are identified.",
      "physical access to organizational systems is limited to authorized individuals.",
      "physical access to equipment is limited to authorized individuals.",
      "physical access to operating environments is limited to authorized individuals.",
    ],
  ],
  [
    "3.10.2",
    "b",
    5,
    "Protect and monitor the physical facility and support infrastructure for organizational systems.",
    [
      "the physical facility where organizational systems reside is protected.",
      "the support infrastructure for organizational systems is protected.",
      "the physical facility where organizational systems reside is monitored.",
      "the support infrastructure for organizational systems is monitored.",
    ],
  ],
  [
    "3.10.3",
    "d",
    1,
    "Escort visitors and monitor visitor activity.",
    ["visitors are escorted.", "visitor activity is monitored."],
  ],
  [
    "3.10.4",
    "d",
    1,
    "Maintain audit logs of physical access.",
    ["audit logs of physical access are maintained."],
  ],
  [
    "3.10.5",
    "d",
    1,
    "Control and manage physical access devices.",
    [
      "physical access devices are identified.",
      "physical access devices are controlled.",
      "physical access devices are managed.",
    ],
  ],
  [
    "3.10.6",
    "d",
    1,
    "Enforce safeguarding measures for CUI at alternate work sites.",
    [
      "safeguarding measures for CUI are defined for alternate work sites.",
      "safeguarding measures for CUI are enforced for alternate work sites.",
    ],
  ],

  // ---------------- 3.11 Risk Assessment ----------------
  [
    "3.11.1",
    "b",
    3,
    "Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.",
    [
      "the frequency to assess risk to organizational operations, organizational assets, and individuals is defined.",
      "risk to organizational operations, organizational assets, and individuals resulting from the operation of an organizational system that processes, stores, or transmits CUI is assessed with the defined frequency.",
    ],
  ],
  [
    "3.11.2",
    "d",
    5,
    "Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.",
    [
      "the frequency to scan for vulnerabilities in organizational systems and applications is defined.",
      "vulnerability scans are performed on organizational systems with the defined frequency.",
      "vulnerability scans are performed on applications with the defined frequency.",
      "vulnerability scans are performed on organizational systems when new vulnerabilities are identified.",
      "vulnerability scans are performed on applications when new vulnerabilities are identified.",
    ],
  ],
  [
    "3.11.3",
    "d",
    1,
    "Remediate vulnerabilities in accordance with risk assessments.",
    [
      "vulnerabilities are identified.",
      "vulnerabilities are remediated in accordance with risk assessments.",
    ],
  ],

  // ---------------- 3.12 Security Assessment ----------------
  [
    "3.12.1",
    "b",
    5,
    "Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.",
    [
      "the frequency of security control assessments is defined.",
      "security controls are assessed with the defined frequency to determine if the controls are effective in their application.",
    ],
  ],
  [
    "3.12.2",
    "b",
    3,
    "Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.",
    [
      "deficiencies and vulnerabilities to be addressed by the plan of action are identified.",
      "a plan of action is developed to correct identified deficiencies and reduce or eliminate identified vulnerabilities.",
      "the plan of action is implemented to correct identified deficiencies and reduce or eliminate identified vulnerabilities.",
    ],
  ],
  [
    "3.12.3",
    "b",
    5,
    "Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.",
    [
      "security controls are monitored on an ongoing basis to ensure the continued effectiveness of those controls.",
    ],
  ],
  [
    "3.12.4",
    "b",
    0,
    "Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.",
    [
      "a system security plan is developed.",
      "the system boundary is described and documented in the system security plan.",
      "the system environment of operation is described and documented in the system security plan.",
      "the security requirements identified and approved by the designated authority as non-applicable are identified.",
      "the method of security requirement implementation is described and documented in the system security plan.",
      "the relationship with or connection to other systems is described and documented in the system security plan.",
      "the frequency to update the system security plan is defined.",
      "system security plan is updated with the defined frequency.",
    ],
  ],

  // ---------------- 3.13 System and Communications Protection ----------------
  [
    "3.13.1",
    "b",
    5,
    "Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of organizational systems.",
    [
      "the external system boundary is defined.",
      "key internal system boundaries are defined.",
      "communications are monitored at the external system boundary.",
      "communications are monitored at key internal boundaries.",
      "communications are controlled at the external system boundary.",
      "communications are controlled at key internal boundaries.",
      "communications are protected at the external system boundary.",
      "communications are protected at key internal boundaries.",
    ],
  ],
  [
    "3.13.2",
    "b",
    5,
    "Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.",
    [
      "architectural designs that promote effective information security are identified.",
      "software development techniques that promote effective information security are identified.",
      "systems engineering principles that promote effective information security are identified.",
      "identified architectural designs that promote effective information security are employed.",
      "identified software development techniques that promote effective information security are employed.",
      "identified systems engineering principles that promote effective information security are employed.",
    ],
  ],
  [
    "3.13.3",
    "d",
    1,
    "Separate user functionality from system management functionality.",
    [
      "user functionality is identified.",
      "system management functionality is identified.",
      "user functionality is separated from system management functionality.",
    ],
  ],
  [
    "3.13.4",
    "d",
    1,
    "Prevent unauthorized and unintended information transfer via shared system resources.",
    ["unauthorized and unintended information transfer via shared system resources is prevented."],
  ],
  [
    "3.13.5",
    "d",
    5,
    "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
    [
      "publicly accessible system components are identified.",
      "subnetworks for publicly accessible system components are physically or logically separated from internal networks.",
    ],
  ],
  [
    "3.13.6",
    "d",
    5,
    "Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).",
    [
      "network communications traffic is denied by default.",
      "network communications traffic is allowed by exception.",
    ],
  ],
  [
    "3.13.7",
    "d",
    1,
    "Prevent remote devices from simultaneously establishing non-remote connections with organizational systems and communicating via some other connection to resources in external networks (i.e., split tunneling).",
    [
      "remote devices are prevented from simultaneously establishing non-remote connections with the system and communicating via some other connection to resources in external networks (i.e., split tunneling).",
    ],
  ],
  [
    "3.13.8",
    "d",
    3,
    "Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.",
    [
      "cryptographic mechanisms intended to prevent unauthorized disclosure of CUI are identified.",
      "alternative physical safeguards intended to prevent unauthorized disclosure of CUI are identified.",
      "either cryptographic mechanisms or alternative physical safeguards are implemented to prevent unauthorized disclosure of CUI during transmission.",
    ],
  ],
  [
    "3.13.9",
    "d",
    1,
    "Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.",
    [
      "a period of inactivity to terminate network connections associated with communications sessions is defined.",
      "network connections associated with communications sessions are terminated at the end of the sessions.",
      "network connections associated with communications sessions are terminated after the defined period of inactivity.",
    ],
  ],
  [
    "3.13.10",
    "d",
    1,
    "Establish and manage cryptographic keys for cryptography employed in organizational systems.",
    [
      "cryptographic keys are established whenever cryptography is employed.",
      "cryptographic keys are managed whenever cryptography is employed.",
    ],
  ],
  [
    "3.13.11",
    "d",
    5,
    "Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.",
    ["FIPS-validated cryptography is employed to protect the confidentiality of CUI."],
  ],
  [
    "3.13.12",
    "d",
    1,
    "Prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device.",
    [
      "collaborative computing devices are identified.",
      "collaborative computing devices provide indication to users of devices in use.",
      "remote activation of collaborative computing devices is prohibited.",
    ],
  ],
  [
    "3.13.13",
    "d",
    1,
    "Control and monitor the use of mobile code.",
    ["use of mobile code is controlled.", "use of mobile code is monitored."],
  ],
  [
    "3.13.14",
    "d",
    1,
    "Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.",
    [
      "use of Voice over Internet Protocol (VoIP) technologies is controlled.",
      "use of Voice over Internet Protocol (VoIP) technologies is monitored.",
    ],
  ],
  [
    "3.13.15",
    "d",
    5,
    "Protect the authenticity of communications sessions.",
    ["the authenticity of communications sessions is protected."],
  ],
  [
    "3.13.16",
    "d",
    1,
    "Protect the confidentiality of CUI at rest.",
    ["the confidentiality of CUI at rest is protected."],
  ],

  // ---------------- 3.14 System and Information Integrity ----------------
  [
    "3.14.1",
    "b",
    5,
    "Identify, report, and correct system flaws in a timely manner.",
    [
      "the time within which to identify system flaws is specified.",
      "system flaws are identified within the specified time frame.",
      "the time within which to report system flaws is specified.",
      "system flaws are reported within the specified time frame.",
      "the time within which to correct system flaws is specified.",
      "system flaws are corrected within the specified time frame.",
    ],
  ],
  [
    "3.14.2",
    "b",
    5,
    "Provide protection from malicious code at designated locations within organizational systems.",
    [
      "designated locations for malicious code protection are identified.",
      "protection from malicious code at designated locations is provided.",
    ],
  ],
  [
    "3.14.3",
    "b",
    5,
    "Monitor system security alerts and advisories and take action in response.",
    [
      "response actions to system security alerts and advisories are identified.",
      "system security alerts and advisories are monitored.",
      "actions in response to system security alerts and advisories are taken.",
    ],
  ],
  [
    "3.14.4",
    "d",
    5,
    "Update malicious code protection mechanisms when new releases are available.",
    ["malicious code protection mechanisms are updated when new releases are available."],
  ],
  [
    "3.14.5",
    "d",
    3,
    "Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.",
    [
      "the frequency for malicious code scans is defined.",
      "malicious code scans are performed with the defined frequency.",
      "real-time malicious code scans of files from external sources as files are downloaded, opened, or executed are performed.",
    ],
  ],
  [
    "3.14.6",
    "d",
    5,
    "Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.",
    [
      "the system is monitored to detect attacks and indicators of potential attacks.",
      "inbound communications traffic is monitored to detect attacks and indicators of potential attacks.",
      "outbound communications traffic is monitored to detect attacks and indicators of potential attacks.",
    ],
  ],
  [
    "3.14.7",
    "d",
    3,
    "Identify unauthorized use of organizational systems.",
    ["authorized use of the system is defined.", "unauthorized use of the system is identified."],
  ],
];

export const LEVEL2_REQUIREMENTS: readonly Level2Requirement[] = ROWS.map(build);

export const LEVEL2_BY_ID: ReadonlyMap<string, Level2Requirement> = new Map(
  LEVEL2_REQUIREMENTS.map((r) => [r.id, r]),
);
export const LEVEL2_BY_NIST_ID: ReadonlyMap<string, Level2Requirement> = new Map(
  LEVEL2_REQUIREMENTS.map((r) => [r.nistId, r]),
);
