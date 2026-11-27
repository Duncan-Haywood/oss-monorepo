// CMMC Level 1 = the 15 basic safeguarding requirements of FAR 52.204-21(b)(1)(i)-(xv)
// (32 CFR 170.14(c)(2)). Identifiers follow the CMMC Level 1 Assessment Guide ("AC.L1-b.1.i").
//
// "15 or 17?": CMMC 2.0 Level 1 has 15 requirements, one per FAR clause item. Older CMMC 1.0 /
// early 2.0 material split item (ix) into three practices (PE.L1-3.10.3, 3.10.4, 3.10.5) and counted
// 17. Each Level 1 requirement below lists the NIST SP 800-171 Rev. 2 requirement(s) it corresponds to;
// its assessment objectives are those requirements' SP 800-171A objectives (item ix uses all three).
// Level 1 has no point values and no POA&M: every requirement must be MET (32 CFR 170.15, 170.21).
// 32 CFR 170.15(c)(1)(i): "In any case where an objective addresses CUI, FCI should be substituted for
// CUI in the objective." So Level 1 objectives read FCI (3.1.22[b], [d], [e] and 3.8.3[a], [b]); the
// mapping to NIST numbers is Table 2 to 170.15(c)(1)(ii) (read on eCFR 2026-11-25).
// Sources and verification status: ./sources.ts. Public domain.
import { type FamilyCode, LEVEL2_BY_NIST_ID, type Objective } from "./level2";

/** 32 CFR 170.15(c)(1)(i): Level 1 objectives read FCI wherever the SP 800-171A objective says CUI. */
export const toLevel1Objective = (o: Objective): Objective => ({
  id: o.id,
  text: o.text.replace(/\bCUI\b/g, "FCI"),
});

export interface Level1Requirement {
  id: string;
  /** FAR 52.204-21 paragraph, e.g. "(b)(1)(i)" */
  farRef: string;
  family: FamilyCode;
  text: string;
  /** NIST SP 800-171 Rev. 2 requirement numbers this item corresponds to. */
  nistIds: string[];
  objectives: Objective[];
}

type Row = [roman: string, family: FamilyCode, text: string, nistIds: string[]];

const ROWS: Row[] = [
  [
    "i",
    "AC",
    "Limit information system access to authorized users, processes acting on behalf of authorized users, or devices (including other information systems).",
    ["3.1.1"],
  ],
  [
    "ii",
    "AC",
    "Limit information system access to the types of transactions and functions that authorized users are permitted to execute.",
    ["3.1.2"],
  ],
  [
    "iii",
    "AC",
    "Verify and control/limit connections to and use of external information systems.",
    ["3.1.20"],
  ],
  [
    "iv",
    "AC",
    "Control information posted or processed on publicly accessible information systems.",
    ["3.1.22"],
  ],
  [
    "v",
    "IA",
    "Identify information system users, processes acting on behalf of users, or devices.",
    ["3.5.1"],
  ],
  [
    "vi",
    "IA",
    "Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.",
    ["3.5.2"],
  ],
  [
    "vii",
    "MP",
    "Sanitize or destroy information system media containing Federal Contract Information before disposal or release for reuse.",
    ["3.8.3"],
  ],
  [
    "viii",
    "PE",
    "Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.",
    ["3.10.1"],
  ],
  [
    "ix",
    "PE",
    "Escort visitors and monitor visitor activity; maintain audit logs of physical access; and control and manage physical access devices.",
    ["3.10.3", "3.10.4", "3.10.5"],
  ],
  [
    "x",
    "SC",
    "Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems.",
    ["3.13.1"],
  ],
  [
    "xi",
    "SC",
    "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
    ["3.13.5"],
  ],
  [
    "xii",
    "SI",
    "Identify, report, and correct information and information system flaws in a timely manner.",
    ["3.14.1"],
  ],
  [
    "xiii",
    "SI",
    "Provide protection from malicious code at appropriate locations within organizational information systems.",
    ["3.14.2"],
  ],
  [
    "xiv",
    "SI",
    "Update malicious code protection mechanisms when new releases are available.",
    ["3.14.4"],
  ],
  [
    "xv",
    "SI",
    "Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.",
    ["3.14.5"],
  ],
];

export const LEVEL1_REQUIREMENTS: readonly Level1Requirement[] = ROWS.map(
  ([roman, family, text, nistIds]) => ({
    id: `${family}.L1-b.1.${roman}`,
    farRef: `(b)(1)(${roman})`,
    family,
    text,
    nistIds,
    objectives: nistIds.flatMap((n) => {
      const req = LEVEL2_BY_NIST_ID.get(n);
      if (!req) throw new Error(`Level 1 maps to unknown requirement ${n}`);
      return req.objectives.map(toLevel1Objective);
    }),
  }),
);

export const LEVEL1_BY_ID: ReadonlyMap<string, Level1Requirement> = new Map(
  LEVEL1_REQUIREMENTS.map((r) => [r.id, r]),
);
