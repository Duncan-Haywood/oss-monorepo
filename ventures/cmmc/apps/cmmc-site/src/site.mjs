// Site-wide settings and the source register for apps/cmmc-site.
//
// Every number or rule the pages state comes from SOURCES, each with the date we last checked it.
// Copy rules (docs/CLAIMS.md, enforced by test/claims.test.mjs): never claim or imply certification,
// C3PAO status, DoD endorsement or a guaranteed score; no testimonials, logos or customer counts;
// prices are proposals while the product is in early access.

export const SITE_NAME = "Shop Compliance Workspace";
export const SHORT_NAME = "Compliance Workspace";
/** Production URL (origin + base path). The build reads env SITE_URL / BASE_PATH when set. */
export const DEFAULT_SITE_URL = "https://marisstella.app/cmmc";
export const DEFAULT_BASE_PATH = "/cmmc";

/**
 * Sibling product for the same shops. Linked at the catalogue's manufacturing page, which lists it,
 * until its own site (apps/jobshop-site, PR #19780) is served at /jobshop/.
 */
export const JOBSHOP = {
  name: "Job Shop Quote",
  url: "https://marisstella.app/industries/manufacturing/",
  pitch:
    "Turn an RFQ package (drawings, quantities, material) into a priced quote you check before it goes out.",
};

/** Date the CMMC phase status and the competitor prices were last re-verified. */
export const STATUS_CHECKED = "2026-11-24";

/** @typedef {{ id: string, title: string, url: string, publisher: string, checked: string, note?: string }} Source */

