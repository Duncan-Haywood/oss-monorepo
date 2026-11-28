// "How to submit your SPRS score": the steps a small shop takes to get a NIST SP 800-171 Basic
// Assessment score, a CMMC Level 1 (Self) or a CMMC Level 2 (Self) assessment into SPRS and affirmed:
// the PIEE account and the SPRS Cyber Vendor User role first, then the Cyber Reports module, then the
// affirming official.
//
// Every quotation is in QUOTES and is checked word for word against the text saved in fixtures/sprs/
// (DoD SPRS's own quick entry guides, access guides and affirming-official tutorial, downloaded from
// https://www.sprs.csd.disa.mil/ on 28 Nov 2026; text extracted with pdftotext, whitespace collapsed;
// hashes pinned in test/sprs-submit.test.mjs) or in fixtures/dfars/ (DFARS 252.204-7019 from the
// eCFR). The step-by-step wording is ours, written from those quotes, and the page says so. SPRS
// screens change: the guides' dates are on the page so a reader can tell how old they are.

import { SHORT_NAME } from "./site.mjs";

export const SPRS_SUBMIT_PATH = "/how-to-submit-sprs-score";

/** The date the SPRS guides in fixtures/sprs/ were downloaded and read. */
export const GUIDES_READ = "2026-11-28";

/** Quotations, each found word for word in its fixture (test/sprs-submit.test.mjs). */
export const QUOTES = {
  roleCyber: {
    file: "sprs/sprs-access-with-piee.txt",
    text: "To enter, edit, or affirm cyber information (NIST SP 800-171 and CMMC) the “SPRS Cyber Vendor User” role is required.",
  },
  roleSupport: {
    file: "sprs/sprs-access-with-piee.txt",
    text: "To monitor company data, scoring, and cyber information, request the “Contractor/Vendor (Support Role)” role.",
  },
  camOnly: {
    file: "sprs/sprs-access-with-piee.txt",
    text: "If there is only one CAM, and that CAM is requesting a role, the role will be automatically activated by PIEE.",
  },
  findCam: {
    file: "sprs/sprs-access-with-piee.txt",
    text: "To locate the CAM for your CAGE go to the PIEE login page and Click Find My Account Administrator.",
  },
  hierarchyAll: {
    file: "sprs/sprs-access-new-piee.txt",
    text: "access to one of the CAGEs in a CAGE hierarchy provides access to all",
  },
  newUser: {
    file: "sprs/sprs-access-new-piee.txt",
    text: "Go to PIEE & Click “NEW USER”",
  },
  sspFirst: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "The Assessment Methodology and System Security Plan should be completed prior to entering assessment summary results within SPRS.",
  },
  hierarchySam: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "Contact your company’s Electric Business Point of Contact (EBPOC) listed at SAM.gov so they can correct the hierarchy in SAM. Updates typically flow to SPRS within 48 hours.",
  },
  addNew: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "Navigate to the NIST SP 800-171 Assessments tab and select the Add New Assessment button.",
  },
  uid: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "Basic, Medium, and High confidence levels start with SB, SM, SH respectively.",
  },
  basicOnly: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "The Basic Confidence Level is the only assessment that can be maintained (add/edit/delete) by vendors.",
  },
  red: {
    file: "sprs/sprs-nist-800-171-quick-entry.txt",
    text: "Assessments results turn red when the assessment date expands beyond three years.",
  },
  emailRoute: {
    file: "dfars/dfars-252.204-7019.txt",
    text: "the Offeror may conduct and submit a Basic Assessment to webptsmh@navy.mil for posting to SPRS",
  },
  scoreOnly: {
    file: "dfars/dfars-252.204-7019.txt",
    text: "Summary level score (e.g., 95 out of 110, NOT the individual value for each requirement).",
  },
  l1Add: {
    file: "sprs/sprs-cmmc-level-1-quick-entry.txt",
    text: "Within the CMMC Assessments tab, select “Add New Level 1 CMMC Self-Assessment”.",
  },
  l1Final: {
    file: "sprs/sprs-cmmc-level-1-quick-entry.txt",
    text: "Compliance with the security requirements specified in FAR clause 52.204–21 is required to achieve a “Final Level 1 Self-Assessment”.",
  },
  l1Expire: {
    file: "sprs/sprs-cmmc-level-1-quick-entry.txt",
    text: "A “Final Level 1 Self-Assessment” will automatically become “No CMMC Status (Expired Assessment)” after 1 year.",
  },
  l1Visible: {
    file: "sprs/sprs-cmmc-level-1-quick-entry.txt",
    text: "“Final Level 1 Self-Assessment” is the only CMMC Status Type that will be visible to Government Personnel.",
  },
  transferAo: {
    file: "sprs/sprs-cmmc-level-1-quick-entry.txt",
    text: "If the user entering the assessment is not the AO, the assessment can be forwarded via email, to the AO by entering their email and selecting “Transfer to AO”.",
  },
  l2Add: {
    file: "sprs/sprs-cmmc-level-2-quick-entry.txt",
    text: "Within the CMMC Assessments and CMMC Level 2 (Self) tabs, select “Add New Level 2 CMMC Self-Assessment”.",
  },
  l2Scope: {
    file: "sprs/sprs-cmmc-level-2-quick-entry.txt",
    text: "Add Assessing Scope, Employee Count, and Included CAGE(s) as required.",
  },
  l2Score: {
    file: "sprs/sprs-cmmc-level-2-quick-entry.txt",
    text: "Only CMMC L2 Conditional (score = 88 to 109) and Final Self-Assessments (score = 110) can be affirmed.",
  },
  l2NoPoam: {
    file: "sprs/sprs-cmmc-level-2-quick-entry.txt",
    text: "If a requirement is not able to be subject to a Plan of Action and Milestones (POA&M), then the Status Type will be No CMMC Status regardless of score.",
  },
  l2Valid: {
    file: "sprs/sprs-cmmc-level-2-quick-entry.txt",
    text: "A “CMMC L2 Conditional Level 2 Self-Assessment” is valid for 180 days.",
  },
  aoRole: {
    file: "sprs/sprs-affirming-official-tutorial.txt",
    text: "As an AO, you will need a Procurement Integrated Enterprise Environment (PIEE) account with the SPRS Cyber Vendor User role to complete the affirmation process.",
  },
  aoPiee: {
    file: "sprs/sprs-affirming-official-tutorial.txt",
    text: "Your information is pulled from your PIEE registration and cannot be updated on this screen",
  },
  aoAnnual: {
    file: "sprs/sprs-affirming-official-tutorial.txt",
    text: 'If the Assessment is available for an annual affirmation, then the "Affirm" Button will be located in the Affirmation Expiration Date column.',
  },
};

