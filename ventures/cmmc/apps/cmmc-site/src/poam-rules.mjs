// "Which CMMC requirements can go on a POA&M": every one of the 110 NIST SP 800-171 Rev. 2
// requirements with its point value and whether an open one may sit on a Level 2 POA&M, built from
// the same data and rules as the SPRS calculator (sprs.mjs, which reads apps/cmmc's
// official-text.json) and the app (apps/cmmc/src/shared/controls/scoring.ts, poamEligibility).
// Rules, 32 CFR 170.21(a)(2) and (b): score at least 88 of 110; only 1-point requirements open,
// except 3.13.11 when CUI is encrypted but not FIPS-validated (3 points); six never allowed; close-out
// within 180 days. Nothing here is computed at request time: the page is static.

import { SITE_NAME } from "./site.mjs";
import {
  CONDITIONAL_MIN_SCORE,
  FAMILIES,
  MAX_SCORE,
  PARTIAL,
  POAM_EXCLUDED,
  REQUIREMENTS,
  SSP_ID,
} from "./sprs.mjs";

export const POAM_PATH = "/cmmc-poam-eligible-requirements";

/** One verdict per requirement, if it were open (not met). */
export function poamVerdict(r) {
  if (r.nistId === SSP_ID)
    return { status: "never", why: "No points, but without an SSP there is no assessment at all" };
  if (POAM_EXCLUDED.includes(r.nistId))
    return { status: "never", why: "Named in 32 CFR 170.21(a)(2) as never allowed on a POA&M" };
  if (r.weight === 1) return { status: "yes", why: "1-point requirement" };
  if (r.nistId === "3.13.11")
    return {
      status: "partial",
      why: "Only when CUI is encrypted but the encryption is not FIPS-validated (3 points); unencrypted, 5 points and not allowed",
    };
  return { status: "no", why: `Worth ${r.weight} points; must be met before the assessment` };
}

/** Counts the page quotes, computed from the data (and pinned by test/poam-rules.test.mjs). */
export function poamCounts() {
  const v = REQUIREMENTS.map((r) => ({ ...r, ...poamVerdict(r) }));
  const yes = v.filter((r) => r.status === "yes");
  const budget = MAX_SCORE - CONDITIONAL_MIN_SCORE;
  return {
    total: v.length,
    yes: yes.length,
    partial: v.filter((r) => r.status === "partial").length,
    no: v.filter((r) => r.status === "no").length,
    never: v.filter((r) => r.status === "never").length,
    fivePoint: v.filter((r) => r.weight === 5).length,
    threePoint: v.filter((r) => r.weight === 3).length,
    onePoint: v.filter((r) => r.weight === 1).length,
    /** 1-point requirements excluded anyway (the physical-access trio and the two AC ones). */
    onePointExcluded: v.filter((r) => r.weight === 1 && r.status === "never").length,
    budget,
    /** Most open items at the 88 floor: every lost point on a 1-point requirement. */
    maxOpenItems: Math.min(budget, yes.length),
    /** With 3.13.11 on partial credit, its 3 points leave this many 1-pointers. */
    maxOpenWithEncryption: 1 + Math.min(budget - 3, yes.length),
  };
}

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const LABEL = {
  yes: "Yes",
  partial: "Only on partial credit",
  no: "No",
  never: "Never",
};

