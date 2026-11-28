// "DFARS cybersecurity clauses": the FAR and DFARS cyber clauses a small shop finds on a solicitation
// or purchase order (FAR 52.204-21; DFARS 252.204-7008, -7012, -7019, -7020, -7021, -7024, -7025),
// what each one asks the shop to do, by when, and whether it flows down to the shop's own suppliers.
//
// Every quotation on the page is in QUOTES and is checked word for word against the clause text saved
// in fixtures/dfars/ (read from the eCFR versioner API, point-in-time 2026-11-01, on 27 Nov 2026; tags
// stripped, whitespace collapsed; sha256 of each file pinned in test/dfars-clauses.test.mjs). The plain
// readings ("What you do") are ours, written from those quotes, and the page says so. Nothing here
// decides which clauses a contract holds: the contract does.

import { SHORT_NAME } from "./site.mjs";

export const DFARS_PATH = "/dfars-cybersecurity-clauses";

/** The date the clause texts in fixtures/dfars/ were read. */
export const CLAUSES_READ = "2026-11-27";

/** Quotations, each found word for word in its fixture (test/dfars-clauses.test.mjs). */
export const QUOTES = {
  far21Scope: {
    file: "far-52.204-21.txt",
    text: "an information system that is owned or operated by a contractor that processes, stores, or transmits Federal contract information",
  },
  far21Flow: {
    file: "far-52.204-21.txt",
    text: "in which the subcontractor may have Federal contract information residing in or transiting through its information system",
  },
  d7008Rep: {
    file: "dfars-252.204-7008.txt",
    text: "By submission of this offer, the Offeror represents that it will implement the security requirements specified by National Institute of Standards and Technology (NIST) Special Publication (SP) 800-171",
  },
  d7012Rapid: {
    file: "dfars-252.204-7012.txt",
    text: "Rapidly report means within 72 hours of discovery of any cyber incident.",
  },
  d7012Media: {
    file: "dfars-252.204-7012.txt",
    text: "for at least 90 days from the submission of the cyber incident report",
  },
  d7012Cloud: {
    file: "dfars-252.204-7012.txt",
    text: "security requirements equivalent to those established by the Government for the Federal Risk and Authorization Management Program (FedRAMP) Moderate baseline",
  },
  d7012Flow: {
    file: "dfars-252.204-7012.txt",
    text: "for operationally critical support, or for which subcontract performance will involve covered defense information",
  },
  d7019Award: {
    file: "dfars-252.204-7019.txt",
    text: "In order to be considered for award, if the Offeror is required to implement NIST SP 800-171, the Offeror shall have a current assessment (i.e., not more than 3 years old unless a lesser time is specified in the solicitation)",
  },
  d7019Email: {
    file: "dfars-252.204-7019.txt",
    text: "the Offeror may conduct and submit a Basic Assessment to webptsmh@navy.mil for posting to SPRS",
  },
  d7019Score: {
    file: "dfars-252.204-7019.txt",
    text: "Summary level score (e.g., 95 out of 110, NOT the individual value for each requirement).",
  },
  d7020Access: {
    file: "dfars-252.204-7020.txt",
    text: "The Contractor shall provide access to its facilities, systems, and personnel necessary for the Government to conduct a Medium or High NIST SP 800-171 DoD Assessment",
  },
  d7020Rebut: {
    file: "dfars-252.204-7020.txt",
    text: "the contractor has 14 business days to provide additional information",
  },
  d7020Basic: {
    file: "dfars-252.204-7020.txt",
    text: "Results in a confidence level of “Low” in the resulting score, because it is a self-generated score.",
  },
  d7020Flow: {
    file: "dfars-252.204-7020.txt",
    text: "unless the subcontractor has completed, within the last 3 years, at least a Basic NIST SP 800-171 DoD Assessment",
  },
  d7021Maintain: {
    file: "dfars-252.204-7021.txt",
    text: "Have and maintain for the duration of the contract a current CMMC status at the following CMMC level, or higher",
  },
  d7021Level1: {
    file: "dfars-252.204-7021.txt",
    text: "Not older than 1 year for Final Level 1 (Self)",
  },
  d7021Level2: {
    file: "dfars-252.204-7021.txt",
    text: "Not older than 3 years for Final Level 2 (Self) assessments and Final Level 2 (C3PAO) assessments",
  },
  d7021Conditional: {
    file: "dfars-252.204-7021.txt",
    text: "Not older than 180 days for Conditional Level 2 (Self) assessments",
  },
  d7021Only: {
    file: "dfars-252.204-7021.txt",
    text: "Only process, store, or transmit FCI or CUI on contractor information systems that have a CMMC status at the CMMC level required",
  },
  d7021Flow: {
    file: "dfars-252.204-7021.txt",
    text: "ensure that the subcontractor has a current CMMC certificate or current CMMC status at the CMMC level that is appropriate for the information that is being flowed down to the subcontractor",
  },
  d7024Use: {
    file: "dfars-252.204-7024.txt",
    text: "SPRS retrieves item, price, quality, delivery, and contractor information on contracts from Government reporting systems in order to develop risk assessments.",
  },
  d7025Prior: {
    file: "dfars-252.204-7025.txt",
    text: "is required prior to award for each contractor information system that will process, store, or transmit Federal contract information (FCI) or controlled unclassified information (CUI) during performance of the contract",
  },
  d7025Uid: {
    file: "dfars-252.204-7025.txt",
    text: "The Offeror shall provide, in the proposal, the CMMC unique identifier(s) (CMMC UIDs) issued by SPRS",
  },
  p7504Until: {
    file: "dfars-204.7504.txt",
    text: "Until November 9, 2028",
  },
  p7504After: {
    file: "dfars-204.7504.txt",
    text: "On or after November 10, 2028",
  },
  p7504Cots: {
    file: "dfars-204.7504.txt",
    text: "except for those solely for the acquisition of COTS items",
  },
};

