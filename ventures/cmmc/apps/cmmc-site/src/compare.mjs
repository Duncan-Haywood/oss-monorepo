// "CMMC compliance software compared": the options a small machine shop weighs when it searches for
// CMMC compliance software (a spreadsheet, this workspace, FutureFeed, PreVeil Pass, Cuick Trac,
// Project Spectrum, a consultant), with each published price, its source and the date it was read.
//
// Rules (docs/CLAIMS.md): every dollar figure for another product sits next to a cite() of a SOURCES
// entry read on COMPARE_CHECKED (test/compare.test.mjs refuses a row with a $ figure and no source);
// "quote only" where a vendor publishes no price; no rating, ranking or claim about another product's
// quality; our own prices come from plans.mjs, which test/plans.test.mjs ties to the app's plans.ts.
// The page says where another option is cheaper or covers more than ours.

import { publicPlans } from "./plans.mjs";
import { SHORT_NAME, SITE_NAME } from "./site.mjs";

export const COMPARE_PATH = "/cmmc-compliance-software-compared";

/** The date the competitor pages below were read (2026-11-28, on each vendor's own page). */
export const COMPARE_CHECKED = "2026-11-28";

const usd = (cents) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * The rows, in the order a shop's options usually run from cheapest to most help.
 * `src` is the SOURCES id each price cites; null only for rows with no outside figure.
 * @param {{ cite: (id: string, text?: string) => string, paidOn: boolean }} ctx
 */
export function compareRows({ cite, paidOn }) {
  const plans = publicPlans();
  const l2 = plans.find((p) => p.key === "level2");
  const team = plans.find((p) => p.key === "team");
  if (!l2 || !team) throw new Error("plans.mjs lost a Level 2 plan");
  return [
    {
      name: `A spreadsheet (our free <a href="/cmmc-self-assessment-spreadsheet">self-assessment sheet</a>, or your own)`,
      src: null,
      price: "$0",
      covers:
        "Scores the 110 requirements and lists what is open. The SSP, POA&amp;M, evidence and who did what live in other files you keep in step by hand.",
      fits: "A shop doing a first pass, or one with only a few CUI drawings a year and someone tidy to keep the files.",
    },
    {
      name: SHORT_NAME,
      src: null,
      price: `Level 1 free. Level 2 ${usd(l2.priceCents)}/mo or ${usd(l2.annualPriceCents)}/yr (3 users); Level 2 + Quality ${usd(team.priceCents)}/mo (10 users)${paidOn ? "" : ". Level 2 plans are not on sale yet"}`,
      covers:
        "The 15 Level 1 and 110 Level 2 requirements with their objectives, evidence, the SSP, a POA&amp;M with the 32 CFR 170.21 eligibility rules, the SPRS score, and an ISO 9001 clause checklist on the same evidence. Does not store CUI.",
      fits: "A 5 to 100 person shop where the person who runs IT also writes the paperwork, and quality wants ISO 9001 in the same place.",
    },
    {
      name: cite("futurefeed-pricing", "FutureFeed"),
      src: "futurefeed-pricing",
      price:
        "Innovator (25 or fewer FTEs) $99/mo billed annually, $198/mo billed monthly; Standard (26–999 FTEs) $399/mo billed annually. Level 1 included; Level 2 add-on $1,008/yr. Unlimited users",
      covers:
        "A compliance platform with CMMC Level 1 and, with the add-on, Level 2 / NIST SP 800-171 and SPRS scoring. Does not store CUI.",
      fits: "A shop of 25 or fewer that pays yearly and wants the lowest published price for Level 2 software (about $183/mo with the add-on).",
    },
    {
      name: cite("preveil-pass", "PreVeil Pass"),
      src: "preveil-pass",
      price:
        "From $450/mo for 3 users, on a 12-month contract paid up front; more users at extra cost",
      covers:
        "Encrypted email and file sharing for CUI, plus prepared documentation (SSP, standard operating procedures) and training videos. A place to keep CUI, which this workspace is not.",
      fits: "A shop that receives CUI by email today and needs somewhere compliant to keep and send it.",
    },
    {
      name: cite("cuicktrac-pricing", "Cuick Trac"),
      src: "cuicktrac-pricing",
      price:
        "Quote only: priced by users, the applications you need, support and how complex the environment is",
      covers:
        "A managed secure enclave (virtual desktops on Microsoft GCC High and Azure Government) with MFA, encrypted storage, monitoring and patching, so CUI work happens inside it.",
      fits: "A shop that would rather fence CUI into a managed environment than bring its whole network into scope.",
    },
    {
      name: cite("project-spectrum", "Project Spectrum"),
      src: "project-spectrum",
      price: 'Packages by quote ("talk to our team"); no published price',
      covers:
        "A cyber self-assessment against NIST SP 800-171 and CMMC Levels 1 and 2, readiness training and advisory services; it names a partnership with the Department of War Office of Small Business Programs.",
      fits: "A shop that wants training and someone to talk to before it picks tools.",
    },
    {
      name: "A consultant writes the SSP and POA&amp;M",
      src: "preveil-costs",
      price: `$3,000–$25,000 (${cite("preveil-costs", "PreVeil")}); $3,500–$20,000 for small contractors (${cite("secureframe-consultant", "Secureframe")})`,
      covers:
        "Documents written for you from interviews. Keeping them current as machines, people and vendors change is usually extra.",
      fits: "A shop with budget and no one inside who can spend the hours, or one facing a C3PAO assessment soon.",
    },
  ];
}

