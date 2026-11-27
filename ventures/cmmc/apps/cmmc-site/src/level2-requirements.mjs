// "CMMC Level 2 requirements": the 110 NIST SP 800-171 Rev. 2 requirements a Level 2 assessment
// covers, family by family, each word for word with its basic/derived kind, its point value, whether
// an open one may sit on a POA&M, and every one of its NIST SP 800-171A assessment objectives (320).
//
// Data: requirement text, kind and objectives come from apps/cmmc's official-text.json (extracted from
// NIST's spreadsheet and SP 800-171A by apps/cmmc/scripts/extract_official_text.py and tested word for
// word there); points and the POA&M verdict come from sprs.mjs and poam-rules.mjs, the same code the
// SPRS calculator and the POA&M page use. test/level2-requirements.test.mjs pins the counts.
//
// The per-family "what a small shop usually shows" lines are our own plain-language examples of
// evidence, labelled as such on the page, not a rule: the objectives are what an assessment checks.

import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };
import { POAM_PATH, poamVerdict } from "./poam-rules.mjs";
import { SHORT_NAME } from "./site.mjs";
import { CONDITIONAL_MIN_SCORE, FAMILIES, MAX_SCORE, REQUIREMENTS } from "./sprs.mjs";

export const LEVEL2_PATH = "/cmmc-level-2-requirements";

/** Our own examples of evidence a small machine shop usually shows, one per family. */
export const FAMILY_SHOWS = {
  AC: "A list of who has an account on the systems that hold CUI and what each may do, admin rights kept to the people who need them, screen locks and session time-outs, remote access through one controlled route, and Wi-Fi with its own password and encryption.",
  AT: "A short yearly security training with a sign-off sheet, a note of the extra training given to whoever runs the computers, and a reminder to spot phishing and report odd behaviour.",
  AU: "Logging turned on for the computers and accounts in scope, a named person who reviews the logs on a schedule, alerts when logging fails, and the clocks synced to one time source.",
  CM: "An inventory of the computers and software in scope, a standard setup for each kind of PC, a record of changes made to them, and a list of the software allowed to run.",
  IA: "Every user with their own login, multi-factor authentication on remote access, admin accounts and email, password rules set in the system, and passwords stored only as hashes.",
  IR: "A one-page incident plan naming who to call, a log of incidents and how each was handled, a yearly test of the plan, and the DFARS 252.204-7012 72-hour report procedure where it applies.",
  MA: "A record of maintenance on the systems in scope, outside technicians supervised, their tools checked, and remote maintenance sessions protected with multi-factor authentication and closed afterwards.",
  MP: "CUI drawings and USB sticks kept in a locked drawer, media marked CUI, drives wiped or destroyed before disposal with the date noted, and USB storage blocked where it is not needed.",
  PS: "A background or reference check before someone gets access to CUI, and a leaver checklist that switches off accounts and collects keys, badges and laptops on the last day.",
  PE: "The office or server closet locked, a list of who may enter, a visitor sign-in sheet and escort rule, a list of who holds keys, fobs and alarm codes, and a rule for working on CUI from home.",
  RA: "A yearly risk assessment written down, vulnerability scans on a schedule, and a record of which findings were fixed and when.",
  CA: "The system security plan, a yearly review of whether the controls still work, a plan of action for the gaps, and someone named to watch the controls in between.",
  SC: "A firewall at the boundary with its rules reviewed, guest Wi-Fi separate from the CUI network, FIPS-validated encryption for CUI in transit and at rest, and no split tunnelling on remote connections.",
  SI: "Updates applied on a schedule with a list of the machines that cannot update and why, anti-malware running and updating itself, security alerts followed, and scans of downloads and email.",
};

const BY_NIST = new Map(official.level2.map((r) => [r.nistId, r]));
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * The 110 requirements with kind, points, POA&M verdict and objectives.
 * @returns {{ nistId: string, code: string, family: string, kind: string, text: string, weight: number,
 *   poam: { status: string, why: string }, objectives: { id: string, text: string }[] }[]}
 */
export function level2Requirements() {
  return REQUIREMENTS.map((r) => {
    const o = BY_NIST.get(r.nistId);
    if (!o) throw new Error(`no official text for ${r.nistId}`);
    return {
      nistId: r.nistId,
      code: r.code,
      family: r.family,
      kind: o.kind,
      text: r.text,
      weight: r.weight,
      poam: poamVerdict(r),
      objectives: o.objectives.map((t, k) => ({ id: `${r.nistId}[${LETTERS[k]}]`, text: t })),
    };
  });
}

