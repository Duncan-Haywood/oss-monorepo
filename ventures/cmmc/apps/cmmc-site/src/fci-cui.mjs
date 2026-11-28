// "FCI vs CUI": how a small shop tells Federal Contract Information from Controlled Unclassified
// Information, which is the question that sets its CMMC level (FCI only: Level 1; CUI: Level 2), and
// how CUI is marked when it arrives.
//
// Every quotation is in QUOTES and is checked word for word against a regulation text saved in
// fixtures/ (FAR 52.204-21 and DFARS 252.204-7012 from fixtures/dfars/, read 27 Nov 2026; 32 CFR
// 2002.4 and 2002.20 from fixtures/cui/, read from the eCFR versioner API at the 2026-11-01 point in
// time on 28 Nov 2026, tags stripped, one paragraph per line; sha256 pinned in test/fci-cui.test.mjs).
// The examples table and the readings are ours, and the page says so. Nothing here decides what a
// given document is: its markings, the contract and the designating agency do.

import { SHORT_NAME } from "./site.mjs";

export const FCI_CUI_PATH = "/fci-vs-cui";

/** The date the 32 CFR Part 2002 texts in fixtures/cui/ were read. */
export const CUI_READ = "2026-11-28";

/** Quotations, each found word for word in its fixture (test/fci-cui.test.mjs). */
export const QUOTES = {
  fciDef: {
    file: "dfars/far-52.204-21.txt",
    text: "information, not intended for public release, that is provided by or generated for the Government under a contract to develop or deliver a product or service to the Government, but not including information provided by the Government to the public (such as on public Web sites) or simple transactional information, such as necessary to process payments",
  },
  cuiDef: {
    file: "cui/cfr-32-2002.4.txt",
    text: "information the Government creates or possesses, or that an entity creates or possesses for or on behalf of the Government, that a law, regulation, or Government-wide policy requires or permits an agency to handle using safeguarding or dissemination controls",
  },
  cuiNotOwn: {
    file: "cui/cfr-32-2002.4.txt",
    text: "information a non-executive branch entity possesses and maintains in its own systems that did not come from, or was not created or possessed by or for, an executive branch agency or an entity acting for an agency",
  },
  cuiBasic: {
    file: "cui/cfr-32-2002.4.txt",
    text: "CUI Basic is the subset of CUI for which the authorizing law, regulation, or Government-wide policy does not set out specific handling or dissemination controls.",
  },
  cuiSpecified: {
    file: "cui/cfr-32-2002.4.txt",
    text: "the underlying authority spells out specific controls for CUI Specified information and does not for CUI Basic information",
  },
  cdiMarked: {
    file: "dfars/dfars-252.204-7012.txt",
    text: "Marked or otherwise identified in the contract, task order, or delivery order and provided to the contractor by or on behalf of DoD in support of the performance of the contract",
  },
  cdiDeveloped: {
    file: "dfars/dfars-252.204-7012.txt",
    text: "Collected, developed, received, transmitted, used, or stored by or on behalf of the contractor in support of the performance of the contract",
  },
  ctiDef: {
    file: "dfars/dfars-252.204-7012.txt",
    text: "technical information with military or space application that is subject to controls on the access, use, reproduction, modification, performance, display, release, disclosure, or dissemination",
  },
  ctiDist: {
    file: "dfars/dfars-252.204-7012.txt",
    text: "would meet the criteria, if disseminated, for distribution statements B through F",
  },
  banner: {
    file: "cui/cfr-32-2002.20.txt",
    text: "The CUI control marking may consist of either the word “CONTROLLED” or the acronym “CUI,” at the designator's discretion.",
  },
  designator: {
    file: "cui/cfr-32-2002.20.txt",
    text: "All documents containing CUI must carry an indicator of who designated the CUI within it.",
  },
  sameEveryPage: {
    file: "cui/cfr-32-2002.20.txt",
    text: "must be the same on each page of the document that includes CUI",
  },
  unmarked: {
    file: "cui/cfr-32-2002.20.txt",
    text: "The lack of a CUI marking on information that qualifies as CUI does not exempt the authorized holder from abiding by applicable handling requirements",
  },
  wrongMark: {
    file: "cui/cfr-32-2002.20.txt",
    text: "An agency receiving an incorrectly marked document should notify either the disseminating entity or the designating agency, and request a properly marked document.",
  },
  workingPapers: {
    file: "cui/cfr-32-2002.20.txt",
    text: "Mark working papers containing CUI the same way as the finished product containing CUI would be marked",
  },
  package: {
    file: "cui/cfr-32-2002.20.txt",
    text: "Do not put CUI markings on the outside of an envelope or package, or otherwise indicate on the outside that the item contains CUI.",
  },
  transmittal: {
    file: "cui/cfr-32-2002.20.txt",
    text: "When enclosure is removed, this document is Uncontrolled Unclassified Information",
  },
};

