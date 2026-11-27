// Page content for apps/cmmc-site. Each page: path, title, description, body (HTML for <main>).
// Links inside bodies use site paths ("/pricing"); the build prefixes the base path.
// Copy rules: see the header of site.mjs and docs/CLAIMS.md.
import {
  CONSENT_TEXT,
  JOBSHOP,
  SHORT_NAME,
  SITE_NAME,
  SOURCES,
  STATUS_CHECKED,
  source,
} from "./site.mjs";
import { MIN_SCORE, RESULT_MARKER, renderForm } from "./sprs.mjs";

/** "2026-11-24" -> "24 Nov 2026" */
export function humanDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** External link to a registered source. */
export function cite(id, text) {
  const s = source(id);
  return `<a href="${s.url}" rel="noopener" data-source="${s.id}">${text ?? s.publisher}</a>`;
}

/** The dated CMMC status box shown on every page. */
export function statusBox() {
  return `<aside class="status" aria-label="CMMC rollout status">
  <p><strong>CMMC status, checked ${humanDate(STATUS_CHECKED)}:</strong>
  Phase 1 has been in effect since 10 Nov 2025 (${cite("dod-cio-cmmc", "DoD CIO")}).
  Phase 2, planned for 10 Nov 2026, was suspended on 13 Jul 2026 (${cite("war-gov-phase2", "Department of War release")}),
  and Level 1 and Level 2 self-assessments are still required (${cite("crowell-phase2", "Crowell")}, ${cite("wiley-pause", "Wiley")}).
  We found no announced restart date for Phase 2 (${cite("igc-task-force", "latest coverage")}). Rules change: check the DoD CIO page before you rely on this.</p>
</aside>`;
}

const sourcesList = (ids) =>
  `<section class="sources"><h2>Sources</h2><ul>${ids
    .map((id) => {
      const s = source(id);
      return `<li><a href="${s.url}" rel="noopener">${s.title}</a>, ${s.publisher} (cited ${humanDate(s.checked)})${s.note ? `. ${s.note}` : ""}</li>`;
    })
    .join("")}</ul></section>`;

const cta = `<p class="cta"><a class="button" href="/early-access">Join early access</a> <span class="muted">No charge during early access. One confirmation email, nothing else unless you confirm.</span></p>`;

/**
 * @typedef {{
 *   path: string, title: string, description: string, body: string,
 *   changefreq?: "weekly" | "monthly" | "yearly", priority?: number,
 *   indexable?: boolean, kind?: "home" | "faq" | "pricing" | "article" | "page",
 *   faq?: { q: string, a: string }[]
 * }} Page
 */

const levelFaq = [
  {
    q: "What is the difference between CMMC Level 1 and Level 2?",
    a: "Level 1 protects Federal Contract Information (FCI) with the 15 basic safeguarding requirements of FAR 52.204-21 and is an annual self-assessment. Level 2 protects Controlled Unclassified Information (CUI) with the 110 requirements of NIST SP 800-171 Rev. 2 and is either a self-assessment or a third-party (C3PAO) assessment every three years, as the contract specifies.",
  },
  {
    q: "Which level does my shop need?",
    a: "Your contract decides. If you only receive FCI (for example purchase orders and basic contract information), the requirement is Level 1. If you receive CUI, such as controlled technical drawings marked CUI, it is Level 2. The solicitation states the level; ask your prime or contracting officer if it is unclear.",
  },
  {
    q: "What is an SPRS score?",
    a: "The score you post in the Supplier Performance Risk System from the DoD Assessment Methodology for NIST SP 800-171. It starts at 110 and subtracts 1, 3 or 5 points for each requirement not met, so it ranges from 110 down to -203.",
  },
  {
    q: "Can a Level 1 self-assessment use a POA&M?",
    a: "No. Under 32 CFR 170.21, Level 1 must meet every requirement; plans of action are not allowed. Level 2 may reach a conditional status with a POA&M if the score is at least 88 of 110 and only eligible requirements are open, and the POA&M must be closed within 180 days.",
  },
  {
    q: "Did the Phase 2 suspension remove the requirement?",
    a: `No. As of ${humanDate(STATUS_CHECKED)}, Phase 2 (third-party Level 2 assessments as a general contract condition) is suspended, but Phase 1 remains in effect: Level 1 and Level 2 self-assessments and annual affirmations are still required where contracts call for them, and DFARS 252.204-7012 still applies.`,
  },
];