const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A quotation from QUOTES, marked with its fixture so the test can find it. */
export function q(id) {
  const x = Object.hasOwn(QUOTES, id) ? QUOTES[id] : null;
  if (!x) throw new Error(`no quote ${id}`);
  return `<q data-quote="${id}">${esc(x.text)}</q>`;
}

/**
 * The clauses, in the order a reader meets them. kind: "provision" (in the solicitation, about the
 * offer) or "clause" (in the contract, about performance). source: SOURCES id in site.mjs.
 */
export const CLAUSES = [
  {
    id: "52.204-21",
    reg: "FAR",
    version: "NOV 2021",
    title: "Basic Safeguarding of Covered Contractor Information Systems",
    kind: "clause",
    source: "far-52-204-21",
    info: "FCI",
    when: "Any contract where the shop's systems hold Federal Contract Information.",
    does: "Apply the 15 basic safeguards to every system that holds FCI. These are the CMMC Level 1 requirements.",
    flows: "Yes, to subcontracts where FCI may sit on the sub's systems (COTS excluded).",
    guide: ["/cmmc-level-1-requirements", "the 15 Level 1 requirements"],
  },
  {
    id: "252.204-7008",
    reg: "DFARS",
    version: "OCT 2016",
    title: "Compliance With Safeguarding Covered Defense Information Controls",
    kind: "provision",
    source: "dfars-7008",
    info: "CUI",
    when: "Every DoD solicitation except COTS-only buys (DFARS 204.7304(a)).",
    does: "By sending the offer you state that you will implement NIST SP 800-171. Any requirement you cannot meet, or meet another way, goes to the contracting officer in writing before award.",
    flows: "No (a solicitation provision).",
    guide: ["/cmmc-level-2-requirements", "the 110 NIST SP 800-171 requirements"],
  },
  {
    id: "252.204-7012",
    reg: "DFARS",
    version: "MAY 2024",
    title: "Safeguarding Covered Defense Information and Cyber Incident Reporting",
    kind: "clause",
    source: "dfars-7012",
    info: "CUI",
    when: "Every DoD contract except COTS-only buys (DFARS 204.7304(c)); it bites once covered defense information sits on your systems.",
    does: "Implement NIST SP 800-171 on the systems that hold covered defense information; report a cyber incident at dibnet.dod.mil within 72 hours of discovery; keep images of affected systems at least 90 days; hold cloud data only with a provider at the FedRAMP Moderate equivalent.",
    flows:
      "Yes, without alteration, to subs whose work involves covered defense information or operationally critical support.",
    guide: null,
  },
  {
    id: "252.204-7019",
    reg: "DFARS",
    version: "NOV 2023",
    title: "Notice of NIST SP 800-171 DoD Assessment Requirements",
    kind: "provision",
    source: "dfars-7019",
    info: "CUI",
    when: "Every DoD solicitation except COTS-only buys (DFARS 204.7304(d)).",
    does: "To be considered for award, have a NIST SP 800-171 DoD Assessment score in SPRS that is no more than 3 years old (or less if the solicitation says so) for each relevant system.",
    flows: "No (a solicitation provision); 7020 carries the subcontractor rule.",
    guide: ["/sprs-score-calculator", "the free SPRS score calculator"],
  },
  {
    id: "252.204-7020",
    reg: "DFARS",
    version: "NOV 2023",
    title: "NIST SP 800-171 DoD Assessment Requirements",
    kind: "clause",
    source: "dfars-7020",
    info: "CUI",
    when: "Every DoD contract, task order and delivery order except COTS-only buys (DFARS 204.7304(e)).",
    does: "Let the government in for a Medium or High Assessment if it asks; you have 14 business days after one to send more evidence or rebut findings.",
    flows:
      "Yes, and you may not award a sub that must implement NIST SP 800-171 unless it has at least a Basic Assessment from the last 3 years.",
    guide: ["/sprs-score-calculator", "the free SPRS score calculator"],
  },
  {
    id: "252.204-7021",
    reg: "DFARS",
    version: "NOV 2025",
    title:
      "Contractor Compliance With the Cybersecurity Maturity Model Certification Level Requirements",
    kind: "clause",
    source: "dfars-7021",
    info: "FCI or CUI",
    when: "Until 9 Nov 2028, contracts where the program office sets a CMMC level; from 10 Nov 2028, every contract where FCI or CUI is on your systems (COTS-only buys excluded, DFARS 204.7504(a)).",
    does: "Keep a current CMMC status at the level named, for the whole contract, on every system that holds FCI or CUI; affirm in SPRS every year; give the contracting officer your CMMC UIDs; close any POA&M to reach Final.",
    flows:
      "Yes, at the level that fits what you send the sub (32 CFR 170.23), checked before award.",
    guide: ["/cmmc-level-1-vs-level-2", "CMMC Level 1 vs Level 2"],
  },
  {
    id: "252.204-7025",
    reg: "DFARS",
    version: "NOV 2025",
    title: "Notice of Cybersecurity Maturity Model Certification Level Requirements",
    kind: "provision",
    source: "dfars-7025",
    info: "FCI or CUI",
    when: "Every solicitation that carries 7021 (DFARS 204.7504(b)).",
    does: "Names the level. Before award you need that CMMC status in SPRS and a current affirmation; your proposal lists the CMMC UIDs SPRS issued.",
    flows: "No (a solicitation provision).",
    guide: ["/cmmc-level-1-vs-level-2", "CMMC Level 1 vs Level 2"],
  },
  {
    id: "252.204-7024",
    reg: "DFARS",
    version: "MAR 2023",
    title: "Notice on the Use of the Supplier Performance Risk System",
    kind: "provision",
    source: "dfars-7024",
    info: "Neither",
    when: "Solicitations as prescribed in DFARS 204.7604, where the contracting officer uses SPRS risk ratings.",
    does: "Nothing to implement: the contracting officer weighs SPRS's item, price and supplier (quality and delivery) risk ratings. Not a cyber assessment.",
    flows: "No (a solicitation provision).",
    guide: null,
  },
];