/** @type {readonly Source[]} */
export const SOURCES = [
  {
    id: "dod-cio-cmmc",
    title: "CMMC: About (program overview and implementation phases)",
    url: "https://dodcio.defense.gov/CMMC/About/",
    publisher: "DoD (Department of War) CIO",
    checked: STATUS_CHECKED,
    note: "Phase 1 began 10 Nov 2025 and focuses on Level 1 and Level 2 self-assessments.",
  },
  {
    id: "war-gov-phase2",
    title: "Department of War Suspends CMMC Phase II Requirements",
    url: "https://www.war.gov/News/Releases/Release/Article/4542563/forging-the-arsenal-of-freedom-department-of-war-suspends-cmmc-phase-ii-require/",
    publisher: "U.S. Department of War, news release",
    checked: STATUS_CHECKED,
    note: "Phase 2 (planned for 10 Nov 2026) suspended on 13 Jul 2026; a reform task force was set up to review the program.",
  },
  {
    id: "crowell-phase2",
    title:
      "Department of War Immediately Suspends CMMC Phase II Requirements, Launches 60-Day Reform Review",
    url: "https://www.crowell.com/en/insights/client-alerts/department-of-war-immediately-suspends-cmmc-phase-ii-requirements-launches-60-day-reform-review",
    publisher: "Crowell & Moring",
    checked: STATUS_CHECKED,
    note: "DFARS 252.204-7012 and Phase 1 self-assessment requirements are unaffected.",
  },
  {
    id: "wiley-pause",
    title: "DoD Pauses CMMC 2.0 Implementation: A Big Deal with Little Immediate Impact",
    url: "https://www.wiley.law/alert-DOD-Pauses-CMMC-2-0-Implementation-A-Big-Deal-with-Little-Immediate-Impact",
    publisher: "Wiley Rein",
    checked: STATUS_CHECKED,
    note: "Level 1 and Level 2 self-assessments remain required.",
  },
  {
    id: "igc-task-force",
    title: "CMMC Reform Task Force Updates (September 2026)",
    url: "https://www.insidegovernmentcontracts.com/2026/09/cmmc-reform-task-force-updates-september-2026/",
    publisher: "Covington, Inside Government Contracts",
    checked: STATUS_CHECKED,
    note: "Coverage through mid-October 2026 reported no published task-force report and no new Phase 2 date.",
  },
  {
    id: "cfr-170",
    title: "32 CFR Part 170, Cybersecurity Maturity Model Certification (CMMC) Program",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170",
    publisher: "eCFR",
    checked: STATUS_CHECKED,
  },
  {
    id: "cfr-170-21",
    title: "32 CFR 170.21, Plan of Action and Milestones requirements",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.21",
    publisher: "eCFR",
    checked: STATUS_CHECKED,
  },
  {
    id: "far-52-204-21",
    title: "FAR 52.204-21, Basic Safeguarding of Covered Contractor Information Systems",
    url: "https://www.acquisition.gov/far/52.204-21",
    publisher: "Acquisition.gov",
    checked: STATUS_CHECKED,
  },
  {
    id: "cfr-170-15",
    title: "32 CFR 170.15, CMMC Level 1 self-assessment and affirmation requirements",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.15",
    publisher: "eCFR",
    checked: "2026-11-25",
    note: "Level 1 (Self) is assessed annually and entered in SPRS; where an SP 800-171A objective says CUI, read FCI (170.15(c)(1)(i)).",
  },
  {
    id: "cfr-170-22",
    title: "32 CFR 170.22, Affirmation",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.22",
    publisher: "eCFR",
    checked: "2026-11-25",
    note: "The affirming official affirms continuing compliance in SPRS after every assessment and annually thereafter.",
  },
  {
    id: "cfr-170-16",
    title: "32 CFR 170.16, CMMC Level 2 self-assessment and affirmation requirements",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.16",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "Level 2 (Self): assessed against NIST SP 800-171A every three years, results in SPRS, affirmed at each assessment and annually; a POA&M closed out within 180 days. Read on the LII copy of the eCFR.",
  },
  {
    id: "cfr-170-24",
    title: "32 CFR 170.24, CMMC Scoring Methodology",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.24",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "A requirement is MET only when all applicable objectives are satisfied by evidence in final form; an objective that is N/A counts as MET. Read on the LII copy of the eCFR.",
  },
  {
    id: "nist-800-171a",
    title:
      "NIST SP 800-171A, Assessing Security Requirements for Controlled Unclassified Information",
    url: "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171A.pdf",
    publisher: "NIST",
    checked: "2026-11-25",
    note: "The assessment objectives Level 1 and Level 2 requirements are checked against.",
  },
  {
    id: "nist-800-171r2",
    title: "NIST SP 800-171 Rev. 2, Protecting CUI in Nonfederal Systems and Organizations",
    url: "https://csrc.nist.gov/pubs/sp/800/171/r2/upd1/final",
    publisher: "NIST",
    checked: STATUS_CHECKED,
  },
  {
    id: "dod-methodology",
    title: "DoD Assessment Methodology for NIST SP 800-171, Version 1.2.1",
    url: "https://www.acq.osd.mil/asda/dpc/cp/cyber/docs/safeguarding/NIST-SP-800-171-Assessment-Methodology-Version-1.2.1-6.24.2020.pdf",
    publisher: "DoD, Defense Pricing and Contracting",
    checked: STATUS_CHECKED,
    note: "Scoring starts at 110 and subtracts 1, 3 or 5 points per requirement not met; the lowest score is -203.",
  },
  {
    id: "dfars-7012",
    title:
      "DFARS 252.204-7012, Safeguarding Covered Defense Information and Cyber Incident Reporting",
    url: "https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting.",
    publisher: "Acquisition.gov",
    checked: STATUS_CHECKED,
  },
  {
    id: "dfars-7008",
    title:
      "DFARS 252.204-7008, Compliance With Safeguarding Covered Defense Information Controls (OCT 2016)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7008",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "Read on the eCFR versioner API, 27 Nov 2026; text kept in fixtures/dfars/.",
  },
  {
    id: "dfars-7019",
    title: "DFARS 252.204-7019, Notice of NIST SP 800-171 DoD Assessment Requirements (NOV 2023)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7019",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "A current assessment is not more than 3 years old unless the solicitation says less; read 27 Nov 2026.",
  },
  {
    id: "dfars-7020",
    title: "DFARS 252.204-7020, NIST SP 800-171 DoD Assessment Requirements (NOV 2023)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7020",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "Basic, Medium and High Assessments; 14 business days to rebut; read 27 Nov 2026.",
  },
  {
    id: "dfars-7021",
    title:
      "DFARS 252.204-7021, Contractor Compliance With the Cybersecurity Maturity Model Certification Level Requirements (NOV 2025)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7021",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "Current status: 1 year (Final Level 1), 3 years (Final Level 2), 180 days (Conditional); read 27 Nov 2026.",
  },
  {
    id: "dfars-7024",
    title:
      "DFARS 252.204-7024, Notice on the Use of the Supplier Performance Risk System (MAR 2023)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7024",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "SPRS item, price and supplier risk ratings in evaluation; read 27 Nov 2026.",
  },
  {
    id: "dfars-7025",
    title:
      "DFARS 252.204-7025, Notice of Cybersecurity Maturity Model Certification Level Requirements (NOV 2025)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7025",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "The level is required before award, with CMMC UIDs in the proposal; read 27 Nov 2026.",
  },
  {
    id: "dfars-204-7304",
    title: "DFARS 204.7304, Solicitation provisions and contract clauses (7008, 7012, 7019, 7020)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-A/part-204/subpart-204.73/section-204.7304",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "All solicitations and contracts except COTS-only buys; read 27 Nov 2026.",
  },
  {
    id: "dfars-204-7504",
    title: "DFARS 204.7504, Solicitation provision and contract clause (7021, 7025)",
    url: "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-A/part-204/subpart-204.75/section-204.7504",
    publisher: "eCFR",
    checked: "2026-11-27",
    note: "7021 where a level is set until 9 Nov 2028; where FCI or CUI is processed from 10 Nov 2028; read 27 Nov 2026.",
  },
  {
    id: "venable-size",
    title: "The Cybersecurity Maturity Model Certification Is Here",
    url: "https://www.venable.com/insights/publications/2025/09/the-cybersecurity-maturity-model-certification-is",
    publisher: "Venable",
    checked: STATUS_CHECKED,
    note: "DoD estimates 337,968 affected contractors, 229,818 of them small entities.",
  },
  {
    id: "preveil-costs",
    title: "Making CMMC Compliance Affordable for SMBs",
    url: "https://www.preveil.com/blog/making-cmmc-compliance-affordable-for-smbs",
    publisher: "PreVeil",
    checked: STATUS_CHECKED,
    note: "Policy and documentation development, including writing the SSP and POA&M: $3,000-$25,000 (in-house IT time and outside providers).",
  },
  {
    id: "secureframe-consultant",
    title: "CMMC Consultants: When You Need One & How to Choose",
    url: "https://secureframe.com/hub/cmmc/consultant",
    publisher: "Secureframe",
    checked: STATUS_CHECKED,
    note: "Consultant costs for small and mid-sized contractors roughly $3,500-$20,000.",
  },
  {
    id: "futurefeed-pricing",
    title: "FutureFeed pricing",
    url: "https://futurefeed.co/pricing",
    publisher: "FutureFeed",
    checked: "2026-11-28",
    note: "Innovator (25 or fewer FTEs) $99/mo billed annually, $198/mo billed monthly; Standard (26-999 FTEs) $399/mo billed annually; CMMC Level 1 included; Level 2 add-on $1,008/yr; unlimited users.",
  },
  {
    id: "preveil-pass",
    title: "PreVeil Pass",
    url: "https://www.preveil.com/preveil-pass/",
    publisher: "PreVeil",
    checked: "2026-11-28",
    note: "$450/mo for 3 users on a 12-month prepaid contract; includes encrypted email and file sharing for CUI.",
  },
  {
    id: "cuicktrac-pricing",
    title: "Cuick Trac pricing",
    url: "https://cuicktrac.com/pricing/",
    publisher: "Cuick Trac",
    checked: "2026-11-28",
    note: "No published price: quoted by users, applications, support and environment complexity; a managed enclave on GCC High and Azure Government.",
  },
  {
    id: "project-spectrum",
    title: "Project Spectrum",
    url: "https://www.projectspectrum.io/",
    publisher: "Project Spectrum",
    checked: "2026-11-28",
    note: "No published price (tailored packages); a cyber self-assessment against NIST SP 800-171 and CMMC Levels 1 and 2, training and advisory services.",
  },
];

/** @param {string} id */
export function source(id) {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown source id: ${id}`);
  return s;
}

/** Wording shown next to the early-access form; stored with each signup (consent_text_version). */
export const CONSENT_VERSION = "2026-11-24";
export const CONSENT_TEXT =
  "Email me about early access to the Shop Compliance Workspace. I will get one email to confirm my address; nothing more is sent unless I confirm. I can leave the list at any time.";
