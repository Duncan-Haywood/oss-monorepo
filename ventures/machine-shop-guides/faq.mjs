// The "Common questions" section on every machine-shop-guides page, and the FAQPage JSON-LD
// that matches it. One source, so the visible questions and the structured data cannot drift.
//
// Every answer restates what the page it sits on already says (the rule, the clause, the method);
// none adds a fact the page does not carry or source. Keep it that way: an answer engine quotes
// these lines on their own.
//
// index.html gets the visible section only: the site build derives its FAQPage from question-shaped
// headings on entry pages (faqEntries() in platform/pages/build.mjs), so a hand-written block there
// would ship the questions twice.
//
// Edit a question: change it here, then run `node faq.mjs` to rewrite the pages and
// `node platform/pages/llms-answers.mjs ventures/machine-shop-guides` (from the repo root) to rewrite llms.txt Answers.
// page.test.mjs fails if a page has no entry here or its block is out of date.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FAQ = {
  "index.html": [
    ["What is an SPRS score and how is it calculated?",
      "It is the NIST SP 800-171 DoD Assessment score a contractor posts in the Supplier Performance Risk System. You start at 110 and subtract 5, 3 or 1 point for each of the 110 requirements not met. The SPRS score calculator here does that arithmetic, with the partial credit for MFA and FIPS cryptography."],
    ["Do I need CMMC Level 1 or Level 2?",
      "It depends on what the contract sends you. Federal Contract Information (FCI) only, under FAR 52.204-21, means Level 1: 15 requirements and a yearly self-assessment. Controlled Unclassified Information (CUI), such as a drawing marked CUI, puts the systems that touch it in Level 2 scope: the 110 requirements of NIST SP 800-171."],
    ["How do I price a machined part?",
      "From your own records: a shop rate built from your books, material per part from the stock price and yield, setup and programming spread over the lot, cycle time at the machine rate, secondary and outside operations, then markup. Re-run it at each quantity for the price breaks. The job-shop quote calculator does the arithmetic and ships no rates of its own."],
    ["Is anything I type uploaded?",
      "No. Every tool on these pages runs in your browser; drawings, models, RFQs and answers are not uploaded. Some pages can keep a draft in your browser if you turn that on."],
  ],
  "cmmc-level-1-self-assessment.html": [
    ["What are the CMMC Level 1 requirements?",
      "The 15 safeguarding requirements of FAR 52.204-21(b)(1)(i) to (xv). 32 CFR 170.14(c)(2) makes them the CMMC Level 1 requirements, and each is judged against its NIST SP 800-171A assessment objectives, 59 in all, reading FCI wherever an objective says CUI."],
    ["Does CMMC Level 1 have a score or a POA&M?",
      "No. Each requirement is met or not met in its entirety, there is no point score, and 32 CFR 170.21 allows no plan of action and milestones at Level 1. Every one of the 15 has to be met before you claim the level."],
    ["How often is the Level 1 self-assessment done?",
      "Every year. The result goes into SPRS with the level, date, scope and CAGE codes, and an Affirming Official affirms compliance at the end of each self-assessment and every year after (32 CFR 170.22)."],
  ],
  "cmmc-level-1-vs-level-2.html": [
    ["What is the difference between CMMC Level 1 and Level 2?",
      "Level 1 is the 15 basic requirements of FAR 52.204-21, self-assessed every year, met or not met with no score. Level 2 is the 110 requirements of NIST SP 800-171 Rev. 2, scored from 110 down, assessed every three years by yourself or by a C3PAO, with an annual affirmation."],
    ["How do I know if my shop handles CUI or only FCI?",
      "The contract tells you. Look for DFARS 252.204-7012, 7019, 7020 and 7021 in your purchase orders and flow-downs, and for drawings or models that arrive marked CUI. If every contract only involves FCI, such as purchase orders and delivery schedules, you are looking at Level 1."],
    ["Is CMMC Phase 2 suspended?",
      "As of 24 November 2026, yes. Phase 2, which would have required C3PAO Level 2 certification from 10 November 2026, was suspended by the Department of War on 13 July 2026. Self-assessments, DFARS 252.204-7012 and the SPRS score requirements of 7019 and 7020 still apply."],
  ],
  "cmmc-subcontractor-flow-down.html": [
    ["What CMMC level does my subcontractor need?",
      "It depends on what the subcontract sends them. Under 32 CFR 170.23, a supplier that will only process, store or transmit FCI needs Level 1 (Self). One that handles CUI needs Level 2 (Self) at least, and Level 2 (C3PAO) when the prime contract requires Level 2 (C3PAO) or Level 3 (DIBCAC)."],
    ["Do I have to flow CMMC down to my plater or heat treater?",
      "Yes, when the subcontract will involve FCI or CUI. DFARS 252.204-7021(f)(1) has you insert the substance of the clause, except paragraph (e)(1), in subcontracts that will contain a requirement to process, store or transmit FCI or CUI, commercial ones included; commercially available off-the-shelf items are excluded."],
    ["What do I check before I award a subcontract?",
      "That the supplier has a current CMMC status at the level the information calls for (252.204-7021(f)(2)) and has completed its affirmation before award (paragraph (d)(4)). Current means a Final Level 1 status within 1 year, a Final Level 2 status within 3 years, or a Conditional status within 180 days, each with an affirmation no older than 1 year."],
  ],
  "cmmc-scoping-worksheet.html": [
    ["What are the CMMC asset categories?",
      "For Level 2, 32 CFR 170.19 sorts every asset into five: CUI Assets, Security Protection Assets, Contractor Risk Managed Assets, Specialized Assets and Out-of-Scope Assets. Each has its own documentation and assessment requirements."],
    ["Are CNC controllers in CMMC scope?",
      "Usually as Specialized Assets: equipment that can process CUI but cannot be fully secured, such as operational technology and test equipment. They are documented and managed under your risk-based policies, but not assessed against the other requirements. At Level 1, Specialized Assets are not part of the assessment scope."],
    ["Why scope before writing the SSP?",
      "Every asset you put in scope as a CUI Asset has to meet all 110 requirements and becomes a line in the SSP and the SPRS score. A small enclave, such as one mailbox, one share, two workstations and the shop-floor machines as Specialized Assets, is often far less work than securing the whole office."],
  ],
  "sprs-score-calculator.html": [
    ["How is the SPRS score calculated?",
      "The NIST SP 800-171 DoD Assessment Methodology starts at 110 and subtracts 5, 3 or 1 point for each requirement not implemented, using the weights in its Annex A. The lowest possible score is minus 203."],
    ["What is the minimum SPRS score for CMMC Conditional Level 2?",
      "88, which is 80% of 110, under 32 CFR 170.21, and every open item must be one the rule allows on a POA&M: in general 1-point requirements only, plus 3.13.11 at its 3-point partial value. Six requirements can never be left open: 3.1.20, 3.1.22, 3.12.4, 3.10.3, 3.10.4 and 3.10.5."],
    ["Which requirements get partial credit?",
      "Two. 3.5.3 multifactor authentication costs 3 points instead of 5 when MFA covers only remote and privileged users, and 3.13.11 costs 3 instead of 5 when CUI is encrypted but the module is not FIPS-validated. 3.12.4, the system security plan, has no points, but without it no score can be completed."],
  ],
  "nist-800-171-ssp-template.html": [
    ["What does a NIST 800-171 SSP need to include?",
      "Requirement 3.12.4 asks for the system boundaries, the environments of operation, how each security requirement is implemented, and the relationships with or connections to other systems. NIST prescribes no format; this template lays it out as contacts, the system, a summary, one entry per requirement and the POA&M."],
    ["Can I get an SPRS score without an SSP?",
      "No. The DoD Assessment Methodology says an assessment cannot be completed without a system security plan, which is why 3.12.4 has no point value but blocks the score."],
    ["What date do I post in SPRS for reaching 110?",
      "A Basic assessment asks for the date you expect to reach 110. The template takes it from the latest milestone date on your POA&M gaps, and only when every gap has one."],
  ],
  "ssp-and-poam.html": [
    ["What is the difference between an SSP and a POA&M?",
      "The system security plan says what your system is and how each NIST SP 800-171 requirement is met (requirement 3.12.4). The plan of action and milestones says how and when you will close what is not met (requirement 3.12.2)."],
    ["What can be left on a POA&M for CMMC Level 2?",
      "Under 32 CFR 170.21: a score of at least 88 of 110, generally only 1-point requirements open (plus 3.13.11 at its 3-point partial value), never 3.1.20, 3.1.22, 3.12.4, 3.10.3, 3.10.4 or 3.10.5, and everything closed by a closeout assessment within 180 days. Level 1 allows no POA&M at all."],
    ["What goes in a POA&M row?",
      "The requirement, the weakness as you found it, the planned action, who is responsible, the resources needed, milestone dates and the current status. NIST does not prescribe a format."],
  ],
  "cmmc-affirmation-dates.html": [
    ["How often does a CMMC affirmation have to be made?",
      "After every assessment, including a POA&M closeout, and annually thereafter (32 CFR 170.22(a)). The Affirming Official enters each one in SPRS. This page counts the year from the latest affirmation you enter."],
    ["How long do I have to close out a Conditional CMMC Level 2 status?",
      "180 days from the Conditional CMMC Status Date. For Level 2 (Self) the closeout self-assessment is posted to SPRS within that time; for Level 2 (C3PAO) a C3PAO performs the closeout assessment. If the 180 days pass without a closeout, the Conditional status expires."],
    ["When is the next CMMC assessment due?",
      "A year after the CMMC Status Date for Level 1 (Self), and three years after it for Level 2, by yourself or by a C3PAO. A POA&M closeout does not restart the three years: they count from the original status date."],
  ],
  "cmmc-cost.html": [
    ["How much does CMMC certification cost a small business?",
      "DoD's own estimate in the CMMC final rule (89 FR 83092) is $104,670 over three years for a small business at Level 2 (C3PAO): $101,752 for the assessment and its affirmation, of which $31,234 is the C3PAO, plus two annual affirmations of $1,459. Level 2 (Self) is $37,196 over three years and Level 1 (Self) $5,977 a year. This page recomputes those lines with your own rates."],
    ["Does DoD's CMMC cost estimate include implementing the controls?",
      "No. The rule says its estimates do not include the cost to implement the Level 1 or Level 2 security requirements, maintain them, or remediate a plan of action, because FAR 52.204-21 and DFARS 252.204-7012 already required them. If your shop is not yet compliant, that cost is on top; enter your own figure for it here."],
    ["What hourly rates did DoD assume for CMMC?",
      "$190.52 an hour for a director, $86.24 for a small business's staff IT specialist, and $260.28 for an outside service provider (ESP) or C3PAO assessor, which the rule says includes overhead, G&A and profit. For small businesses DoD assumed most of the work goes to an ESP."],
  ],
  "dfars-7012-incident-reporting.html": [
    ["How long do I have to report a cyber incident under DFARS 252.204-7012?",
      "72 hours from discovery. The clause defines \"rapidly report\" as within 72 hours of discovery of any cyber incident, and the report is filed at dibnet.dod.mil. The clock starts at discovery, not when your review ends."],
    ["How long must I keep images after an incident?",
      "At least 90 days from submitting the cyber incident report, under paragraph (e): images of the affected systems and the relevant monitoring and packet capture data. The 90 days start at the report, not at discovery."],
    ["What do I need before I can file on DIBNet?",
      "A DoD-approved medium assurance certificate, obtained through the External Certification Authority program (paragraph (c)(3)). Get it before an incident, not inside the 72 hours."],
  ],
  "stock-size-from-step-file.html": [
    ["How do I find the stock size from a STEP file?",
      "Drop the .step, .stp or .stl file on this page. It works out the part's bounding box, the round bar it would turn from, and the stock to cut with your allowance per side, facing and cut-off, and rounding. The file is read in your browser and never uploaded."],
    ["How accurate is the bounding box?",
      "For STEP it reads the solid's edges, so faces on planes, cylinders and cones give the exact box; spheres, fillets and free-form surfaces get a containing shape and a warning. Checked against OpenCascade on 68 parts, it never gave a box smaller than the part, 60 were exact and the rest were at most 2.8 mm too large and flagged."],
    ["Can it estimate cycle time?",
      "As a first number, from your own cutting data: roughing time is the metal to remove divided by your removal rate, finishing time is the surface area divided by your stepover times feed, plus your non-cutting allowance. It knows nothing about holes, threads or setups, so treat it as a starting line."],
  ],
  "job-shop-quote-calculator.html": [
    ["How do job shops calculate a quote?",
      "Material, setup, programming, cycle time, secondary operations and markup, from the shop's own rates. This calculator adds those lines and spreads the once-per-lot costs over the quantity, then shows the price per part at every quantity break."],
    ["Why does a small quantity cost more per part?",
      "Setup, programming and any flat lot charge are paid once per lot. Spread over 5 parts they add far more to each part than spread over 100, so the quantity breaks are arithmetic, not a discount schedule."],
    ["What is the difference between markup and margin?",
      "Markup is on cost: price = cost × (1 + markup). Margin is on price. A 25% markup on cost is a 20% margin on price."],
  ],
  "machining-quote-template.html": [
    ["Is there a free machining quote template for Excel?",
      "Yes: a two-sheet .xlsx with no macros. The quote worksheet prices material with scrap, setup, programming spread over the lots expected, cycle time, up to six other operations and markup at six quantity breaks, from your own rates. The customer quote sheet shows price each and extended price only."],
    ["Why is the price each rounded up to the cent?",
      "So the quote never comes in under the calculated price, and so the extended price is the quoted price each times the quantity and the quote adds up line by line."],
    ["Should the cost lines go on the quote I send?",
      "No. Material, setup, machining and markup are your internal numbers. The template keeps them on the quote worksheet; the customer quote sheet carries part number and revision, quantities, price each, extended price, lead time, validity and terms."],
  ],
  "how-to-price-a-machined-part.html": [
    ["How do I work out a machine shop rate?",
      "From your books: the year's overhead (rent, utilities, insurance, software, equipment payments or depreciation, indirect wages) plus direct labour, divided by the hours you actually bill, not the hours the doors are open. Many shops keep separate rates per machine type."],
    ["How do I calculate material cost per part?",
      "Take the price of the stock form you will buy and divide by the number of parts one unit yields after saw kerf, facing stock, unusable remnant and workholding grip, then add an allowance for setup pieces and rejects."],
    ["How should outside processes go on a quote?",
      "Outside processes such as plating, anodizing or heat treatment usually carry a per-part price and a lot minimum. For short runs the minimum is what you pay, so quote it as a flat charge per lot rather than burying it in the part price."],
  ],
  "machine-shop-quoting-software.html": [
    ["What kinds of machine shop quoting software are there?",
      "Four: a spreadsheet or calculator, the quoting module inside a job-shop ERP, a standalone quoting platform, and the newer AI RFQ readers that draft the parts and operations from the email, drawing and model for an estimator to check. Each needs your own rates before it gives a good number."],
    ["How much does machine shop quoting software cost?",
      "Public listings checked on 24 November 2026 showed QuotedPart at $199 a month per shop (Toolradar), JobBOSS² at about $3,000 a year (SoftwareConnect) and ProShop at $650 to $715 a month (G2). We could confirm no public price for Paperless Parts or the AI quoting entrants. Listings disagree, so get the current price from the vendor."],
    ["Can I upload CUI drawings to a quoting tool?",
      "Only to a service that may hold them. Under DFARS 252.204-7012(b)(2)(ii)(D), a cloud service that stores covered defense information for you must meet security requirements equivalent to the FedRAMP Moderate baseline. Ask the vendor in writing, and keep CUI and export-controlled drawings out of any tool that says no."],
  ],
  "quote-vs-actual.html": [
    ["How do I compare quoted and actual hours?",
      "Export the job cost or estimate-vs-actual report from your ERP, or keep the same columns from travelers and the time clock, and paste it here. The page shows, per machine, the median of actual ÷ quoted, the hours missed and what they cost at your rate."],
    ["What is a quote correction factor?",
      "The median ratio of actual to quoted hours on a machine: 1.20 means the typical job took 20% longer than quoted. The job-shop quote calculator multiplies your setup and cycle-time estimates by it. It is offered with at least 5 jobs and called rough below 15."],
    ["Why use the median instead of the average?",
      "So one scrapped-and-rerun job does not move every future quote. Jobs that took more than twice, or under half, the quoted time are listed separately as worth a look."],
  ],
  "rfq-review.html": [
    ["What should I check in an RFQ before quoting?",
      "Part numbers and drawing revisions, lot sizes and annual usage, material and finish specs, the tightest tolerances, the quote and delivery dates, and the FAR and DFARS clauses that add cost or decide whether you can take the job. Whatever is missing becomes a question for the buyer."],
    ["Which DFARS clauses matter for a machine shop?",
      "252.204-7012 (protecting CUI to NIST SP 800-171), 252.204-7019 and -7020 (a current SPRS score), 252.204-7021 (a CMMC level), 252.225-7009 (specialty metals) and 252.225-7048 (export control), alongside FAR 52.246-11 (a named quality standard) and 52.211-15 (DPAS-rated orders)."],
    ["Do ISO 9001 and AS9100 require contract review?",
      "Both ask for a review of the requirements before you commit to supply, in clause 8.2.3 (review of the requirements for products and services)."],
  ],
  "machine-hour-rate.html": [
    ["How do I calculate a CNC machine hour rate?",
      "Add up what the machine costs a year (depreciation or lease, the cost of money tied up in it, floor space, maintenance and its share of shop overhead) and divide by the hours you can bill, then add the per-hour costs: power, tooling and, for an attended hour, the operator. This page does that per machine from your own numbers."],
    ["Why does utilization change the machine rate so much?",
      "Most of an hour's cost is yearly cost spread over billable hours, so the same machine billing fewer hours costs more per hour. The page shows each machine's rate at 10 points more and less utilization, so an optimistic guess is easy to see."],
    ["Should a machine shop have one shop rate or a rate per machine?",
      "A rate per machine prices work more accurately when the machines cost very different amounts to own and run: a single blended rate undercharges hours on the expensive machines and overcharges hours on the cheap ones. The page gives both the per-machine rates and the blended one."],
  ],
  "drawing-review.html": [
    ["What should I check on a part drawing before quoting?",
      "The title block (part number, revision, material, finish), whether the revision table's last row matches it, the general tolerance block, every numbered note, the tightest tolerances and surface finishes, and any distribution or export marking."],
    ["What does \"unless otherwise specified\" mean on a drawing?",
      "It sets the tolerance for every dimension with none of its own, usually by decimal places, plus angles and sometimes fractions; an ISO 2768 class uses that standard's tables instead. It often decides the machine and the inspection, because it covers most of the part."],
    ["What do distribution statements on a drawing mean?",
      "Statement A means approved for public release; B to F limit distribution, so check before forwarding the drawing to a plating or heat-treat house. A CUI marking means the systems holding the file must meet NIST SP 800-171."],
  ],
  "first-article-inspection.html": [
    ["What is a first article inspection?",
      "A full inspection of one part made by the production process, to show the process can make the part to the drawing before the lot runs. Aerospace and defense customers usually ask for it in the AS9102 format: Form 1 part number accountability, Form 2 product accountability, Form 3 characteristic accountability."],
    ["When is a first article inspection required?",
      "Normally on a new part, and again after a change that could affect it: the design, the process or source, the inspection method, the tooling or the location. A partial FAI covers only what the change touched. Lapses in production differ by customer, so the PO clauses and quality manual decide."],
    ["What gets an FAI report rejected?",
      "A characteristic with no balloon or no result, \"accept\" written where a value can be measured, a result out of limits with no nonconformance number, fewer results than places on a multi-place feature, and missing certificates or a revision mismatch on Forms 1 and 2."],
  ],
};