/** @param {{ cite: Function, statusBox: Function, sourcesList: Function, cta: string, paidOn: boolean }} ctx */
export function comparePage({ cite, statusBox, sourcesList, cta, paidOn }) {
  const rows = compareRows({ cite, paidOn });
  const l2 = publicPlans().find((p) => p.key === "level2");
  const faq = [
    {
      q: "What is the cheapest CMMC compliance software for a small business?",
      a: `A spreadsheet is free, and so is this workspace's Level 1 plan. For Level 2 software, the lowest published price we found on ${humanDate(COMPARE_CHECKED)} was FutureFeed's Innovator plan billed annually with its Level 2 add-on, about $183 a month for a shop of 25 or fewer, below our Level 2 plan at ${usd(l2.priceCents)} a month. Several vendors publish no price at all.`,
    },
    {
      q: "Do I need an enclave or encrypted email as well as compliance software?",
      a: "If you receive or keep CUI, yes, you need somewhere that meets the requirements to store and send it: an enclave, an encrypted email and file service, or a compliant cloud tenant. Compliance software such as this workspace or FutureFeed holds the paperwork, evidence and score, not the CUI. Many small shops end up with one of each.",
    },
    {
      q: "Does any of this software certify my shop?",
      a: "No. For Level 1 and Level 2 (Self), your shop assesses itself and a senior official affirms the result in SPRS. A Level 2 (C3PAO) assessment is done by an authorized third-party assessor. Software can organise the work; it cannot certify you.",
    },
    {
      q: "Can I start with Level 1 and add Level 2 later?",
      a: "Yes, here: the free Level 1 plan keeps the 15 FAR 52.204-21 requirements and their evidence, and Level 2 builds on the same records. FutureFeed also includes Level 1 and sells Level 2 as an add-on.",
    },
  ];
  const row = (r) =>
    `    <tr><th scope="row">${r.name}</th><td>${r.price}</td><td>${r.covers}</td><td>${r.fits}</td></tr>`;
  return {
    path: COMPARE_PATH,
    kind: "faq",
    title: `CMMC compliance software for small shops, compared · ${SITE_NAME}`,
    description:
      "CMMC compliance software for small defense shops compared: a spreadsheet, FutureFeed, PreVeil Pass, Cuick Trac, Project Spectrum and a consultant, with published prices and sources.",
    changefreq: "monthly",
    priority: 0.8,
    faq,
    body: `<h1>CMMC compliance software for small shops, compared</h1>
<p class="lead">What a 5 to 100 person machine shop can use to get through a CMMC Level 1 or Level 2 self-assessment, what each
costs where the vendor publishes a price, and which job each one actually does. Prices were read on each vendor's own page on
${humanDate(COMPARE_CHECKED)}; check them again before you buy.</p>
${statusBox()}
<h2>Two different jobs</h2>
<p>Search results mix two kinds of product. <strong>Somewhere to keep CUI</strong>: an enclave, an encrypted email and file
service or a compliant cloud tenant, so the drawings and data marked CUI sit on systems that meet the requirements.
<strong>The paperwork and the score</strong>: the System Security Plan, the POA&amp;M, the evidence for each requirement and the
SPRS score. A shop with CUI needs both; a shop with only FCI (purchase orders, schedules) needs only the second, at
<a href="/cmmc-level-1-requirements">Level 1</a>. ${SHORT_NAME} is the second kind.</p>
<div class="table-wrap"><table>
  <caption>Options, published prices and scope (vendor pages read ${humanDate(COMPARE_CHECKED)}; each source's date below)</caption>
  <thead><tr><th scope="col">Option</th><th scope="col">Price</th><th scope="col">What it covers</th><th scope="col">Fits a shop that…</th></tr></thead>
  <tbody>
${rows.map(row).join("\n")}
  </tbody>
</table></div>
<h2>Where another option is the better buy</h2>
<ul>
  <li><strong>Lowest price for Level 2 software:</strong> FutureFeed's Innovator plan with its Level 2 add-on, billed annually,
  works out to about $183 a month against our ${usd(l2.priceCents)}, with unlimited users. If a checklist, evidence and SPRS scoring is what you
  need, that is the cheaper published price.</li>
  <li><strong>You receive CUI by email:</strong> PreVeil Pass, an enclave such as Cuick Trac, or a compliant cloud tenant solves
  storage, which no paperwork tool does.</li>
  <li><strong>No one in the shop has the hours:</strong> a consultant writes the documents for you, for $3,000–$25,000 up front against roughly
  $2,200–$5,400 a year at the published software prices above, and keeping them current is usually extra.</li>
</ul>
<h2>What we do differently</h2>
<ul>
  <li>The POA&amp;M checks the rules in ${cite("cfr-170-21", "32 CFR 170.21")} as you go: the 88-point floor, the six requirements
  that may never sit on one, and the 180-day close-out.</li>
  <li>ISO 9001 clause checklist on the same evidence (Level 2 + Quality), for the shop where IT and quality are the same few people.</li>
  <li>Level 1 is free for as long as you use it, with no card.</li>
  <li>Your records come out with you: the SSP as text, the POA&amp;M, asset, supplier and people lists as CSV. The free
  self-assessment spreadsheet imports straight in, so a first pass in Excel is not wasted.</li>
</ul>
<h2>How to choose</h2>
<ol>
  <li><strong>Find out what the contract sends you.</strong> FCI only means Level 1; CUI means Level 2
  (<a href="/cmmc-level-1-vs-level-2">Level 1 vs Level 2</a>, <a href="/dfars-cybersecurity-clauses">the DFARS clauses</a>).</li>
  <li><strong>Get a number before you buy anything.</strong> The free <a href="/sprs-score-calculator">SPRS score calculator</a>
  or <a href="/cmmc-self-assessment-spreadsheet">spreadsheet</a> shows how far off 110 you are and which gaps cost the most.</li>
  <li><strong>If you hold CUI, choose where it lives first</strong>, since that sets the boundary your SSP describes.</li>
  <li><strong>Then pick the paperwork tool</strong> by who will keep it current, how many people need a login, and whether quality
  records belong in the same place.</li>
</ol>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
${sourcesList(["futurefeed-pricing", "preveil-pass", "cuicktrac-pricing", "project-spectrum", "preveil-costs", "secureframe-consultant", "cfr-170-21"])}
${cta}`,
  };
}

/** "2026-11-28" -> "28 Nov 2026" */
function humanDate(iso) {
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
