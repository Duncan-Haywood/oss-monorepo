// Source citations for the control library and the scoring rules. Every requirement, objective and
// weight in this folder comes from US government publications, which are public domain (17 U.S.C. § 105).
//
// VERIFICATION STATUS:
// Transcribed 2026-11-24 without access to the official hosts. Verified 2026-11-25 against them:
// requirements and basic/derived against NIST's SP 800-171 Rev. 2 spreadsheet, objectives against the
// SP 800-171A PDF, Level 1 against FAR 52.204-21(b)(1) on eCFR, point values against the lists in
// 32 CFR 170.24(c)(2)(i)(B) on eCFR. Three wording errors were found and fixed (FAR item (xv);
// objectives 3.13.14[a] and [b]). official-text.test.ts now fails on any drift from
// official-text.json, which scripts/extract_official_text.py rebuilds from the sources. See docs/SOURCES.md.

export interface SourceRef {
  key: string;
  title: string;
  version: string;
  date: string;
  publisher: string;
  url: string;
}

export const SOURCES = {
  nist171r2: {
    key: "nist171r2",
    title:
      "NIST SP 800-171 Rev. 2, Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations",
    version: "Revision 2 (includes updates as of January 28, 2021)",
    date: "2020-02",
    publisher: "National Institute of Standards and Technology",
    url: "https://doi.org/10.6028/NIST.SP.800-171r2",
  },
  nist171a: {
    key: "nist171a",
    title:
      "NIST SP 800-171A, Assessing Security Requirements for Controlled Unclassified Information",
    version: "June 2018 (assessment objectives for SP 800-171 Rev. 1/Rev. 2 requirements)",
    date: "2018-06",
    publisher: "National Institute of Standards and Technology",
    url: "https://doi.org/10.6028/NIST.SP.800-171A",
  },
  far52204_21: {
    key: "far52204_21",
    title:
      "FAR 52.204-21, Basic Safeguarding of Covered Contractor Information Systems, paragraph (b)(1)(i)-(xv)",
    version: "Clause as codified at 48 CFR 52.204-21",
    date: "2016-06",
    publisher: "Federal Acquisition Regulation (GSA/DoD/NASA)",
    url: "https://www.ecfr.gov/current/title-48/chapter-1/subchapter-H/part-52/subpart-52.2/section-52.204-21",
  },
  cfr32part170: {
    key: "cfr32part170",
    title: "32 CFR Part 170, Cybersecurity Maturity Model Certification (CMMC) Program",
    version: "Final rule, 89 FR 83092 (Oct. 15, 2024), effective Dec. 16, 2024",
    date: "2024-10-15",
    publisher: "Department of Defense",
    url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170",
  },
  dodMethodology: {
    key: "dodMethodology",
    title: "NIST SP 800-171 DoD Assessment Methodology",
    version: "Version 1.2.1",
    date: "2020-06-24",
    publisher: "Department of Defense, Defense Pricing and Contracting",
    url: "https://www.acq.osd.mil/asda/dpc/cp/cyber/safeguarding.html",
  },
} as const satisfies Record<string, SourceRef>;

/**
 * What CMMC Level 2 references. 32 CFR 170.14(c)(3), read on eCFR 2026-11-25: "The security
 * requirements in CMMC Level 2 are identical to the requirements in NIST SP 800-171 R2." DoD class
 * deviation 2024-O0013 (May 2024) kept DFARS 252.204-7012 on Rev. 2 after NIST published Rev. 3; that
 * deviation was not re-read (dodcio.defense.gov and acq.osd.mil still refuse this environment).
 * Rev. 3 is NOT the CMMC baseline. Re-check when 32 CFR 170.14 or 170.2 changes.
 */
export const LEVEL2_BASELINE = {
  references:
    "NIST SP 800-171 Rev. 2 (110 requirements) and NIST SP 800-171A (June 2018, 320 objectives)",
  notRev3: true,
  basis: [
    "32 CFR 170.14(c)(3)",
    "DoD class deviation 2024-O0013 (DFARS 252.204-7012 stays on Rev. 2)",
  ],
  checkedOn: "2026-11-25",
  checkedAgainstOfficialSource: true,
} as const;

export const LIBRARY_VERIFICATION = {
  transcribedOn: "2026-11-24",
  verifiedAgainstOfficialText: true,
  verifiedOn: "2026-11-25",
  note: "Requirements, objectives, Level 1 items and point values compared word for word with NIST SP 800-171 Rev. 2, NIST SP 800-171A, FAR 52.204-21(b)(1) and 32 CFR 170.24 on 2026-11-25; a unit test keeps them equal.",
} as const;