function familyTable(code, name) {
  const rows = REQUIREMENTS.filter((r) => r.family === code)
    .map((r) => {
      const v = poamVerdict(r);
      return `<tr><th scope="row">${r.code}</th><td>${esc(r.text)}</td><td>${r.weight}</td><td class="poam-${v.status}"><strong>${LABEL[v.status]}</strong><br><span class="muted">${esc(v.why)}</span></td></tr>`;
    })
    .join("\n");
  const n = REQUIREMENTS.filter((r) => r.family === code);
  const ok = n.filter((r) => poamVerdict(r).status === "yes").length;
  return `<h3 id="${code.toLowerCase()}">${name} (${code}): ${ok} of ${n.length} may go on a POA&amp;M</h3>
<div class="table-wrap"><table>
  <thead><tr><th scope="col">Requirement</th><th scope="col">Text</th><th scope="col">Points</th><th scope="col">On a POA&amp;M?</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>`;
}

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function poamRulesPage({ cite, statusBox, sourcesList, cta }) {
  const c = poamCounts();
  const faq = [
    {
      q: "Which CMMC Level 2 requirements can go on a POA&M?",
      a: `${c.yes} of the ${c.total}: the 1-point requirements, less the five 1-point ones 32 CFR 170.21 names as never allowed (3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5). 3.13.11 may also go on one when CUI is encrypted but the encryption is not FIPS-validated. The ${c.fivePoint} 5-point and ${c.threePoint} 3-point requirements, and the SSP (3.12.4), must be met before the assessment.`,
    },
    {
      q: "How many requirements can be open on a CMMC POA&M?",
      a: `At most ${c.maxOpenItems}. A conditional status needs a score of at least ${CONDITIONAL_MIN_SCORE} of ${MAX_SCORE}, so ${c.budget} points can be open, and every eligible requirement but one is worth 1 point. With 3.13.11 on its 3-point partial credit, the most is ${c.maxOpenWithEncryption}.`,
    },
    {
      q: "Can a CMMC Level 1 self-assessment have a POA&M?",
      a: "No. Level 1 must meet all 15 requirements; 32 CFR 170.21 allows no POA&M at Level 1.",
    },
    {
      q: "How long do I have to close a CMMC POA&M?",
      a: "180 days from the date of the conditional status. The close-out is a new assessment of the open items; if it is not passed in time, the conditional status expires (32 CFR 170.21(b)).",
    },
    {
      q: "Why can't visitor escort and physical access logs go on a POA&M if they are only 1 point?",
      a: "32 CFR 170.21(a)(2) names them (3.10.3, 3.10.4 and 3.10.5, with 3.1.20, 3.1.22 and the SSP, 3.12.4) as requirements that may never be on a POA&M, whatever their point value. In a small shop they are usually cheap to meet: a visitor log, an escort rule and a list of who holds keys or badges.",
    },
  ];
  return {
    path: POAM_PATH,
    kind: "faq",
    title: `Which CMMC requirements can go on a POA&M: all 110 · ${SITE_NAME}`,
    description: `All 110 NIST SP 800-171 requirements with their points and whether an open one may sit on a CMMC Level 2 POA&M: ${c.yes} may, ${c.no + c.never} must be met first. From 32 CFR 170.21.`,
    changefreq: "monthly",
    priority: 0.8,
    faq,
    body: `<h1>Which CMMC requirements can go on a POA&amp;M</h1>
<p class="lead">For a Conditional Level 2 status, a shop may leave some requirements open on a Plan of Action and Milestones
(POA&amp;M) and close them within 180 days. Only ${c.yes} of the ${c.total} NIST SP 800-171 requirements qualify, plus one
on partial credit. Every requirement is listed below with its point value and the rule that decides it
(${cite("cfr-170-21", "32 CFR 170.21")}).</p>
${statusBox()}
<h2>The four rules</h2>
<ol>
  <li><strong>Score at least ${CONDITIONAL_MIN_SCORE} of ${MAX_SCORE}</strong> (80%) with the open items counted, scored by the
  ${cite("dod-methodology", "DoD Assessment Methodology")}. Work it out with the <a href="/sprs-score-calculator">SPRS score calculator</a>.</li>
  <li><strong>Only 1-point requirements may be open.</strong> The ${c.fivePoint} requirements worth 5 points and the
  ${c.threePoint} worth 3 must be met. The one exception is 3.13.11 (CUI encryption): if CUI is encrypted but the
  encryption is not FIPS-validated, it scores 3 and may go on the POA&amp;M.</li>
  <li><strong>Six requirements are never allowed</strong>, whatever their points: 3.1.20 (external connections), 3.1.22
  (publicly accessible content), 3.12.4 (the system security plan), and 3.10.3, 3.10.4 and 3.10.5 (escorting visitors,
  physical access logs, managing physical access devices). Five of the six are 1-point requirements, so the 1-point rule
  alone does not catch them.</li>
  <li><strong>Close within 180 days.</strong> A close-out assessment of the open items must pass within 180 days of the
  conditional status, or the status expires. Level 1 allows no POA&amp;M at all.</li>
</ol>
<h2>What that leaves, in numbers</h2>
<div class="table-wrap"><table>
  <caption>The ${c.total} Level 2 requirements, if each were open</caption>
  <thead><tr><th scope="col">Group</th><th scope="col">Requirements</th></tr></thead>
  <tbody>
    <tr><th scope="row">May go on a POA&amp;M (1 point, not excluded)</th><td>${c.yes}</td></tr>
    <tr><th scope="row">Only on partial credit (3.13.11)</th><td>${c.partial}</td></tr>
    <tr><th scope="row">Must be met: worth 3 or 5 points</th><td>${c.no}</td></tr>
    <tr><th scope="row">Never allowed (named in the rule)</th><td>${c.never}</td></tr>
  </tbody>
</table></div>
<p>Since the score must stay at ${CONDITIONAL_MIN_SCORE} or above, at most ${c.budget} points can be open: that is at most
${c.maxOpenItems} requirements, or ${c.maxOpenWithEncryption} when one of them is 3.13.11 on partial credit. In practice the
POA&amp;M is for the small items left at the end, not a way to defer multi-factor authentication or encryption: both are
5-point requirements (3.5.3 also has a 3-point partial credit, but unlike 3.13.11 it may not go on a POA&amp;M).</p>
<h2>Every requirement, family by family</h2>
<p>Requirement text from ${cite("nist-800-171r2", "NIST SP 800-171 Rev. 2")}; point values from the DoD Assessment
Methodology as listed in 32 CFR 170.24. Jump to a family:
${FAMILIES.map(([, code]) => `<a href="${POAM_PATH}#${code.toLowerCase()}">${code}</a>`).join(" · ")}.</p>
${FAMILIES.map(([, code, name]) => familyTable(code, name)).join("\n")}
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Keep the POA&amp;M with the rules applied</h2>
  <p>The workspace flags an open requirement that may not sit on a POA&amp;M as you mark it, checks the ${CONDITIONAL_MIN_SCORE}-point
  floor, and reminds each item's owner before the 180-day close-out. It does not decide your status: your senior official
  makes the self-assessment and affirmation in SPRS. See <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList(["cfr-170-21", "cfr-170", "dod-methodology", "nist-800-171r2"])}
${cta}`,
  };
}

/** Exported for tests: the partial-credit ids the page talks about must still be the calculator's. */
export const PARTIAL_IDS = Object.keys(PARTIAL);