/** Dates and periods the clauses set, for the "clocks" table. [what, period, quote id, clause] */
export const CLOCKS = [
  ["Report a cyber incident", "72 hours from discovery", "d7012Rapid", "252.204-7012(a), (c)"],
  [
    "Keep images of affected systems",
    "at least 90 days from the report",
    "d7012Media",
    "252.204-7012(e)",
  ],
  [
    "NIST SP 800-171 assessment in SPRS",
    "no more than 3 years old at award",
    "d7019Award",
    "252.204-7019(b)",
  ],
  ["Rebut a Medium or High Assessment", "14 business days", "d7020Rebut", "252.204-7020(e)(2)"],
  [
    "Final Level 1 (Self) status",
    "1 year, with a yearly affirmation",
    "d7021Level1",
    "252.204-7021(a)",
  ],
  [
    "Final Level 2 status (Self or C3PAO)",
    "3 years, with a yearly affirmation",
    "d7021Level2",
    "252.204-7021(a)",
  ],
  ["Conditional Level 2 status (POA&M open)", "180 days", "d7021Conditional", "252.204-7021(a)"],
  ["CMMC in every FCI or CUI contract", "from 10 Nov 2028", "p7504After", "DFARS 204.7504(a)(2)"],
];

export function dfarsCounts() {
  return {
    clauses: CLAUSES.length,
    provisions: CLAUSES.filter((c) => c.kind === "provision").length,
    flowDown: CLAUSES.filter((c) => c.flows.startsWith("Yes")).length,
    quotes: Object.keys(QUOTES).length,
  };
}

