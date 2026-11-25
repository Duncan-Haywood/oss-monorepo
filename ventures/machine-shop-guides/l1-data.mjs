// The 15 CMMC Level 1 security requirements.
//
// `text` is FAR 52.204-21(b)(1)(i)-(xv), Basic Safeguarding of Covered
// Contractor Information Systems (Nov 2021), copied word for word from GSA's
// published FAR source, github.com/GSA/GSA-Acquisition-FAR, dita/52.204-21.dita
// (master, fetched 25 Nov 2026, sha256 5d9ff06b...). 32 CFR 170.14(c)(2) makes
// these the Level 1 requirements. `id` is the CMMC identifier format used in
// 32 CFR 170.15's table (AC.L1-b.1.i ... SI.L1-b.1.xv); `nist` is the NIST SP
// 800-171 Rev. 2 requirement that table maps each one to (see SOURCES.md for
// what was and was not re-read).
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