/**
 * What a small shop typically holds, and our reading of what each is. verdict: "FCI", "CUI",
 * "Neither" or "Ask". why: the quotation the reading rests on.
 */
export const EXAMPLES = [
  {
    item: "A DoD purchase order, its delivery schedule and the quantities",
    verdict: "FCI",
    reading:
      "Provided by the government under a contract and not meant for public release. Not CUI unless it is marked as such.",
    why: "fciDef",
  },
  {
    item: "Invoices, remittance details and the data needed to get paid",
    verdict: "Neither",
    reading:
      "The FCI definition leaves out simple transactional information needed to process payments.",
    why: "fciDef",
  },
  {
    item: "A drawing or specification the government has released to the public",
    verdict: "Neither",
    reading:
      "Information the government has released to the public is not FCI, and nothing controls it.",
    why: "fciDef",
  },
  {
    item: "A drawing, model or spec with a CUI banner, or a distribution statement B to F",
    verdict: "CUI",
    reading:
      "Controlled technical information: the 7012 definition ties it to distribution statements B through F. Treat it as covered defense information.",
    why: "ctiDist",
  },
  {
    item: "CAM programs, setup sheets, inspection and first-article reports made from that drawing",
    verdict: "CUI",
    reading:
      "Developed by the shop in support of the contract from controlled technical data, so it stays covered defense information; working papers are marked like the finished product.",
    why: "cdiDeveloped",
  },
  {
    item: "Drawings of your own commercial product, never received from or made for the government",
    verdict: "Neither",
    reading:
      "CUI excludes information an outside company keeps in its own systems that did not come from, and was not made for, an agency.",
    why: "cuiNotOwn",
  },
  {
    item: "A technical drawing from a prime with no marking, or a marking that looks wrong",
    verdict: "Ask",
    reading:
      "A missing marking does not end the handling duties if the information qualifies. Ask the sender in writing for a properly marked copy, and protect it until they answer.",
    why: "unmarked",
  },
];

export function fciCuiCounts() {
  const by = (v) => EXAMPLES.filter((e) => e.verdict === v).length;
  return {
    quotes: Object.keys(QUOTES).length,
    examples: EXAMPLES.length,
    fci: by("FCI"),
    cui: by("CUI"),
    neither: by("Neither"),
    ask: by("Ask"),
  };
}

const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A quotation from QUOTES, marked with its id so the test can find it. */
export function q(id) {
  const x = Object.hasOwn(QUOTES, id) ? QUOTES[id] : null;
  if (!x) throw new Error(`no quote ${id}`);
  return `<q data-quote="${id}">${esc(x.text)}</q>`;
}

const LEVEL = {
  FCI: "Level 1",
  CUI: "Level 2",
  Neither: "No CMMC level from this alone",
  Ask: "Level 2 until the sender says otherwise",
};

function levelFor(verdict) {
  if (!Object.hasOwn(LEVEL, verdict)) throw new Error(`no level for ${verdict}`);
  return LEVEL[verdict]; // own key, checked above
}