const anchor = (c) => `clause-${c.id.replaceAll(".", "-")}`;

export function dfarsClausesPage({ cite, statusBox, sourcesList, cta }) {
  const n = dfarsCounts();
  const faq = [
    {
      q: "What is the difference between DFARS 252.204-7019 and 252.204-7020?",
      a: "7019 is a provision in the solicitation: to be considered for award you need a NIST SP 800-171 DoD Assessment score in SPRS that is no more than 3 years old. 7020 is the clause in the contract: it defines the Basic, Medium and High Assessments, lets the government assess you, and stops you awarding a subcontract that must implement NIST SP 800-171 unless the sub has at least a Basic Assessment from the last 3 years.",
    },
    {
      q: "What is the difference between DFARS 252.204-7021 and 252.204-7025?",
      a: "7025 is the notice in the solicitation that names the CMMC level and says what must be in SPRS before award, including the CMMC UIDs in your proposal. 7021 is the clause in the contract: keep that status current for the whole contract, affirm every year, and flow the right level down to your subs.",
    },
    {
      q: "Is DFARS 252.204-7024 a cybersecurity requirement?",
      a: "No. It tells you the contracting officer will use SPRS risk ratings (item, price and supplier risk, including quality and delivery) when evaluating offers. It shares SPRS with the cyber clauses, which is why the two get confused, but there is nothing to implement.",
    },
    {
      q: "Does DFARS 252.204-7012 mean my shop needs CMMC?",
      a: "Not on its own. 7012 requires NIST SP 800-171 and incident reporting for covered defense information. CMMC comes through 7021 and 7025, which name a level. Under DFARS 204.7504, until 9 Nov 2028 7021 goes into contracts where the program office sets a level; from 10 Nov 2028 it goes into every contract where FCI or CUI will be on your systems (COTS-only buys excluded).",
    },
    {
      q: "How do I post a Basic Assessment score to SPRS?",
      a: "7019 and 7020 let you email the summary score of a Basic Assessment to webptsmh@navy.mil for posting, with the standard assessed, who did the assessment, the CAGE codes each SSP covers, the date, the score out of 110 and the date you expect to reach 110. For a CMMC self-assessment under 7021 and 7025 you enter the results in SPRS yourself, and SPRS then issues the CMMC UID. The score itself comes from the DoD Assessment Methodology.",
    },
    {
      q: "My purchase order lists these clauses but I only get POs and delivery dates. Which apply?",
      a: "The clause list is often boilerplate. What you receive decides the work: purchase orders and schedules are FCI (FAR 52.204-21, CMMC Level 1); drawings or data marked CUI bring NIST SP 800-171 under 7012 and a score under 7019/7020. If 7021 names a level, that level applies. Ask the buyer in writing which information the order will send you.",
    },
  ];
  const row = (c) =>
    `    <tr><th scope="row"><a href="${DFARS_PATH}#${anchor(c)}">${c.reg} ${c.id}</a></th><td>${c.title}</td><td>${c.kind === "provision" ? "Provision (solicitation)" : "Clause (contract)"}</td><td>${c.info}</td><td>${c.flows.startsWith("Yes") ? "Yes" : "No"}</td></tr>`;
  const block = (c) => `<section class="requirement" id="${anchor(c)}">
  <h3>${c.reg} ${c.id}, ${c.title} (${c.version})</h3>
  <p><strong>${c.kind === "provision" ? "Provision" : "Clause"}</strong> · protects ${c.info === "Neither" ? "neither FCI nor CUI" : c.info} · ${cite(c.source, "full text")}</p>
  <dl>
    <dt>When it is in your paperwork</dt><dd>${esc(c.when)}</dd>
    <dt>What you do (our reading)</dt><dd>${esc(c.does)}</dd>
    <dt>Flows down to your suppliers?</dt><dd>${esc(c.flows)}</dd>
  </dl>
  <p>In its own words: ${quotesFor(c.id).map(q).join(" … ")}${quotesFor(c.id).at(-1) && q(quotesFor(c.id).at(-1)).endsWith(".</q>") ? "" : "."}</p>
  ${c.guide ? `<p>Next: <a href="${c.guide[0]}">${c.guide[1]}</a>.</p>` : ""}
</section>`;
  return {
    path: DFARS_PATH,
    kind: "faq",
    title: `DFARS 7012, 7019, 7020, 7021, 7024, 7025 explained · ${SHORT_NAME}`,
    description:
      "The cyber clauses on a DoD solicitation or PO, FAR 52.204-21 and DFARS 252.204-7008 to 7025: what each asks of a small shop, the deadlines, and what flows down.",
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>DFARS cybersecurity clauses: what 7012, 7019, 7020, 7021, 7024 and 7025 ask of a small shop</h1>
<p class="lead">A defense solicitation or purchase order usually lists a run of cyber clauses by number. This page takes the
${n.clauses} that carry cyber or SPRS duties, FAR 52.204-21 and DFARS 252.204-7008, -7012, -7019, -7020, -7021, -7024 and -7025:
whether each is a provision (about your offer) or a clause (about the work), what it asks you to do and by when, and whether
you must pass it to your own suppliers. Quotations are word for word from the eCFR, read ${humanDateShort(CLAUSES_READ)};
the plain readings are ours.</p>
${statusBox()}
<div class="table-wrap"><table>
  <caption>The ${n.clauses} clauses at a glance</caption>
  <thead><tr><th scope="col">Clause</th><th scope="col">Title</th><th scope="col">Kind</th><th scope="col">Protects</th><th scope="col">Flows down</th></tr></thead>
  <tbody>
${CLAUSES.map(row).join("\n")}
  </tbody>
</table></div>
<h2>Read them in three groups</h2>
<ol>
  <li><strong>FCI: FAR 52.204-21.</strong> The 15 basic safeguards for any system that holds Federal Contract Information,
  which the clause defines as ${q("far21Scope")}. They are CMMC Level 1.</li>
  <li><strong>CUI: DFARS 7008, 7012, 7019, 7020.</strong> Covered defense information (CUI) on your systems means NIST SP 800-171,
  incident reporting, and an assessment score in SPRS. 7008 and 7019 are about the offer; 7012 and 7020 about the work.</li>
  <li><strong>CMMC: DFARS 7025 and 7021.</strong> 7025 in the solicitation names the level (Level 1 (Self), Level 2 (Self),
  Level 2 (C3PAO) or Level 3 (DIBCAC)); 7021 in the contract keeps it current. 7024 sits next to them in most lists but is
  about SPRS risk ratings, not cybersecurity.</li>
</ol>
<h2>The clocks these clauses start</h2>
<div class="table-wrap"><table>
  <caption>Deadlines and periods, each from the clause text</caption>
  <thead><tr><th scope="col">What</th><th scope="col">Period</th><th scope="col">Where</th></tr></thead>
  <tbody>
${CLOCKS.map(([what, period, , where]) => `    <tr><th scope="row">${esc(what)}</th><td>${esc(period)}</td><td>${where}</td></tr>`).join("\n")}
  </tbody>
</table></div>
<p>The 2028 date is when DFARS 204.7504 widens 7021: ${q("p7504Until")}, it goes into contracts where the program office has
set a CMMC level; ${q("p7504After")}, into every contract where your systems will hold FCI or CUI, ${q("p7504Cots")}.
The rollout status above is separate: Phase 2's suspension did not change the clause texts quoted here.</p>
<h2>Each clause</h2>
${CLAUSES.map(block).join("\n")}
<h2>What to do when a PO lists them</h2>
<ol>
  <li><strong>Look at what the order will send you</strong>, not only the clause list, which is often boilerplate. POs, schedules
  and ordinary paperwork are FCI. A drawing or data marked CUI is usually covered defense information (7012 defines it). <a href="/fci-vs-cui">FCI vs CUI</a> sorts the usual paperwork. Ask the buyer in writing when it
  is unclear.</li>
  <li><strong>FCI only:</strong> meet the <a href="/cmmc-level-1-requirements">15 Level 1 requirements</a>; if 7021 names
  Level 1 (Self), enter the self-assessment in SPRS and affirm every year.</li>
  <li><strong>CUI:</strong> work through the <a href="/cmmc-level-2-requirements">110 NIST SP 800-171 requirements</a>, write the
  SSP, score it with the <a href="/sprs-score-calculator">SPRS score calculator</a> and get the score into SPRS before you bid
  (7019). Check <a href="/cmmc-poam-eligible-requirements">which gaps may sit on a POA&amp;M</a> if 7021 names Level 2.</li>
  <li><strong>Your own suppliers:</strong> if you send FCI or CUI on to a heat treater, plater, lab or overflow shop, the
  flow-down rows above apply to you as the buyer.</li>
</ol>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Keep the evidence behind the clauses in one place</h2>
  <p>${SHORT_NAME}'s free Level 1 plan tracks the 15 FAR 52.204-21 requirements, their evidence, a Level 1 SSP and the date
  your next annual affirmation falls due. Level 2 adds the 110 NIST SP 800-171 requirements, the SSP, the POA&amp;M and the
  SPRS score. It does not submit anything to SPRS or decide what is met: your senior official does. See
  <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList(["far-52-204-21", "dfars-7008", "dfars-7012", "dfars-7019", "dfars-7020", "dfars-7021", "dfars-7024", "dfars-7025", "dfars-204-7304", "dfars-204-7504", "dod-methodology", "cfr-170"])}
${cta}`,
  };
}

/** Which quotations each clause's block shows. */
const CLAUSE_QUOTES = {
  "52.204-21": ["far21Scope", "far21Flow"],
  "252.204-7008": ["d7008Rep"],
  "252.204-7012": ["d7012Rapid", "d7012Media", "d7012Cloud", "d7012Flow"],
  "252.204-7019": ["d7019Award", "d7019Email", "d7019Score"],
  "252.204-7020": ["d7020Basic", "d7020Access", "d7020Rebut", "d7020Flow"],
  "252.204-7021": [
    "d7021Maintain",
    "d7021Only",
    "d7021Level1",
    "d7021Level2",
    "d7021Conditional",
    "d7021Flow",
  ],
  "252.204-7025": ["d7025Prior", "d7025Uid"],
  "252.204-7024": ["d7024Use"],
};

function quotesFor(id) {
  if (!Object.hasOwn(CLAUSE_QUOTES, id)) throw new Error(`no quotes for ${id}`);
  return CLAUSE_QUOTES[id]; // own key, checked above
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
