// The 15 CMMC Level 1 security requirements.
//
// `text` is FAR 52.204-21(b)(1)(i)-(xv), Basic Safeguarding of Covered
// Contractor Information Systems (Nov 2021), copied word for word from GSA's
// published FAR source, github.com/GSA/GSA-Acquisition-FAR, dita/52.204-21.dita
// (master, fetched 25 Nov 2026, sha256 5d9ff06b...). 32 CFR 170.14(c)(2) makes
// these the Level 1 requirements. `id` is the CMMC identifier format used in
// 32 CFR 170.15's table (AC.L1-b.1.i ... SI.L1-b.1.xv); `nist` is the NIST SP
// 800-171 Rev. 2 requirement that table maps each one to. Table 2 to
// 170.15(c)(1)(ii) was read directly from the eCFR API on 25 Nov 2026 and all
// 15 rows match; the texts were also re-compared to acquisition.gov that day.
//
// `evidence` is ours: examples of what a small shop might show, not text from
// any rule and not a list an assessor is bound by.

export const DOMAINS = {
  AC: "Access Control",
  IA: "Identification and Authentication",
  MP: "Media Protection",
  PE: "Physical Protection",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
};

export const L1_REQUIREMENTS = [
  {
    id: "AC.L1-b.1.i", far: "(b)(1)(i)", nist: ["3.1.1"],
    text: "Limit information system access to authorized users, processes acting on behalf of authorized users, or devices (including other information systems).",
    evidence: "A list of who has an account on each computer, email and file share that holds contract information; no shared logins; former employees' accounts disabled.",
  },
  {
    id: "AC.L1-b.1.ii", far: "(b)(1)(ii)", nist: ["3.1.2"],
    text: "Limit information system access to the types of transactions and functions that authorized users are permitted to execute.",
    evidence: "Everyday users are not local administrators; folder permissions match job roles (the shop floor cannot change accounting data).",
  },
  {
    id: "AC.L1-b.1.iii", far: "(b)(1)(iii)", nist: ["3.1.20"],
    text: "Verify and control/limit connections to and use of external information systems.",
    evidence: "A written rule on personal phones, home PCs and outside cloud accounts (for example: contract files only in the company account), and how it is enforced.",
  },
  {
    id: "AC.L1-b.1.iv", far: "(b)(1)(iv)", nist: ["3.1.22"],
    text: "Control information posted or processed on publicly accessible information systems.",
    evidence: "Named people who may post to the website and social accounts, and a check that no customer drawings, POs or part numbers from government work are posted.",
  },
  {
    id: "IA.L1-b.1.v", far: "(b)(1)(v)", nist: ["3.5.1"],
    text: "Identify information system users, processes acting on behalf of users, or devices.",
    evidence: "Every person has their own named account; an inventory of the computers and devices that touch contract information.",
  },
  {
    id: "IA.L1-b.1.vi", far: "(b)(1)(vi)", nist: ["3.5.2"],
    text: "Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.",
    evidence: "Passwords (or stronger) required on every account and device; default passwords on routers, printers and machine controllers changed.",
  },
  {
    id: "MP.L1-b.1.vii", far: "(b)(1)(vii)", nist: ["3.8.3"],
    text: "Sanitize or destroy information system media containing Federal Contract Information before disposal or release for reuse.",
    evidence: "A shredding or wiping procedure for paper travelers, USB sticks, old drives and copier hard drives, with a log or certificate when it is done.",
  },
  {
    id: "PE.L1-b.1.viii", far: "(b)(1)(viii)", nist: ["3.10.1"],
    text: "Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.",
    evidence: "Office and server closet locked; who holds keys or badges; computers that hold contract files are not in an unlocked public area.",
  },
  {
    id: "PE.L1-b.1.ix", far: "(b)(1)(ix)", nist: ["3.10.3", "3.10.4", "3.10.5"],
    text: "Escort visitors and monitor visitor activity; maintain audit logs of physical access; and control and manage physical access devices.",
    evidence: "A visitor sign-in log, visitors escorted on the floor, and a key or badge list that is updated when someone leaves.",
  },
  {
    id: "SC.L1-b.1.x", far: "(b)(1)(x)", nist: ["3.13.1"],
    text: "Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems.",
    evidence: "A firewall (often the router's) with default-deny inbound rules and its admin password changed; guest Wi-Fi kept apart from the office network.",
  },
  {
    id: "SC.L1-b.1.xi", far: "(b)(1)(xi)", nist: ["3.13.5"],
    text: "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
    evidence: "The website is hosted outside the shop network, or any public-facing server sits on its own network segment, not on the office LAN.",
  },
  {
    id: "SI.L1-b.1.xii", far: "(b)(1)(xii)", nist: ["3.14.1"],
    text: "Identify, report, and correct information and information system flaws in a timely manner.",
    evidence: "Automatic operating system and software updates turned on, and someone who checks monthly that they ran (including on CAM and inspection PCs).",
  },
  {
    id: "SI.L1-b.1.xiii", far: "(b)(1)(xiii)", nist: ["3.14.2"],
    text: "Provide protection from malicious code at appropriate locations within organizational information systems.",
    evidence: "Anti-malware (the operating system's built-in protection counts if it is on) running on every computer that holds contract information, and email filtering.",
  },
  {
    id: "SI.L1-b.1.xiv", far: "(b)(1)(xiv)", nist: ["3.14.4"],
    text: "Update malicious code protection mechanisms when new releases are available.",
    evidence: "Anti-malware set to update its definitions automatically; a screenshot or report showing current definitions.",
  },
  {
    id: "SI.L1-b.1.xv", far: "(b)(1)(xv)", nist: ["3.14.5"],
    text: "Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.",
    evidence: "Scheduled full scans (for example weekly) plus real-time scanning turned on, so downloads, email attachments and USB files are scanned when opened.",
  },
];

