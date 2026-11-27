// "CMMC Level 1 requirements": the 15 FAR 52.204-21(b)(1) safeguards a Level 1 self-assessment
// covers, each with its NIST SP 800-171 Rev. 2 counterpart and its SP 800-171A assessment objectives
// (CUI read as FCI, 32 CFR 170.15(c)(1)(i)), and the yearly self-assessment and affirmation.
//
// Data: the requirement text and objectives come from apps/cmmc's official-text.json (extracted from
// FAR 52.204-21 and NIST's SP 800-171A by apps/cmmc/scripts/extract_official_text.py). The mapping
// (FAR item -> family -> NIST ids) is apps/cmmc/src/shared/controls/level1.ts, mirrored in ROWS below
// because this site is plain JavaScript; test/level1-requirements.test.mjs reads level1.ts and fails
// if the two drift. The free Level 1 plan in the app tracks exactly these 15 requirements.
//
// "What a small shop usually shows" is our own plain-language example of evidence, not a rule: the
// objectives are what an assessment checks, and the shop's senior official decides what is met.

import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import { SITE_NAME } from "./site.mjs";
import { FAMILIES } from "./sprs.mjs";

export const LEVEL1_PATH = "/cmmc-level-1-requirements";

/** [FAR roman numeral, family, short name (ours), NIST SP 800-171 Rev. 2 ids, what a small shop usually shows] */
export const ROWS = [
  [
    "i",
    "AC",
    "Authorized users and devices only",
    ["3.1.1"],
    "A list of the people who use the shop's computers and accounts, the devices allowed on the network, and no shared or leftover accounts (an ex-employee's login switched off).",
  ],
  [
    "ii",
    "AC",
    "Users limited to their own tasks",
    ["3.1.2"],
    "Ordinary users without admin rights; the office PC that holds contract files open only to the people who handle contracts.",
  ],
  [
    "iii",
    "AC",
    "Outside systems controlled",
    ["3.1.20"],
    "A written rule on personal phones, home PCs and outside cloud accounts (for example: no contract files in personal email or personal cloud storage), and a list of the outside systems the shop does use.",
  ],
  [
    "iv",
    "AC",
    "Nothing contract-related posted publicly",
    ["3.1.22"],
    "Named people who may post to the website or social media, and a check that nothing from a contract (drawings, POs, part numbers a prime treats as non-public) goes up.",
  ],
  [
    "v",
    "IA",
    "Every user and device identified",
    ["3.5.1"],
    "Every user with their own login (no shared shop-floor password), and a list of the devices that connect, such as the CAM workstation, the office PCs and the file server.",
  ],
  [
    "vi",
    "IA",
    "Sign-in before access",
    ["3.5.2"],
    "Passwords or another sign-in required on every account and device before it can be used; default passwords on routers and machines changed.",
  ],
  [
    "vii",
    "MP",
    "Media wiped or destroyed before disposal",
    ["3.8.3"],
    "A note of how old drives, USB sticks and paper with contract information are wiped, shredded or destroyed before they leave the shop, with the date each was done.",
  ],
  [
    "viii",
    "PE",
    "Physical access limited",
    ["3.10.1"],
    "Locked office or server closet, and a list of who is allowed in where the computers holding contract information sit.",
  ],
  [
    "ix",
    "PE",
    "Visitors escorted, access logged, keys managed",
    ["3.10.3", "3.10.4", "3.10.5"],
    "A visitor sign-in sheet, a rule that visitors are escorted, and a list of who holds keys, fobs or alarm codes, updated when someone leaves.",
  ],
  [
    "x",
    "SC",
    "Network boundary protected",
    ["3.13.1"],
    "A firewall (often the business router) between the shop and the internet with its settings reviewed, and the network drawn on one page.",
  ],
  [
    "xi",
    "SC",
    "Public-facing systems on their own network",
    ["3.13.5"],
    "Guest Wi-Fi and anything reachable from the internet (a web server, a camera system) kept on a separate network from the office and shop-floor PCs.",
  ],
  [
    "xii",
    "SI",
    "Flaws found and fixed in time",
    ["3.14.1"],
    "Automatic updates on, a monthly look at which machines are behind (including the controller PCs that cannot update, with the reason), and a note when a flaw is fixed.",
  ],
  [
    "xiii",
    "SI",
    "Malware protection in place",
    ["3.14.2"],
    "Anti-malware (Microsoft Defender counts) running on every PC and server, including the CAM and inspection workstations where the software allows it.",
  ],
  [
    "xiv",
    "SI",
    "Malware protection kept updated",
    ["3.14.4"],
    "The anti-malware set to update its definitions by itself, and a screenshot or report showing it did.",
  ],
  [
    "xv",
    "SI",
    "Scans run, downloads scanned",
    ["3.14.5"],
    "Scheduled full scans and real-time scanning of downloads, email attachments and USB sticks turned on.",
  ],
];