export function fciCuiPage({ cite, statusBox, sourcesList, cta }) {
  const n = fciCuiCounts();
  const faq = [
    {
      q: "What is the difference between FCI and CUI?",
      a: "FCI is any information the government gives you, or you create for it, under a contract and not meant for public release, apart from payment details. CUI is the narrower set that a law, regulation or government-wide policy says must be protected or limited in who sees it. FCI on your systems means FAR 52.204-21 and CMMC Level 1; CUI means NIST SP 800-171 under DFARS 252.204-7012 and, where a level is named, CMMC Level 2.",
    },
    {
      q: "Is every technical drawing from the DoD CUI?",
      a: "No. A drawing the government has released to the public is not controlled. A drawing whose distribution is limited (a distribution statement B through F) is controlled technical information under DFARS 252.204-7012's definition, and that is CUI. Look for the CUI banner, the distribution statement and the 'Controlled by' line, and ask the sender when they are missing.",
    },
    {
      q: "A drawing has no CUI marking. Can I treat it as FCI?",
      a: "Only if it really does not qualify. 32 CFR 2002.20(a)(7) says a missing marking does not exempt the holder from handling requirements when the information qualifies as CUI. Ask the prime or contracting officer in writing for a properly marked copy, and keep the drawing on your protected systems until they answer.",
    },
    {
      q: "Are the CAM programs and inspection reports I make from a CUI drawing CUI too?",
      a: "Usually yes. DFARS 252.204-7012 counts as covered defense information what the contractor develops or uses in support of the contract, not only what DoD sends, and 32 CFR 2002.20(k) says working papers are marked like the finished product. Keep them inside the same boundary as the drawing: the machines, file shares and cloud folders in your SSP.",
    },
    {
      q: "What is the difference between CUI Basic and CUI Specified?",
      a: "For CUI Basic, the authorising rule says to protect the information but sets no special controls, so the uniform rules in 32 CFR Part 2002 apply. For CUI Specified, the authorising rule spells out its own controls, and the category marking must appear in the banner. Either way, on a DoD contract your systems need NIST SP 800-171.",
    },
    {
      q: "How should CUI be marked when I ship parts or paperwork?",
      a: "Keep the CUI marking on the documents themselves, with the same banner on every page that holds CUI. Do not mark the outside of the envelope or package (32 CFR 2002.20(i)(2)). A cover letter sent with CUI carries the CUI marking and a line such as 'When enclosure is removed, this document is Uncontrolled Unclassified Information'.",
    },
  ];
  const row = (e) =>
    `    <tr><th scope="row">${esc(e.item)}</th><td><strong>${e.verdict}</strong></td><td>${levelFor(e.verdict)}</td><td>${esc(e.reading)}</td></tr>`;
  return {
    path: FCI_CUI_PATH,
    kind: "faq",
    title: `FCI vs CUI: which one sets your CMMC level · ${SHORT_NAME}`,
    description:
      "FCI or CUI? The legal definitions word for word, how CUI is marked, and what a machine shop's POs, drawings and CAM files are, so you know your CMMC level.",
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>FCI vs CUI: which one your shop holds, and what it makes your CMMC level</h1>
<p class="lead">Your CMMC level follows the information on your systems. Federal Contract Information (FCI) alone means
Level 1 and the 15 safeguards of FAR 52.204-21; Controlled Unclassified Information (CUI) means NIST SP 800-171 and Level 2.
This page gives both definitions word for word, how to recognise CUI by its markings, and what the usual paperwork in a
machine shop is. Quotations are from the regulations (32 CFR Part 2002 read on the eCFR ${humanDateShort(CUI_READ)});
the examples and readings are ours. The contract, the markings and the agency that designated the information decide.</p>
${statusBox()}
<h2>The two definitions</h2>
<dl>
  <dt>Federal Contract Information (${cite("far-52-204-21", "FAR 52.204-21")})</dt>
  <dd>${q("fciDef")}.</dd>
  <dt>Controlled Unclassified Information (${cite("cfr-2002-4", "32 CFR 2002.4(h)")})</dt>
  <dd>${q("cuiDef")}. It does not include ${q("cuiNotOwn")}.</dd>
</dl>
<p>Read together: FCI is the wide set, everything non-public you get or make under a DoD contract except payment details.
CUI is the part of it some law or policy says must be protected. On a DoD contract, CUI usually reaches a shop as
<strong>covered defense information</strong> under ${cite("dfars-7012", "DFARS 252.204-7012")}: CUI that is
${q("cdiMarked")}, or that is ${q("cdiDeveloped")}. For a machine shop the common kind is <strong>controlled technical
information</strong>: ${q("ctiDef")}. The clause adds that it ${q("ctiDist")}.</p>
<h2>CUI Basic and CUI Specified</h2>
<p>${q("cuiBasic")} With CUI Specified, ${q("cuiSpecified")} (${cite("cfr-2002-4", "32 CFR 2002.4(j), (r)")}). The
categories and their markings are listed in the ${cite("cui-registry", "CUI Registry")}. For your shop the difference shows
up in the banner (a Specified category must be named in it) and in any extra handling the category's rule sets; the
NIST SP 800-171 requirements on your systems are the same.</p>
<h2>What the usual paperwork is</h2>
<div class="table-wrap"><table>
  <caption>${n.examples} things a small shop holds, with our reading (not a determination)</caption>
  <thead><tr><th scope="col">What</th><th scope="col">Is</th><th scope="col">CMMC level it points to</th><th scope="col">Why (our reading)</th></tr></thead>
  <tbody>
${EXAMPLES.map(row).join("\n")}
  </tbody>
</table></div>
<p>One CUI drawing is enough to bring every system it touches into Level 2 scope: the CAM workstation, the file share,
the email account it arrived in and the machine control it was loaded onto. Shops often keep CUI on a small, separate
set of systems for that reason; the <a href="/what-it-does">workspace</a> records that boundary in the SSP.</p>
<h2>How CUI is marked</h2>
<ul>
  <li><strong>Banner.</strong> ${q("banner")} The banner ${q("sameEveryPage")} (${cite("cfr-2002-20", "32 CFR 2002.20(b), (c)")}).</li>
  <li><strong>Who designated it.</strong> ${q("designator")} Often a "Controlled by" line on the first page (2002.20(d)).</li>
  <li><strong>Missing or wrong markings.</strong> ${q("unmarked")} (2002.20(a)(7)). For agencies the rule is: ${q("wrongMark")}
  The same request, in writing, to your prime or contracting officer is the practical step for a shop.</li>
  <li><strong>Your own copies and notes.</strong> ${q("workingPapers")} (2002.20(k)).</li>
  <li><strong>Shipping.</strong> ${q("package")} A cover letter with CUI attached carries the marking and a line such as
  ${q("transmittal")} (2002.20(i), (j)).</li>
</ul>
<h2>What to do next</h2>
<ol>
  <li><strong>List what each order sends you</strong> and sort it with the table above. Keep the list: the SSP's boundary
  and the supplier register both start from it.</li>
  <li><strong>FCI only:</strong> meet the <a href="/cmmc-level-1-requirements">15 Level 1 requirements</a> and affirm every year.</li>
  <li><strong>Any CUI:</strong> scope the systems it touches, work through the <a href="/cmmc-level-2-requirements">110
  NIST SP 800-171 requirements</a>, and get a score with the <a href="/sprs-score-calculator">SPRS score calculator</a>.
  Which clause on the order asks for what is on <a href="/dfars-cybersecurity-clauses">DFARS cybersecurity clauses explained</a>.</li>
  <li><strong>Sending it on:</strong> if a heat treater, plater or inspection lab gets the drawing from you, the same sorting
  decides the level you flow down.</li>
</ol>
<p>The level comparison is on <a href="/cmmc-level-1-vs-level-2">CMMC Level 1 vs Level 2</a>.</p>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<section class="sibling">
  <h2>Keep the answer with the evidence</h2>
  <p>${SHORT_NAME} keeps the systems that hold FCI or CUI in the SSP's boundary, the requirements and their evidence,
  and the supplier register that records what each order sends (CUI, FCI or neither). The free plan covers Level 1. It
  does not decide what your information is: the contract and its markings do. See <a href="/what-it-does">what it does</a>.</p>
</section>
${sourcesList(["far-52-204-21", "cfr-2002-4", "cfr-2002-20", "cui-registry", "dfars-7012", "cfr-170"])}
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