const START = "<!-- faq: generated by faq.mjs, do not edit by hand -->";
const END = "<!-- /faq -->";
const LD_START = "<!-- faq-ld: generated by faq.mjs -->";
const LD_END = "<!-- /faq-ld -->";

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Inside <script>, "</" would end the block early; JSON allows the escaped form.
const json = (v) => JSON.stringify(v).replace(/<\//g, "<\\/");

export function section(name) {
  const qa = FAQ[name].map(([q, a]) => `  <h3>${esc(q)}</h3>\n  <p>${esc(a)}</p>`).join("\n");
  return `${START}\n<section id="faq">\n  <h2>Common questions</h2>\n${qa}\n</section>\n${END}`;
}

export function ld(name) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ[name].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return `${LD_START}\n  <script type="application/ld+json">${json(data)}</script>\n  ${LD_END}`;
}

function replaceOrInsert(html, start, end, block, anchor, name) {
  const at = html.indexOf(start);
  if (at >= 0) return html.slice(0, at) + block + html.slice(html.indexOf(end) + end.length);
  const pos = html.indexOf(anchor);
  if (pos < 0) throw new Error(`${name}: no ${anchor} to put the FAQ before`);
  return html.slice(0, pos) + block + "\n" + html.slice(pos);
}

export function apply(html, name) {
  if (!FAQ[name]) throw new Error(`add ${name} to FAQ in faq.mjs`);
  let out = replaceOrInsert(html, START, END, section(name), "</main>", name);
  if (name !== "index.html") out = replaceOrInsert(out, LD_START, LD_END, ld(name), "</head>", name);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const file = new URL(name, dir);
    const html = readFileSync(file, "utf8");
    const out = apply(html, name);
    if (out !== html) { writeFileSync(file, out); console.log(`updated ${name}`); }
  }
}