const BY_NIST = new Map(official.level2.map((r) => [r.nistId, r]));
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** 32 CFR 170.15(c)(1)(i): read FCI wherever the SP 800-171A objective says CUI. */
export const toFci = (s) => s.replace(/\bCUI\b/g, "FCI");

/**
 * The 15 requirements with their objectives.
 * @returns {{ id: string, farRef: string, family: string, familyName: string, name: string, text: string,
 *   nistIds: string[], objectives: { id: string, text: string }[], shows: string }[]}
 */
export function level1Requirements() {
  if (official.level1.length !== ROWS.length)
    throw new Error(
      `official-text.json has ${official.level1.length} Level 1 items, ROWS ${ROWS.length}`,
    );
  return ROWS.map(([roman, family, name, nistIds, shows], i) => {
    const fam = FAMILIES.find(([, code]) => code === family);
    if (!fam) throw new Error(`unknown family ${family}`);
    return {
      id: `${family}.L1-b.1.${roman}`,
      farRef: `(b)(1)(${roman})`,
      family,
      familyName: fam[2],
      name,
      text: official.level1[i],
      nistIds,
      objectives: nistIds.flatMap((n) => {
        const r = BY_NIST.get(n);
        if (!r) throw new Error(`Level 1 maps to unknown requirement ${n}`);
        return r.objectives.map((o, k) => ({ id: `${n}[${LETTERS[k]}]`, text: toFci(o) }));
      }),
      shows,
    };
  });
}