const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A quotation from QUOTES, marked with its id so the test can find it on the page. */
export function q(id) {
  const x = Object.hasOwn(QUOTES, id) ? QUOTES[id] : null;
  if (!x) throw new Error(`no quote ${id}`);
  return `<q data-quote="${id}">${esc(x.text)}</q>`;
}

/**
 * What each SPRS record is called, how long it stays current and who sees it. [record, how long,
 * quote id the period rests on, where it comes from]
 */
export const RECORDS = [
  [
    "NIST SP 800-171 Basic Assessment (DoD UID starting SB)",
    "shows red once older than 3 years",
    "red",
    "SPRS NIST SP 800-171 Quick Entry Guide; DFARS 252.204-7019(b)",
  ],
  [
    "Final Level 1 Self-Assessment",
    "1 year, then No CMMC Status (Expired Assessment)",
    "l1Expire",
    "SPRS CMMC Level 1 Quick Entry Guide; DFARS 252.204-7021(a)",
  ],
  [
    "CMMC L2 Conditional Self-Assessment (score 88 to 109)",
    "180 days",
    "l2Valid",
    "SPRS CMMC Level 2 Quick Entry Guide; 32 CFR 170.16",
  ],
  [
    "CMMC L2 Final Self-Assessment (score 110)",
    "3 years, with an affirmation every year",
    "l2Score",
    "SPRS CMMC Level 2 Quick Entry Guide; DFARS 252.204-7021(a)",
  ],
];

/** The SPRS guides the page rests on, as SOURCES ids, for the sources list and the test. */
export const GUIDE_SOURCES = [
  "sprs-access-piee",
  "sprs-access-new",
  "sprs-nist-qeg",
  "sprs-cmmc-l1-qeg",
  "sprs-cmmc-l2-qeg",
  "sprs-ao-tutorial",
];