const sprsFaq = [
  {
    q: "What is a good SPRS score?",
    a: "110 means every requirement is met. For a Conditional Level 2 (Self) status, 32 CFR 170.21 needs at least 88 (80% of 110) with only POA&M-eligible requirements open, and those must be closed within 180 days. Below that, or with a 3- or 5-point requirement open, the open items have to be fixed first.",
  },
  {
    q: "Can my SPRS score be negative?",
    a: "Yes. The DoD Assessment Methodology subtracts up to 313 points from 110, so the lowest possible score is -203.",
  },
  {
    q: "Which requirements can go on a POA&M?",
    a: "Only 1-point requirements, plus 3.13.11 when CUI is encrypted but the encryption is not FIPS-validated. Six can never be on a POA&M: 3.1.20, 3.1.22, 3.12.4, 3.10.3, 3.10.4 and 3.10.5 (32 CFR 170.21(a)(2)).",
  },
  {
    q: "Does a partly met requirement count?",
    a: "No, except for the two partial credits (3.5.3 and 3.13.11). A requirement counts as met only when every one of its NIST SP 800-171A assessment objectives is met.",
  },
  {
    q: "Is this score official?",
    a: "No. It applies the published scoring rules to your ticks. Your shop's senior official makes the self-assessment and posts the score and affirmation in SPRS, and the score is only as good as the evidence behind each tick.",
  },
];