/** Counts the page quotes, computed from the data (pinned by the test). */
export function level1Counts() {
  const reqs = level1Requirements();
  return {
    requirements: reqs.length,
    objectives: reqs.reduce((s, r) => s + r.objectives.length, 0),
    nistIds: reqs.reduce((s, r) => s + r.nistIds.length, 0),
    families: new Set(reqs.map((r) => r.family)).size,
  };
}

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function requirementBlock(r) {
  return `<section class="requirement" id="${r.id.toLowerCase().replaceAll(".", "-")}">
<h3>${r.id}: ${esc(r.name)}</h3>
<p><strong>FAR 52.204-21${r.farRef}:</strong> ${esc(r.text)}</p>
<p class="muted">NIST SP 800-171 Rev. 2: ${r.nistIds.join(", ")} · ${r.objectives.length} assessment objectives</p>
<p><strong>An assessment checks that:</strong></p>
<ul>${r.objectives.map((o) => `<li><span class="muted">${o.id}</span> ${esc(o.text)}</li>`).join("")}</ul>
<p><strong>What a small shop usually shows:</strong> ${esc(r.shows)}</p>
</section>`;
}

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function level1RequirementsPage({ cite, statusBox, sourcesList, cta }) {
  const reqs = level1Requirements();
  const c = level1Counts();
  const faq = [
    {
      q: "How many requirements are in CMMC Level 1?",
      a: `${c.requirements}: the basic safeguarding requirements of FAR 52.204-21(b)(1)(i) to (xv). Together they have ${c.objectives} assessment objectives, taken from NIST SP 800-171A for the ${c.nistIds} NIST SP 800-171 requirements they correspond to.`,
    },
    {
      q: "Is CMMC Level 1 15 or 17 practices?",
      a: "15 under the current rule (32 CFR 170.14 and 170.15). Material written for CMMC 1.0 counted 17 because it split the physical-access item (ix) into three practices: escorting visitors, keeping physical access logs and managing keys and badges. The work is the same; the count changed.",
    },
    {
      q: "How often is a CMMC Level 1 self-assessment done?",
      a: "Every year. The shop assesses itself against all 15 requirements, enters the result in SPRS, and a senior official affirms continuing compliance in SPRS after the assessment and annually thereafter (32 CFR 170.15 and 170.22).",
    },
    {
      q: "Can CMMC Level 1 use a POA&M or a partial score?",
      a: "No. Level 1 has no points and no POA&M: every requirement must be met, and a requirement counts as met only when all of its objectives are met. Level 1 has no conditional status.",
    },
    {
      q: "Does CMMC Level 1 need a System Security Plan?",
      a: "The Level 1 requirements do not include one (the SSP is NIST SP 800-171 requirement 3.12.4, a Level 2 requirement). Writing down how each of the 15 is met is still the practical way to show the evidence behind a self-assessment and the affirmation.",
    },
    {
      q: "What counts as Federal Contract Information?",
      a: "Information provided by or generated for the government under a contract that is not intended for public release, such as a purchase order's details or a delivery schedule. Information already public, and simple payment transactions, are not FCI (FAR 52.204-21(a)).",
    },
  ];
  return {
    path: LEVEL1_PATH,
    kind: "faq",
    title: `CMMC Level 1 requirements: all 15, with objectives · ${SITE_NAME}`,
    description: `The ${c.requirements} CMMC Level 1 requirements (FAR 52.204-21) with all ${c.objectives} assessment objectives, what a small shop usually shows for each, and the annual SPRS affirmation.`,
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>CMMC Level 1 requirements: all ${c.requirements}, with their objectives</h1>
<p class="lead">CMMC Level 1 is the ${c.requirements} basic safeguarding requirements of ${cite("far-52-204-21", "FAR 52.204-21")},
for any shop that receives Federal Contract Information (FCI). Each is assessed through the objectives of the matching
NIST SP 800-171 requirement in ${cite("nist-800-171a", "NIST SP 800-171A")}, with "FCI" read for "CUI"
(${cite("cfr-170-15", "32 CFR 170.15")}): ${c.objectives} objectives in all, every one of which must be met. Below is each
requirement word for word, the objectives an assessment checks, and an example of what a small machine shop usually shows.</p>
${statusBox()}
<h2>How a Level 1 self-assessment works</h2>
<ol>
  <li><strong>Draw the boundary.</strong> List the computers, accounts, cloud services, rooms and people that handle FCI:
  usually the office PCs, email, the file server and whoever reads purchase orders. Shop-floor machines that never see
  contract information can be outside it.</li>
  <li><strong>Check all ${c.objectives} objectives.</strong> A requirement is met only when every objective under it is met.
  There are no points and no partial credit at Level 1.</li>
  <li><strong>Fix what is open first.</strong> No POA&amp;M is allowed at Level 1 (${cite("cfr-170-21", "32 CFR 170.21")}), so
  an open item has to be closed before the self-assessment is entered.</li>
  <li><strong>Enter the result and affirm, every year.</strong> The self-assessment is done annually and entered in SPRS;
  a senior official affirms continuing compliance in SPRS after it and annually thereafter (${cite("cfr-170-22", "32 CFR 170.22")}).</li>
</ol>
<div class="table-wrap"><table>
  <caption>The ${c.requirements} requirements at a glance</caption>
  <thead><tr><th scope="col">Requirement</th><th scope="col">FAR 52.204-21</th><th scope="col">Family</th><th scope="col">NIST SP 800-171</th><th scope="col">Objectives</th></tr></thead>
  <tbody>
${reqs
  .map(
    (r) =>
      `    <tr><th scope="row"><a href="${LEVEL1_PATH}#${r.id.toLowerCase().replaceAll(".", "-")}">${r.id}</a></th><td>${r.farRef}</td><td>${r.familyName}</td><td>${r.nistIds.join(", ")}</td><td>${r.objectives.length}</td></tr>`,
  )
  .join("\n")}
  </tbody>
</table></div>
<h2>Every requirement, with its objectives</h2>
<p>Requirement text from ${cite("far-52-204-21", "FAR 52.204-21")}; objectives from ${cite("nist-800-171a", "NIST SP 800-171A")},
numbered as there ([a], [b], ...), with CUI read as FCI. The evidence examples are ours, not part of the rule.</p>
${reqs.map(requirementBlock).join("\n")}
<h2>15 or 17?</h2>
<p>CMMC 1.0 material counts 17 Level 1 practices, because it split item (ix) into three: escort visitors and monitor visitor
activity (3.10.3), keep physical access logs (3.10.4), and control and manage keys, badges and codes (3.10.5). The current
rule, ${cite("cfr-170", "32 CFR Part 170")}, follows the FAR's 15 items; item (ix) still carries all three requirements'
objectives, so nothing was dropped.</p>
<h2>Level 1 or Level 2?</h2>
<p>If your shop also receives Controlled Unclassified Information (CUI), such as drawings marked CUI, the contract will call
for Level 2: the 110 requirements of NIST SP 800-171, of which these ${c.requirements} items cover ${c.nistIds}. See
<a href="/cmmc-level-1-vs-level-2">CMMC Level 1 vs Level 2</a>, and for Level 2 the free <a href="/sprs-score-calculator">SPRS score calculator</a>.</p>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Do the Level 1 self-assessment in the free plan</h2>
  <p>The free Level 1 plan tracks these ${c.requirements} requirements: a status and evidence for each, a Level 1 SSP, the
  pass/fail result, and the date the next annual affirmation falls due. It does not submit anything to SPRS or decide what
  is met: your senior official does. See <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList(["far-52-204-21", "nist-800-171a", "cfr-170", "cfr-170-15", "cfr-170-21", "cfr-170-22"])}
${cta}`,
  };
}