// The NIST SP 800-171A (June 2018) assessment objectives each requirement is
// judged by: 32 CFR 170.15(c)(1)(i) requires a Level 1 self-assessment to use
// them, for the NIST number Table 2 to 170.15(c)(1)(ii) maps the requirement to,
// and says: "In any case where an objective addresses CUI, FCI should be
// substituted for CUI in the objective." Texts are the "Determine if" items
// extracted from nvlpubs.nist.gov NIST.SP.800-171A.pdf on 25 Nov 2026, with
// that substitution made where `fciSubstituted` is true. 59 in all.
export const L1_OBJECTIVES = {
  "AC.L1-b.1.i": [
    {
      "id": "3.1.1[a]",
      "text": "authorized users are identified."
    },
    {
      "id": "3.1.1[b]",
      "text": "processes acting on behalf of authorized users are identified."
    },
    {
      "id": "3.1.1[c]",
      "text": "devices (and other systems) authorized to connect to the system are identified."
    },
    {
      "id": "3.1.1[d]",
      "text": "system access is limited to authorized users."
    },
    {
      "id": "3.1.1[e]",
      "text": "system access is limited to processes acting on behalf of authorized users."
    },
    {
      "id": "3.1.1[f]",
      "text": "system access is limited to authorized devices (including other systems)."
    }
  ],
  "AC.L1-b.1.ii": [
    {
      "id": "3.1.2[a]",
      "text": "the types of transactions and functions that authorized users are permitted to execute are defined."
    },
    {
      "id": "3.1.2[b]",
      "text": "system access is limited to the defined types of transactions and functions for authorized users."
    }
  ],
  "AC.L1-b.1.iii": [
    {
      "id": "3.1.20[a]",
      "text": "connections to external systems are identified."
    },
    {
      "id": "3.1.20[b]",
      "text": "the use of external systems is identified."
    },
    {
      "id": "3.1.20[c]",
      "text": "connections to external systems are verified."
    },
    {
      "id": "3.1.20[d]",
      "text": "the use of external systems is verified."
    },
    {
      "id": "3.1.20[e]",
      "text": "connections to external systems are controlled/limited."
    },
    {
      "id": "3.1.20[f]",
      "text": "the use of external systems is controlled/limited."
    }
  ],
  "AC.L1-b.1.iv": [
    {
      "id": "3.1.22[a]",
      "text": "individuals authorized to post or process information on publicly accessible systems are identified."
    },
    {
      "id": "3.1.22[b]",
      "text": "procedures to ensure FCI is not posted or processed on publicly accessible systems are identified.",
      "fciSubstituted": true
    },
    {
      "id": "3.1.22[c]",
      "text": "a review process is in place prior to posting of any content to publicly accessible systems."
    },
    {
      "id": "3.1.22[d]",
      "text": "content on publicly accessible systems is reviewed to ensure that it does not include FCI.",
      "fciSubstituted": true
    },
    {
      "id": "3.1.22[e]",
      "text": "mechanisms are in place to remove and address improper posting of FCI.",
      "fciSubstituted": true
    }
  ],
  "IA.L1-b.1.v": [
    {
      "id": "3.5.1[a]",
      "text": "system users are identified."
    },
    {
      "id": "3.5.1[b]",
      "text": "processes acting on behalf of users are identified."
    },
    {
      "id": "3.5.1[c]",
      "text": "devices accessing the system are identified."
    }
  ],
  "IA.L1-b.1.vi": [
    {
      "id": "3.5.2[a]",
      "text": "the identity of each user is authenticated or verified as a prerequisite to system access."
    },
    {
      "id": "3.5.2[b]",
      "text": "the identity of each process acting on behalf of a user is authenticated or verified as a prerequisite to system access."
    },
    {
      "id": "3.5.2[c]",
      "text": "the identity of each device accessing or connecting to the system is authenticated or verified as a prerequisite to system access."
    }
  ],
  "MP.L1-b.1.vii": [
    {
      "id": "3.8.3[a]",
      "text": "system media containing FCI is sanitized or destroyed before disposal.",
      "fciSubstituted": true
    },
    {
      "id": "3.8.3[b]",
      "text": "system media containing FCI is sanitized before it is released for reuse.",
      "fciSubstituted": true
    }
  ],
  "PE.L1-b.1.viii": [
    {
      "id": "3.10.1[a]",
      "text": "authorized individuals allowed physical access are identified."
    },
    {
      "id": "3.10.1[b]",
      "text": "physical access to organizational systems is limited to authorized individuals."
    },
    {
      "id": "3.10.1[c]",
      "text": "physical access to equipment is limited to authorized individuals."
    },
    {
      "id": "3.10.1[d]",
      "text": "physical access to operating environments is limited to authorized individuals."
    }
  ],
  "PE.L1-b.1.ix": [
    {
      "id": "3.10.3[a]",
      "text": "visitors are escorted."
    },
    {
      "id": "3.10.3[b]",
      "text": "visitor activity is monitored."
    },
    {
      "id": "3.10.4",
      "text": "audit logs of physical access are maintained."
    },
    {
      "id": "3.10.5[a]",
      "text": "physical access devices are identified."
    },
    {
      "id": "3.10.5[b]",
      "text": "physical access devices are controlled."
    },
    {
      "id": "3.10.5[c]",
      "text": "physical access devices are managed."
    }
  ],
  "SC.L1-b.1.x": [
    {
      "id": "3.13.1[a]",
      "text": "the external system boundary is defined."
    },
    {
      "id": "3.13.1[b]",
      "text": "key internal system boundaries are defined."
    },
    {
      "id": "3.13.1[c]",
      "text": "communications are monitored at the external system boundary."
    },
    {
      "id": "3.13.1[d]",
      "text": "communications are monitored at key internal boundaries."
    },
    {
      "id": "3.13.1[e]",
      "text": "communications are controlled at the external system boundary."
    },
    {
      "id": "3.13.1[f]",
      "text": "communications are controlled at key internal boundaries."
    },
    {
      "id": "3.13.1[g]",
      "text": "communications are protected at the external system boundary."
    },
    {
      "id": "3.13.1[h]",
      "text": "communications are protected at key internal boundaries."
    }
  ],
  "SC.L1-b.1.xi": [
    {
      "id": "3.13.5[a]",
      "text": "publicly accessible system components are identified."
    },
    {
      "id": "3.13.5[b]",
      "text": "subnetworks for publicly accessible system components are physically or logically separated from internal networks."
    }
  ],
  "SI.L1-b.1.xii": [
    {
      "id": "3.14.1[a]",
      "text": "the time within which to identify system flaws is specified."
    },
    {
      "id": "3.14.1[b]",
      "text": "system flaws are identified within the specified time frame."
    },
    {
      "id": "3.14.1[c]",
      "text": "the time within which to report system flaws is specified."
    },
    {
      "id": "3.14.1[d]",
      "text": "system flaws are reported within the specified time frame."
    },
    {
      "id": "3.14.1[e]",
      "text": "the time within which to correct system flaws is specified."
    },
    {
      "id": "3.14.1[f]",
      "text": "system flaws are corrected within the specified time frame."
    }
  ],
  "SI.L1-b.1.xiii": [
    {
      "id": "3.14.2[a]",
      "text": "designated locations for malicious code protection are identified."
    },
    {
      "id": "3.14.2[b]",
      "text": "protection from malicious code at designated locations is provided."
    }
  ],
  "SI.L1-b.1.xiv": [
    {
      "id": "3.14.4",
      "text": "malicious code protection mechanisms are updated when new releases are available."
    }
  ],
  "SI.L1-b.1.xv": [
    {
      "id": "3.14.5[a]",
      "text": "the frequency for malicious code scans is defined."
    },
    {
      "id": "3.14.5[b]",
      "text": "malicious code scans are performed with the defined frequency."
    },
    {
      "id": "3.14.5[c]",
      "text": "real-time malicious code scans of files from external sources as files are downloaded, opened, or executed are performed."
    }
  ]
};