/** Counts the page quotes, computed from the data (pinned by the test). */
export function level2Counts() {
  const reqs = level2Requirements();
  const families = FAMILIES.map(([, code, name]) => {
    const f = reqs.filter((r) => r.family === code);
    return {
      code,
      name,
      requirements: f.length,
      objectives: f.reduce((s, r) => s + r.objectives.length, 0),
      points: f.reduce((s, r) => s + r.weight, 0),
    };
  });
  const most = reqs.reduce((a, r) => (r.objectives.length > a.objectives.length ? r : a));
  return {
    requirements: reqs.length,
    objectives: reqs.reduce((s, r) => s + r.objectives.length, 0),
    basic: reqs.filter((r) => r.kind === "basic").length,
    derived: reqs.filter((r) => r.kind === "derived").length,
    families,
    mostObjectives: { nistId: most.nistId, count: most.objectives.length },
  };
}

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const anchor = (code) => code.toLowerCase().replaceAll(".", "-");

const POAM_LABEL = {
  yes: "may go on a POA&amp;M",
  partial: "on a POA&amp;M only on partial credit",
  no: "must be met before the assessment",
  never: "never on a POA&amp;M",
};

function requirementBlock(r) {
  const label = Object.hasOwn(POAM_LABEL, r.poam.status) ? POAM_LABEL[r.poam.status] : "";
  return `<section class="requirement" id="${anchor(r.code)}">
<h4>${r.code}</h4>
<p>${esc(r.text)}</p>
<p class="muted">${r.kind === "basic" ? "Basic" : "Derived"} requirement · ${r.weight === 0 ? "no points (but no score without it)" : `${r.weight} point${r.weight === 1 ? "" : "s"}`} · ${label} · ${r.objectives.length} objective${r.objectives.length === 1 ? "" : "s"}</p>
<ul>${r.objectives.map((o) => `<li><span class="muted">${o.id}</span> ${esc(o.text)}</li>`).join("")}</ul>
</section>`;
}

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function level2RequirementsPage({ cite, statusBox, sourcesList, cta }) {
  const reqs = level2Requirements();
  const c = level2Counts();
  const faq = [
    {
      q: "How many requirements are in CMMC Level 2?",
      a: `${c.requirements}: every security requirement of NIST SP 800-171 Rev. 2, in ${c.families.length} families (${c.basic} basic and ${c.derived} derived). They are assessed through ${c.objectives} assessment objectives from NIST SP 800-171A.`,
    },
    {
      q: "When is a CMMC Level 2 requirement met?",
      a: "Only when every applicable assessment objective under it is satisfied by evidence in final form: drafts, working papers and unapproved policies do not count. An objective that does not apply (for example, public-access separation when no system is public) counts as met (32 CFR 170.24(b)).",
    },
    {
      q: "How often is a CMMC Level 2 self-assessment done?",
      a: "Every three years, with the results entered in SPRS, and a senior official affirms continuing compliance in SPRS at each assessment and annually thereafter (32 CFR 170.16). Some contracts require a third-party (C3PAO) assessment instead; the solicitation says which.",
    },
    {
      q: "What goes into SPRS for a Level 2 self-assessment?",
      a: "At least the CMMC level, the status date, the assessment scope, the CAGE codes of the systems in scope, the overall score (for example 105 out of 110) and, if one is used, the POA&M and its status (32 CFR 170.16(a)(1)(i)).",
    },
    {
      q: "Is a CMMC Level 2 self-assessment the same as a NIST SP 800-171 self-assessment?",
      a: "They cover the same 110 requirements and the same scoring. The CMMC version adds the 32 CFR Part 170 rules: the scoping rules, the POA&M limits, a 180-day close-out and the annual affirmation.",
    },
    {
      q: "Does CMMC Level 2 use NIST SP 800-171 Revision 2 or Revision 3?",
      a: "Revision 2. 32 CFR 170 incorporates NIST SP 800-171 Rev. 2 and SP 800-171A (June 2018) by reference, so a Level 2 assessment is against these 110 requirements and 320 objectives, not the Revision 3 set.",
    },
  ];
  const famLinks = c.families
    .map((f) => `<a href="${LEVEL2_PATH}#family-${f.code.toLowerCase()}">${f.code}</a>`)
    .join(" · ");
  return {
    path: LEVEL2_PATH,
    kind: "faq",
    title: `CMMC Level 2 requirements: all 110, with objectives · ${SHORT_NAME}`,
    description: `All ${c.requirements} CMMC Level 2 requirements (NIST SP 800-171 Rev. 2) word for word, with their ${c.objectives} assessment objectives, points and POA&M rule, family by family.`,
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>CMMC Level 2 requirements: all ${c.requirements}, with their ${c.objectives} objectives</h1>
<p class="lead">CMMC Level 2 is the ${c.requirements} security requirements of ${cite("nist-800-171r2", "NIST SP 800-171 Rev. 2")},
for any shop that handles Controlled Unclassified Information (CUI). Each is assessed through its objectives in
${cite("nist-800-171a", "NIST SP 800-171A")}, ${c.objectives} in all, and scored from ${MAX_SCORE} down (${cite("cfr-170-24", "32 CFR 170.24")}).
Below is every requirement word for word, with its point value, whether an open one may sit on a POA&amp;M, and the
objectives an assessment checks.</p>
${statusBox()}
<h2>How a Level 2 self-assessment works</h2>
<ol>
  <li><strong>Draw the boundary.</strong> List the computers, accounts, cloud services, rooms and people that store, process
  or send CUI, and the security tools that protect them. The CMMC scoping rules decide what else is in
  (${cite("cfr-170-16", "32 CFR 170.16")}).</li>
  <li><strong>Check every objective.</strong> A requirement is met only when every applicable objective under it is met, with
  evidence in final form; an objective that does not apply counts as met (${cite("cfr-170-24", "32 CFR 170.24")}).</li>
  <li><strong>Score it.</strong> Start at ${MAX_SCORE} and subtract 5, 3 or 1 for each requirement not met. Work yours out with
  the free <a href="/sprs-score-calculator">SPRS score calculator</a>.</li>
  <li><strong>Close or plan the gaps.</strong> With a score of at least ${CONDITIONAL_MIN_SCORE} and only eligible items open,
  the shop can reach Conditional Level 2 (Self) with a POA&amp;M, closed out within 180 days
  (<a href="${POAM_PATH}">which requirements can go on a POA&amp;M</a>).</li>
  <li><strong>Enter the result and affirm.</strong> The results go into SPRS; a senior official affirms at each assessment
  and every year after. The self-assessment is repeated every three years (${cite("cfr-170-16", "32 CFR 170.16")}).</li>
</ol>
<div class="table-wrap"><table>
  <caption>The ${c.families.length} families at a glance</caption>
  <thead><tr><th scope="col">Family</th><th scope="col">Requirements</th><th scope="col">Objectives</th><th scope="col">Points at stake</th></tr></thead>
  <tbody>
${c.families
  .map(
    (f) =>
      `    <tr><th scope="row"><a href="${LEVEL2_PATH}#family-${f.code.toLowerCase()}">${f.name} (${f.code})</a></th><td>${f.requirements}</td><td>${f.objectives}</td><td>${f.points}</td></tr>`,
  )
  .join("\n")}
    <tr><th scope="row">All families</th><td>${c.requirements}</td><td>${c.objectives}</td><td>${c.families.reduce((s, f) => s + f.points, 0)}</td></tr>
  </tbody>
</table></div>
<p>"Points at stake" is what the family's requirements subtract if none is met. ${c.mostObjectives.nistId} has the most
objectives of any requirement (${c.mostObjectives.count}).</p>
<h2>Every requirement, family by family</h2>
<p>Requirement text from ${cite("nist-800-171r2", "NIST SP 800-171 Rev. 2")}; objectives from
${cite("nist-800-171a", "NIST SP 800-171A")}, numbered as there ([a], [b], ...); point values from the
${cite("dod-methodology", "DoD Assessment Methodology")}; POA&amp;M rule from ${cite("cfr-170-21", "32 CFR 170.21")}.
The "usually shows" line under each family is our own example, not part of the rule. Jump to a family: ${famLinks}.</p>
${c.families
  .map(
    (
      f,
    ) => `<h3 id="family-${f.code.toLowerCase()}">${f.name} (${f.code}): ${f.requirements} requirements, ${f.objectives} objectives</h3>
<p><strong>What a small shop usually shows:</strong> ${esc(Object.hasOwn(FAMILY_SHOWS, f.code) ? FAMILY_SHOWS[f.code] : "")}</p>
${reqs
  .filter((r) => r.family === f.code)
  .map(requirementBlock)
  .join("\n")}`,
  )
  .join("\n")}
<h2>Level 1 or Level 2?</h2>
<p>If your contracts only involve Federal Contract Information, such as purchase orders and delivery schedules, you are
looking at Level 1: <a href="/cmmc-level-1-requirements">15 requirements</a>, all drawn from this list. See
<a href="/cmmc-level-1-vs-level-2">CMMC Level 1 vs Level 2</a>.</p>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Work through all ${c.objectives} objectives in one place</h2>
  <p>The Level 2 plan keeps a status, owner and evidence for each requirement with its objectives beside it, builds the
  SSP and POA&amp;M from them, keeps the SPRS score current and reminds you before the 180-day close-out and the annual affirmation. It does
  not submit anything to SPRS or decide what is met: your senior official does. See <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList(["nist-800-171r2", "nist-800-171a", "cfr-170", "cfr-170-16", "cfr-170-21", "cfr-170-24", "dod-methodology"])}
${cta}`,
  };
}