/** @type {readonly Page[]} */
export const PAGES = [
  {
    path: "/",
    kind: "home",
    title: `${SITE_NAME} · CMMC Level 1/2 and ISO 9001 paperwork for small machine shops`,
    description:
      "Prepare your System Security Plan, POA&M and SPRS score in-house instead of a $3k–25k consultant engagement. A workspace for small defense and aerospace machine shops. Early access.",
    changefreq: "weekly",
    priority: 1,
    body: `<section class="hero">
  <p class="eyebrow">Early access · for small defense and aerospace machine shops</p>
  <h1>Your SSP, POA&amp;M and SPRS score, prepared in-house</h1>
  <p class="lead">Outside help to write the System Security Plan and Plan of Action and Milestones is commonly quoted at
  <strong>$3,000–$25,000</strong> (${cite("preveil-costs", "PreVeil's estimate")}, which counts in-house IT time and outside providers;
  ${cite("secureframe-consultant", "Secureframe")} puts consultants for small contractors at roughly $3,500–$20,000).
  ${SHORT_NAME} walks the person who already runs your shop's IT through each requirement, in shop-floor language, and keeps the
  documents, the evidence and the score in one place.</p>
  ${cta}
</section>
${statusBox()}
<section>
  <h2>What you get out of it</h2>
  <ul class="cards">
    <li><h3>System Security Plan</h3><p>An SSP built from your answers about your actual machines, network, people and
    vendors: one entry per requirement, saying how you meet it or that you don't yet.</p></li>
    <li><h3>POA&amp;M</h3><p>Every open item with an owner, a due date and a note on whether it may sit on a POA&amp;M at all
    (${cite("cfr-170-21", "32 CFR 170.21")} lists the ones that can't).</p></li>
    <li><h3>SPRS score</h3><p>Your score under the ${cite("dod-methodology", "DoD Assessment Methodology")}, recalculated as you
    close items, with the point value of each open requirement so you fix the expensive ones first.</p></li>
    <li><h3>ISO 9001 / AS9100 records</h3><p>Document control, internal audits and corrective actions next to the security
    work, because the same people do both in a small shop.</p></li>
  </ul>
</section>
<section>
  <h2>Who it is for</h2>
  <p>Shops of roughly 5 to 100 people that machine or fabricate parts for defense or aerospace primes, have no full-time
  security staff, and need to post a Level 1 or Level 2 self-assessment. DoD estimates ${cite("venable-size", "229,818 small entities")}
  among the 337,968 contractors the CMMC rule affects.</p>
  <p>Not sure which level applies? Read <a href="/cmmc-level-1-vs-level-2">CMMC Level 1 vs Level 2</a>. Want a number first? Try the free <a href="/sprs-score-calculator">SPRS score calculator</a>.</p>
</section>
<section>
  <h2>What it is not</h2>
  <p>We are not a C3PAO, not an assessor, and not affiliated with or endorsed by the DoD or the Cyber AB. Using the workspace
  does not certify your shop or guarantee any score or assessment result: your score is what your own evidence supports,
  and your senior official signs the affirmation. See <a href="/what-it-does">what it does and does not do</a>.</p>
</section>
<section class="sibling">
  <h2>From the same team, for the same shops</h2>
  <p><a href="${JOBSHOP.url}">${JOBSHOP.name}</a>: ${JOBSHOP.pitch}</p>
</section>
${cta}`,
  },
  {
    path: "/cmmc-level-1-vs-level-2",
    kind: "faq",
    title: `CMMC Level 1 vs Level 2 for machine shops · ${SITE_NAME}`,
    description:
      "Plain-language explainer: what CMMC Level 1 and Level 2 require, which one your contract triggers, how SPRS scoring and POA&Ms work, and where the rollout stands.",
    changefreq: "monthly",
    priority: 0.9,
    faq: levelFaq,
    body: `<h1>CMMC Level 1 vs Level 2, for machine shops</h1>
<p class="lead">The level is set by the information your contract gives you, not by the size of your shop.
Level 1 covers Federal Contract Information; Level 2 covers Controlled Unclassified Information (CUI).</p>
${statusBox()}
<div class="table-wrap"><table>
  <caption>Level 1 and Level 2 side by side (${cite("cfr-170", "32 CFR Part 170")})</caption>
  <thead><tr><th scope="col"></th><th scope="col">Level 1</th><th scope="col">Level 2</th></tr></thead>
  <tbody>
    <tr><th scope="row">Protects</th><td>Federal Contract Information (FCI)</td><td>Controlled Unclassified Information (CUI)</td></tr>
    <tr><th scope="row">Requirements</th><td>15 safeguarding requirements, ${cite("far-52-204-21", "FAR 52.204-21")}</td><td>110 requirements, ${cite("nist-800-171r2", "NIST SP 800-171 Rev. 2")}</td></tr>
    <tr><th scope="row">Assessment</th><td>Self-assessment every year</td><td>Self-assessment or third-party (C3PAO) assessment every three years, as the contract states</td></tr>
    <tr><th scope="row">Affirmation</th><td>Annual, by a senior official, in SPRS</td><td>After each assessment and annually, in SPRS</td></tr>
    <tr><th scope="row">POA&amp;M allowed?</th><td>No: every requirement must be met</td><td>Yes, for a conditional status: score of at least 88/110, only eligible items open, closed within 180 days (${cite("cfr-170-21", "32 CFR 170.21")})</td></tr>
    <tr><th scope="row">Score</th><td>Met or not met</td><td>SPRS score from 110 down to -203 (${cite("dod-methodology", "DoD Assessment Methodology")})</td></tr>
  </tbody>
</table></div>
<h2>Which level does my shop need?</h2>
<p>Look at what you receive. Purchase orders, delivery schedules and ordinary contract paperwork are FCI, which means Level 1.
Drawings, specifications or data marked CUI (often with a distribution statement and a CUI banner) mean Level 2.
The solicitation names the level; when in doubt, ask your prime or the contracting officer in writing.</p>
<h2>What is an SPRS score?</h2>
<p>It is the number you post in the Supplier Performance Risk System for a Level 2 self-assessment. Start at 110 and subtract
1, 3 or 5 points for each of the 110 requirements you do not meet. Missing multi-factor authentication or FIPS-validated
encryption can cost 5 points each, and without an SSP the assessment cannot be completed at all. Work yours out with the free
<a href="/sprs-score-calculator">SPRS score calculator</a>.</p>
<h2>What do the SSP and POA&amp;M have to say?</h2>
<p>The System Security Plan describes the boundary of the system that handles FCI or CUI (which machines, people, rooms and
cloud services), and for each requirement how it is met. The Plan of Action and Milestones lists each requirement that is not
met yet, what you will do and by when.</p>
<h2>Where does the rollout stand?</h2>
<p>Phase 1, in effect since 10 Nov 2025, mainly brings Level 1 and Level 2 self-assessments into contracts (${cite("dod-cio-cmmc", "DoD CIO")}).
Phase 2 would have made third-party Level 2 assessments a general contract condition from 10 Nov 2026; it was suspended on
13 Jul 2026 while a reform task force reviews the program (${cite("war-gov-phase2", "release")}). The underlying rule, 32 CFR Part 170, was not repealed,
and the safeguarding duties of ${cite("dfars-7012", "DFARS 252.204-7012")} still apply to CUI.</p>
<h2>Where does ISO 9001 fit?</h2>
<p>ISO 9001 (and AS9100 for aerospace) is a quality management standard, separate from CMMC. It does not count toward a CMMC
assessment, but both need controlled documents, records, internal audits and corrective actions, so a small shop can run them
from one place.</p>
<h2>Common questions</h2>
${levelFaq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
${sourcesList(["dod-cio-cmmc", "war-gov-phase2", "crowell-phase2", "wiley-pause", "igc-task-force", "cfr-170", "cfr-170-21", "far-52-204-21", "nist-800-171r2", "dod-methodology", "dfars-7012"])}
${cta}`,
  },
  {
    path: "/what-it-does",
    kind: "page",
    title: `What it does and does not do · ${SITE_NAME}`,
    description:
      "What the compliance workspace does (SSP, POA&M, SPRS score, evidence, ISO 9001 records) and what it does not (certify you, assess you, store CUI, or promise a score).",
    changefreq: "monthly",
    priority: 0.8,
    body: `<h1>What it does, and what it does not do</h1>
<p class="lead">A workspace for the person in a small shop who has been handed CMMC on top of their real job.
It is in early access: the list below is what we are building with the first shops.</p>
<div class="two-col">
<section>
  <h2>Does</h2>
  <ul class="check">
    <li>Asks plain questions about your shop (machines, network, who has access, which vendors and clouds) and drafts the SSP from your answers only. Anything you have not answered stays marked as a gap; nothing is filled in for you.</li>
    <li>Tracks each of the 15 Level 1 or 110 Level 2 requirements as met, not met or not applicable, with the evidence you attach.</li>
    <li>Imports the self-assessment spreadsheet you already keep: choose the Excel workbook (or a CSV), preview which requirements change, then apply. The workbook is read in your browser and only the assessment sheet is sent. Statuses, owners, notes and implementation statements come across; rows it cannot read are listed by line, not guessed.</li>
    <li>Keeps the Level 2 asset inventory by the five scoping categories of 32 CFR 170.19(c), and imports the asset list you already have (an Excel workbook, a CSV, or the CSV from the free scoping worksheet). The category is your decision: a row without one is listed, not guessed. Link your network diagram of the assessment scope to the inventory, and the SSP names it.</li>
    <li>Calculates your SPRS score with the DoD Assessment Methodology weights and shows which open items cost the most points.</li>
    <li>Builds the POA&amp;M, flags requirements that may not sit on one, and reminds owners before the 180-day close-out. Already keep one in Excel? Import it: dates written month first (12/31/2026) or day first (31/12/2026) are read in the order the sheet uses, and anything unclear is listed by line, not guessed.</li>
    <li>Reminds the senior official about the annual affirmation and keeps the record of what was affirmed and when.</li>
    <li>Keeps ISO 9001 / AS9100 records (document control, internal audits, corrective actions) beside the CMMC work.</li>
    <li>Exports the SSP, POA&amp;M and score worksheet as documents you own and can hand to an assessor or prime.</li>
  </ul>
</section>
<section>
  <h2>Does not</h2>
  <ul class="cross">
    <li>Certify your shop. We are not a C3PAO or an assessor, and we are not affiliated with or endorsed by the DoD or the Cyber AB.</li>
    <li>Guarantee a score, an assessment result or a contract award. The score is what your own evidence supports.</li>
    <li>Post to SPRS or sign the affirmation for you. Your senior official does that, in SPRS.</li>
    <li>Fix your network. It tells you what is missing; your IT person or MSP closes the gap.</li>
    <li>Hold CUI. The workspace is for documents <em>about</em> your system, not the controlled drawings themselves (see <a href="/security">security</a>).</li>
    <li>Give legal advice. For contract questions, ask your contracting officer or counsel.</li>
  </ul>
</section>
</div>
${statusBox()}
<h2>Also for the same shops</h2>
<p><a href="${JOBSHOP.url}">${JOBSHOP.name}</a>: ${JOBSHOP.pitch}</p>
${cta}`,
  },
  {
    path: "/security",
    kind: "page",
    title: `Security: how your documents are stored · ${SITE_NAME}`,
    description:
      "How the workspace stores your SSP, POA&M and evidence: encryption, per-shop separation, access, retention and export, and why CUI itself does not belong in it.",
    changefreq: "monthly",
    priority: 0.7,
    body: `<h1>Security: how your documents are stored</h1>
<p class="lead">An SSP is a map of your weak spots, so we treat it like one. The workspace is in early access: this page
describes how it is designed to store your documents, and will be updated with the date of each change as it ships.</p>
<h2>Do not upload CUI</h2>
<p>The workspace is for documents about your system: the SSP, the POA&amp;M, policies, screenshots and records that show a
requirement is met. It is not a CUI enclave and is not FedRAMP authorized, so controlled drawings, specifications and other
CUI stay in the environment you use for CUI. If your prime or your own policy treats your SSP as CUI, keep the signed
copy there too and use the workspace for drafting with the CUI details left out.</p>
<h2>Where and how documents are stored</h2>
<ul>
  <li><strong>Hosting.</strong> The application runs on Cloudflare Workers. Records are kept in Cloudflare D1 and files in
  Cloudflare R2, which Cloudflare encrypts at rest; every connection uses TLS.</li>
  <li><strong>Separation between shops.</strong> Every record carries your shop's id and every query filters by it; every file key
  starts with your shop's own prefix. Automated tests try to read one shop's records as another shop and must fail.</li>
  <li><strong>Access.</strong> Only people you invite can sign in to your shop's workspace, with roles (owner, editor, viewer).
  Our staff do not open your documents unless you ask for support on a specific item.</li>
  <li><strong>AI drafting.</strong> Draft wording is generated only from your own answers and is marked as a draft for you to
  check. Your documents are not used to train AI models.</li>
  <li><strong>Export and deletion.</strong> You can export everything at any time. When you close the account, your documents
  are deleted; backups expire on a fixed schedule we will publish before launch.</li>
  <li><strong>Logs.</strong> Request logs record what happened (who, which record, when), not the content of your documents.</li>
</ul>
<h2>What this site stores today</h2>
<p>This marketing site stores only the early-access list: your email address, the level and shop size you chose, the wording you
agreed to, and a salted hash of your IP address for abuse limits. Unconfirmed sign-ups are deleted after 30 days. See the
<a href="/privacy">privacy notice</a>.</p>
<h2>Reporting a security issue</h2>
<p>Reply to any email from us with "security" in the subject. Please do not test against other people's data.</p>
${cta}`,
  },
  {
    path: "/sprs-score-calculator",
    kind: "faq",
    title: `Free SPRS score calculator (NIST SP 800-171) · ${SITE_NAME}`,
    description:
      "Free SPRS score calculator: tick the NIST SP 800-171 requirements you do not meet yet and get your DoD Assessment Methodology score, the costliest gaps and whether a POA&M can cover them. No sign-up.",
    changefreq: "monthly",
    priority: 0.9,
    faq: sprsFaq,
    body: `<h1>Free SPRS score calculator</h1>
<p class="lead">Tick the NIST SP 800-171 requirements your shop does not fully meet yet. You get the score you would post in
SPRS under the ${cite("dod-methodology", "DoD Assessment Methodology")}, which gaps cost the most points, and whether the
open items could sit on a POA&amp;M for a Conditional Level 2 (Self) status (${cite("cfr-170-21", "32 CFR 170.21")}).
No sign-up, no scripts, and nothing you tick is stored.</p>
${statusBox()}
${RESULT_MARKER}
<h2>How the score works</h2>
<p>Start at 110. Each of the 110 requirements you do not fully meet subtracts its point value: 5, 3 or 1. Two requirements
have a partial value of 3 instead of 5: multi-factor authentication (3.5.3) used for remote and privileged users but not yet
for everyone, and encryption of CUI (3.13.11) that is not FIPS-validated. The system security plan (3.12.4) has no points,
but without one no score can be produced. With every point-bearing requirement open, the score is ${MIN_SCORE}.</p>
${renderForm()}
<h2>Common questions</h2>
${sprsFaq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Keep the score current instead of recalculating it</h2>
  <p>${SHORT_NAME} keeps each requirement's status, owner and evidence next to your SSP and POA&amp;M, so the score moves as
  you close items. Read <a href="/what-it-does">what it does</a> or <a href="/pricing">the proposed prices</a>.</p>
</section>
${sourcesList(["dod-methodology", "cfr-170", "cfr-170-21", "nist-800-171r2", "dfars-7012"])}
${cta}`,
  },
  {
    path: "/pricing",
    kind: "pricing",
    title: `Pricing (proposed, early access) · ${SITE_NAME}`,
    description:
      "Proposed plans from $39/month for Level 1 and $149/month for Level 2 with SSP, POA&M and SPRS score, compared with FutureFeed, PreVeil Pass and consultant fees. Free during early access.",
    changefreq: "monthly",
    priority: 0.8,
    body: `<h1>Pricing</h1>
<p class="lead">Early access is free. These are the prices we propose to charge after launch, billed annually;
they may change before then, and we will tell everyone on the list first.</p>
<ul class="plans">
  <li><h2>Level 1</h2><p class="price">$39<span>/month</span></p><p class="muted">$468 billed annually</p>
  <ul><li>The 15 FAR 52.204-21 requirements, with evidence</li><li>Annual self-assessment and affirmation reminders</li><li>2 users</li></ul></li>
  <li class="featured"><h2>Level 2 self-assessment</h2><p class="price">$149<span>/month</span></p><p class="muted">$1,788 billed annually</p>
  <ul><li>Everything in Level 1</li><li>110 NIST SP 800-171 requirements</li><li>SSP, POA&amp;M and SPRS score</li><li>5 users</li></ul></li>
  <li><h2>Level 2 + Quality</h2><p class="price">$249<span>/month</span></p><p class="muted">$2,988 billed annually</p>
  <ul><li>Everything in Level 2</li><li>ISO 9001 / AS9100 document control, internal audits and corrective actions</li><li>10 users</li></ul></li>
</ul>
<p>Monthly billing, when offered, will cost 20% more. No plan certifies your shop or guarantees a score.</p>
<h2>How this compares</h2>
<div class="table-wrap"><table>
  <caption>Published prices, checked ${humanDate(STATUS_CHECKED)}</caption>
  <thead><tr><th scope="col">Option</th><th scope="col">Price</th><th scope="col">What it includes</th></tr></thead>
  <tbody>
    <tr><td>${cite("futurefeed-pricing", "FutureFeed")} Innovator + Level 2 add-on</td><td>$99/mo billed annually + $1,008/yr (about $183/mo)</td><td>Compliance platform for shops of 25 or fewer FTEs</td></tr>
    <tr><td>${cite("preveil-pass", "PreVeil Pass")}</td><td>$450/mo for 3 users, 12 months prepaid</td><td>Encrypted email and file sharing for CUI plus a compliance kit; a different scope from ours</td></tr>
    <tr><td>Consultant-written SSP and POA&amp;M</td><td>$3,000–$25,000 (${cite("preveil-costs", "PreVeil")}); $3,500–$20,000 (${cite("secureframe-consultant", "Secureframe")})</td><td>Documents written for you; upkeep usually extra</td></tr>
  </tbody>
</table></div>
<h2>Why these numbers</h2>
<p>A Level 2 shop on our plan pays less than FutureFeed's Innovator plan with its Level 2 add-on, and a full year costs less than
the low end of a consultant engagement, while the documents stay current as your shop changes. Level 1 is priced low because
it is 15 requirements and no score. If you handle CUI you still need a place to store it; we do not replace that.</p>
${cta}`,
  },
  {
    path: "/early-access",
    kind: "page",
    title: `Join early access · ${SITE_NAME}`,
    description:
      "Join the early-access list for the CMMC Level 1/2 and ISO 9001 workspace for small machine shops. Double opt-in: one confirmation email, nothing more unless you confirm.",
    changefreq: "monthly",
    priority: 0.9,
    body: `<h1>Join early access</h1>
<p class="lead">We are building this with a small group of machine shops. Early access is free; in return we ask for
feedback on what the workspace gets wrong.</p>
<form class="signup" method="post" action="/api/early-access">
  <label for="email">Work email</label>
  <input id="email" name="email" type="email" required maxlength="254" autocomplete="email">
  <label for="level">Which level do your contracts call for?</label>
  <select id="level" name="level">
    <option value="unsure">Not sure yet</option>
    <option value="l1">Level 1 (FCI only)</option>
    <option value="l2">Level 2 (we handle CUI)</option>
  </select>
  <label for="size">People in the shop</label>
  <select id="size" name="size">
    <option value="">Prefer not to say</option>
    <option value="1-9">1–9</option>
    <option value="10-49">10–49</option>
    <option value="50-249">50–249</option>
    <option value="250+">250 or more</option>
  </select>
  <div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
  <label class="consent"><input type="checkbox" name="consent" value="yes" required> ${CONSENT_TEXT}</label>
  <button type="submit" class="button">Send me the confirmation email</button>
</form>
<p class="muted">We store what you enter here as described in the <a href="/privacy">privacy notice</a>. No testimonials,
no sales calls unless you ask for one.</p>`,
  },
  {
    path: "/privacy",
    kind: "page",
    title: `Privacy notice for the early-access list · ${SITE_NAME}`,
    description:
      "What the early-access list stores (email, chosen level and shop size, consent wording, hashed IP), why, for how long, and how to leave it.",
    changefreq: "yearly",
    priority: 0.3,
    body: `<h1>Privacy notice for the early-access list</h1>
<p>Last updated ${humanDate(STATUS_CHECKED)}.</p>
<h2>What we store</h2>
<ul>
  <li>Your email address, the CMMC level and shop size you chose (both optional), the page you signed up on and the version of the consent wording you saw.</li>
  <li>A salted hash of your IP address, used only to limit abuse of the form. We never store the raw address.</li>
  <li>When we sent the confirmation email and when you confirmed.</li>
</ul>
<h2>Why</h2>
<p>To send one confirmation email and, once you confirm, early-access news about this product. Nothing is sold or shared
except with the services that run the site (Cloudflare for hosting, the database and email delivery).</p>
<h2>Who can see it</h2>
<p>Only the people who run ${SITE_NAME} can see the list: your email address, the page you signed up on, whether you
confirmed, and the date. Each time they view it, that view is logged.</p>
<h2>How long</h2>
<p>Unconfirmed addresses are deleted after 30 days. Confirmed addresses stay until you leave the list or the early-access
program ends.</p>
<h2>Leaving</h2>
<p>Every email has a link that deletes your entry. You can also reply to any email and ask.</p>
<p>No cookies and no tracking scripts are used on this site.</p>`,
  },
  // Utility pages: noindex, left out of the sitemap and llms.txt.
  {
    path: "/early-access/check-email",
    indexable: false,
    title: `Check your email · ${SITE_NAME}`,
    description: "We sent a confirmation link if the address can receive one.",
    body: `<h1>Check your email</h1>
<p class="lead">If that address can receive mail, a confirmation link is on its way. It works for 7 days.</p>
<p>Nothing else is sent unless you confirm. Not there after a few minutes? Check spam, or <a href="/early-access">try again</a> in ten minutes.</p>`,
  },
  {
    path: "/early-access/confirmed",
    indexable: false,
    title: `You're on the list · ${SITE_NAME}`,
    description: "Your early-access sign-up is confirmed.",
    body: `<h1>You're on the list</h1>
<p class="lead">Thanks. We will write when there is a workspace for you to try. Every email has a link to leave the list.</p>
<p>Meanwhile: <a href="/cmmc-level-1-vs-level-2">CMMC Level 1 vs Level 2</a> · <a href="${JOBSHOP.url}">${JOBSHOP.name}</a></p>`,
  },
  {
    path: "/early-access/link-expired",
    indexable: false,
    title: `Link expired · ${SITE_NAME}`,
    description: "That link is not valid any more.",
    body: `<h1>That link is not valid any more</h1>
<p>Confirmation links work once and for 7 days. <a href="/early-access">Sign up again</a> to get a fresh one.</p>`,
  },
  {
    path: "/early-access/invalid",
    indexable: false,
    title: `Check the form · ${SITE_NAME}`,
    description: "The sign-up form was missing something.",
    body: `<h1>Please check the form</h1>
<p>We need a valid email address and your agreement to the wording next to the checkbox. <a href="/early-access">Back to the form</a>.</p>`,
  },
  {
    path: "/early-access/left",
    indexable: false,
    title: `You have left the list · ${SITE_NAME}`,
    description: "Your early-access entry was deleted.",
    body: `<h1>You have left the list</h1>
<p>Your entry is deleted. We will not email you again.</p>`,
  },
];

export { SOURCES };