export function sprsSubmitPage({ cite, statusBox, sourcesList, cta }) {
  const faq = [
    {
      q: "Can I email my SPRS score instead of entering it?",
      a: "For a NIST SP 800-171 Basic Assessment, yes: DFARS 252.204-7019(c)(2) lets you email it to webptsmh@navy.mil for posting, with the standard assessed, who assessed, the CAGE codes each system security plan covers, the date completed, the summary score out of 110 and the date you expect to reach 110. A CMMC self-assessment (Level 1 or Level 2) has no email route in the guides: it is entered and affirmed in SPRS by someone with the SPRS Cyber Vendor User role.",
    },
    {
      q: "Do I type in every requirement, or just the score?",
      a: "For a NIST SP 800-171 Basic Assessment, only the summary score (for example 95 out of 110), not each requirement's value. For a CMMC Level 2 self-assessment, SPRS asks for a compliance status on each requirement, family by family, and works out the score and status from those answers.",
    },
    {
      q: "Who has to press Affirm?",
      a: "The affirming official: under 32 CFR 170.22, the senior person at the company responsible for CMMC compliance with the authority to affirm it. Anyone with the SPRS Cyber Vendor User role can enter the assessment and transfer it to them by email; they then need their own PIEE account with the same role to affirm it.",
    },
    {
      q: "Why can't I see my company's CAGE in SPRS?",
      a: "SPRS takes the CAGE hierarchy from SAM.gov, and you can only add CAGEs that are in your company's hierarchy. If it is wrong, your company's Electronic Business Point of Contact in SAM.gov has to correct it there; SPRS says updates typically arrive within 48 hours. If the CAGE shows without an asterisk, your PIEE account does not have the Cyber Vendor User role for it yet.",
    },
    {
      q: "My score is below 88. Can I still post a CMMC Level 2 self-assessment?",
      a: "You can enter it, but SPRS will only let a Conditional (88 to 109) or Final (110) Level 2 self-assessment be affirmed, and a requirement that may not sit on a POA&M left open gives No CMMC Status whatever the score. A Basic NIST SP 800-171 score under DFARS 252.204-7019 has no such floor: it can be any score from 110 down to -203.",
    },
    {
      q: "Does SPRS check my score?",
      a: "Not for a self-assessment. The Basic Assessment is self-generated, which is why DFARS 252.204-7020 gives it a low confidence level, and the affirmation is your senior official's statement to the government. Enter what your evidence supports.",
    },
  ];
  const records = RECORDS.map(
    ([what, period, , where]) =>
      `    <tr><th scope="row">${esc(what)}</th><td>${esc(period)}</td><td>${esc(where)}</td></tr>`,
  ).join("\n");
  return {
    path: SPRS_SUBMIT_PATH,
    kind: "faq",
    title: `How to submit your SPRS score, step by step · ${SHORT_NAME}`,
    description:
      "Step by step from DoD's own SPRS guides: the PIEE account and Cyber Vendor User role, entering a Basic score or a CMMC self-assessment, and affirming it.",
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>How to submit your SPRS score: NIST SP 800-171 and CMMC self-assessments, step by step</h1>
<p class="lead">Your score is worked out; now it has to reach the Supplier Performance Risk System (SPRS) before you bid. This
page walks the route a small shop takes: a PIEE account with the right role, then the NIST SP 800-171 Basic Assessment, the
CMMC Level 1 self-assessment or the CMMC Level 2 self-assessment, then the affirming official. Quotations are word for word
from DoD's own SPRS guides (dated on each, downloaded ${humanDateShort(GUIDES_READ)}) and DFARS 252.204-7019; the plain
steps are ours. SPRS screens change, so check the guide's date against what you see.</p>
${statusBox()}
<h2>Before you log in</h2>
<ul>
  <li><strong>Do the assessment first.</strong> The SPRS guide is plain: ${q("sspFirst")} Score it with the
  <a href="/sprs-score-calculator">SPRS score calculator</a> or the
  <a href="/cmmc-self-assessment-spreadsheet">self-assessment spreadsheet</a>, and have the system security plan's name and
  date to hand.</li>
  <li><strong>Know your CAGE code and check your SAM.gov entry.</strong> SPRS takes your company's CAGE hierarchy from SAM.
  If it is wrong: ${q("hierarchySam")}</li>
  <li><strong>Know who your affirming official is.</strong> For a CMMC self-assessment, a senior person with authority over
  compliance affirms it (32 CFR 170.22, ${cite("cfr-170-22", "affirmation")}). Whoever does the data entry can be someone else.</li>
</ul>
<h2>Step 1: a PIEE account with the SPRS Cyber Vendor User role</h2>
<p>SPRS sits inside PIEE (piee.eb.mil). Roles decide what you can do: ${q("roleCyber")} ${q("roleSupport")}</p>
<ol>
  <li><strong>No PIEE account yet:</strong> ${q("newUser")}, choose the vendor user type and an authentication method, fill in
  the profile and supervisor details (${cite("sprs-access-new", "SPRS access guide, new user")}).</li>
  <li><strong>Already in PIEE</strong>: My Account, then Add Additional Roles
  (${cite("sprs-access-piee", "SPRS access guide, existing PIEE user")}).</li>
  <li>Pick "SPRS – Supplier Performance Risk System", tick the SPRS Cyber Vendor User role, and enter your CAGE code. For the
  cyber role, ${q("hierarchyAll")}.</li>
  <li>Finish the justification, summary and agreement. Your company's Contractor Account Administrator (CAM) in PIEE then
  activates the role. ${q("camOnly")} ${q("findCam")} Log out and back in once it is active.</li>
</ol>
<p>In SPRS, open <strong>Cyber Reports</strong>, choose your hierarchy and run the report. An asterisk next to the CAGE
means the role took: you can add and edit for it.</p>
<h2>Step 2a: a NIST SP 800-171 Basic Assessment score (DFARS 7019 and 7020)</h2>
<p>This is the score a solicitation with DFARS 252.204-7019 asks for. From Cyber Reports (${cite("sprs-nist-qeg", "SPRS NIST SP 800-171 Quick Entry Guide, May 2024")}):</p>
<ol>
  <li>${q("addNew")}</li>
  <li>Fill in the form with what DFARS 252.204-7019(d) lists: the standard assessed, who assessed (your own self-assessment),
  the date it was completed, the ${q("scoreOnly")} the CAGE codes the system security plan covers, and the date you expect
  to reach 110 from your plan of action.</li>
  <li>Save. SPRS gives the record a DoD unique identifier; ${q("uid")}</li>
</ol>
<p>You can edit it later as you close gaps: ${q("basicOnly")} ${q("red")} DFARS 252.204-7019 wants one no more than 3
years old at award, or less if the solicitation says so.</p>
<p><strong>No PIEE yet and a bid due?</strong> DFARS 252.204-7019(c)(2) still allows the old route: ${q("emailRoute")},
with the same details in the email (${cite("dfars-7019", "DFARS 252.204-7019")}). Getting the role is the better fix: you will
need it for CMMC anyway.</p>
<h2>Step 2b: a CMMC Level 1 self-assessment (FCI)</h2>
<p>When DFARS 252.204-7021 names Level 1 (Self) (${cite("sprs-cmmc-l1-qeg", "SPRS CMMC Level 1 Quick Entry Guide, Dec 2024")}):</p>
<ol>
  <li>${q("l1Add")}</li>
  <li>Enter the details and choose Continue to Affirmation. ${q("l1Final")} So all 15 of the
  <a href="/cmmc-level-1-requirements">Level 1 requirements</a> must be met; Level 1 has no POA&amp;M.</li>
  <li>${q("transferAo")}</li>
  <li>The affirming official reviews it, ticks the certification and selects Affirm. SPRS then issues the CMMC unique
  identifier (CMMC UID) you put in proposals under DFARS 252.204-7025.</li>
</ol>
<p>Two notes from the guide: ${q("l1Expire")} And ${q("l1Visible")} A draft or pending record does not count.</p>
<h2>Step 2c: a CMMC Level 2 self-assessment (CUI)</h2>
<p>When DFARS 252.204-7021 names Level 2 (Self) (${cite("sprs-cmmc-l2-qeg", "SPRS CMMC Level 2 Quick Entry Guide, Feb 2025")}):</p>
<ol>
  <li>${q("l2Add")}</li>
  <li>Answer each requirement, family by family, with its compliance status (the Requirement Objectives button shows the
  <a href="/cmmc-level-2-requirements">320 objectives</a> behind each). SPRS adds up the score from your answers.</li>
  <li>${q("l2Scope")} CAGEs must be in your SAM hierarchy.</li>
  <li>Check the score SPRS shows: ${q("l2Score")} ${q("l2NoPoam")} The
  <a href="/cmmc-poam-eligible-requirements">POA&amp;M-eligible requirements list</a> shows which gaps may stay open.</li>
  <li>Transfer to the affirming official if that is not you; they affirm it, and SPRS issues the CMMC UID.</li>
</ol>
<p>${q("l2Valid")} You must close the POA&amp;M and post a closeout self-assessment inside that window to reach Final.</p>
<h2>Step 3: the affirming official, then every year</h2>
<p>${q("aoRole")} ${q("aoPiee")}, so get their PIEE profile right first (${cite("sprs-ao-tutorial", "SPRS affirming official tutorial")}).
After the first affirmation, Final statuses need one every year: ${q("aoAnnual")}</p>
<div class="table-wrap"><table>
  <caption>What SPRS calls each record and how long it lasts</caption>
  <thead><tr><th scope="col">Record</th><th scope="col">Stays current</th><th scope="col">Where</th></tr></thead>
  <tbody>
${records}
  </tbody>
</table></div>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Keep what you entered, and the date the next one is due</h2>
  <p>${SHORT_NAME} keeps the requirement statuses, evidence and SSP behind the score, records each SPRS affirmation you make
  (who affirmed, the status, the date) and works out when the next annual affirmation, Level 1 self-assessment or POA&amp;M
  closeout falls due, with an email reminder. It never logs in to PIEE or submits to SPRS for you, and it does not decide
  what is met: your affirming official does. Level 1 is free. See <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList([...GUIDE_SOURCES, "dfars-7019", "dfars-7020", "dfars-7021", "cfr-170-22", "dod-methodology"])}
${cta}`,
  };
}

function humanDateShort(iso) {
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
