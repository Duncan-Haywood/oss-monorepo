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

/** Sibling product for the same shops (apps/jobshop-site). */
export const JOBSHOP = {
  name: "Job-shop quoting",
  url: "https://marisstella.app/jobshop",
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
    checked: STATUS_CHECKED,
    note: "Innovator (25 or fewer FTEs) $99/mo billed annually; Standard $399/mo billed annually; CMMC Level 2 add-on $1,008/yr.",
  },
  {
    id: "preveil-pass",
    title: "PreVeil Pass",
    url: "https://www.preveil.com/preveil-pass/",
    publisher: "PreVeil",
    checked: STATUS_CHECKED,
    note: "$450/mo for 3 users on a 12-month prepaid contract; includes encrypted email and file sharing for CUI.",
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
