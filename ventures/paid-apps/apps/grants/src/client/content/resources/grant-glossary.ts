import { type ResourceArticle, readingMinutesFor } from "./types";

// Each term is an "### " heading followed by one or more paragraphs. scripts/prerender.mjs builds the
// page's DefinedTermSet JSON-LD from the rendered <h3> + following <p>, so keep that shape: one term per
// heading, the definition in plain paragraphs right under it. Every rule or number here is already
// sourced in another guide or in the pages listed in `sources`.
const body = `Grant writing comes with its own vocabulary, and funders rarely stop to explain it. This glossary defines the terms small nonprofits, tribal and community organizations and workforce programs run into most, in plain language, with links to the longer guides where a term needs more than a paragraph.

Rules and amounts change. Where a definition mentions a federal rule, check the current version of the rule or the funder's own instructions before you rely on it.

## Finding funders

### Request for proposals (RFP)

A funder's public call for applications. It says what the funder will pay for, who is eligible, what to submit and the deadline. Read it twice before you write anything, and answer its questions in its order.

### Notice of funding opportunity (NOFO)

The federal name for a funding announcement. The federal grant rules in 2 CFR 200.1 describe it as the formal announcement that a federal agency has funding available through a financial assistance program. Agencies post most of them on Grants.gov, and some use older names for the same thing.

### Letter of inquiry (LOI)

A short letter that introduces your organization and project and asks whether a funder would like a full proposal. Many private foundations that never post an RFP ask for an LOI first. Keep it brief, follow the foundation's instructions exactly, and only send one after you've checked that the foundation funds work like yours.

### Private foundation

A charity, usually funded by one person, family or company, that gives grants rather than raising money from the public. Private foundations file Form 990-PF with the IRS every year, and that return is public, so you can see a foundation's assets and the grants it paid. See [federal, state, foundation and corporate grants](/resources/federal-state-foundation-corporate-grants) for how they differ from other funders.

### Community foundation

A public charity that pools funds from many donors to support one geographic area, such as a city, county or region. Community foundations often run open grant rounds and are a good first stop for local organizations.

### Prospecting

Finding funders who are likely to support your work before they announce anything, usually by reading their past grants, giving areas and guidelines. Most of a foundation search is prospecting, not answering RFPs.

## Getting registered

### 501(c)(3) determination letter

The letter in which the IRS recognizes your organization as tax exempt under section 501(c)(3). Many funders ask for a copy. See [the documents funders ask for](/resources/documents-funders-ask-for).

### Fiscal sponsor

An established nonprofit that agrees to receive and manage grant funds for a project or group that doesn't have its own tax-exempt status. The sponsor is usually responsible to the funder, so expect a written agreement and a fee.

### SAM.gov

The System for Award Management, the federal government's registry of organizations that do business with it. You must be registered before you apply for most federal grants, and the registration must be renewed every 365 days. Registration and renewal are free. See [SAM.gov, the UEI and Grants.gov](/resources/sam-gov-uei-grants-gov-registration).

### Unique Entity ID (UEI)

The 12-character ID that SAM.gov assigns to your organization. It replaced the DUNS number and goes on every federal application. Organizations that only receive federal money through a state or another organization (a subaward) still need a UEI.

### Authorized Organization Representative (AOR)

The Grants.gov role that lets a person submit applications on your organization's behalf. Your E-Business Point of Contact assigns it. Without it, nobody at your organization can press submit.

## Writing the application

### Need statement

The section that explains the problem your project addresses in the community you serve, backed by real, local and recent data. See [how to write a need statement funders trust](/resources/need-statement-funders-trust).

### Logic model

A one-page picture of how your program is meant to work: the resources you put in, the activities you run, what those activities produce and the changes you expect as a result. Funders use it to check that your plan and your measures fit together.

### Outputs and outcomes

Outputs count what you did: classes held, people enrolled, meals served. Outcomes describe what changed for people because of it: jobs gained, credentials earned, scores improved. Funders increasingly ask for both, and for how you'll measure the outcomes.

### Budget justification

Also called a budget narrative. It explains each line of your budget: what the cost is, how you calculated it and why the project needs it. Reviewers compare it line by line with your budget table, so the numbers must match.

### Indirect costs

Costs that support the whole organization rather than one project, such as rent, accounting or insurance. 2 CFR 200.1 defines them as costs incurred for a common or joint purpose that can't be readily assigned to one project. Federal awards let you recover them through a negotiated rate or, if you don't have one, a de minimis rate set in the federal rules. Foundations set their own limits.

### Cost sharing or matching

The part of a project's costs that the grant doesn't pay for. 2 CFR 200.1 defines it as the portion of project costs not paid by federal funds, unless a statute says otherwise. A match can be cash or in-kind, such as donated space or volunteer time, but only if the funder allows it and you can document it.

## After the award

### Period of performance

The time between the start and the planned end of an award, as written in the award. You can generally only charge costs to the grant for work done in this period.

### Progress and financial reports

The reports a funder requires while the grant runs: what you did, what changed, and how you spent the money. Federal awards set due dates by rule. See [grant reporting and follow-ups](/resources/grant-reporting-and-follow-ups).

### Closeout

The steps that end an award. For federal grants, final reports are generally due no later than 120 calendar days after the period of performance ends, and records must generally be kept for three years after the final financial report.

### Single Audit

An audit required under 2 CFR part 200 for a year in which an organization spends $1,000,000 or more in federal awards. The threshold has changed before, so check the current rule.

## How Grant Autopilot uses these terms

Grant Autopilot keeps a fact base of your organization's own records and only lets a draft state what those records support. When a funder asks for something your records don't cover, such as a match commitment or an outcome you haven't measured, the draft flags the gap instead of guessing. See [how we keep AI drafts honest](/resources/how-we-keep-ai-drafts-honest).`;

export const grantGlossary: ResourceArticle = {
  slug: "grant-terms-glossary",
  kind: "glossary",
  title: "Grant terms glossary: RFP, NOFO, LOI, UEI and more",
  description:
    "Plain-language definitions of the grant terms small nonprofits meet most, from RFPs, NOFOs and letters of inquiry to indirect costs, matching and closeout.",
  updated: "2026-11-24",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title: "2 CFR 200.1: Definitions (federal grant rules)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.1",
    },
    {
      title: "2 CFR 200.344: Closeout",
      url: "https://www.law.cornell.edu/cfr/text/2/200.344",
    },
    {
      title: "2 CFR 200.334: Record retention requirements",
      url: "https://www.law.cornell.edu/cfr/text/2/200.334",
    },
    {
      title: "2 CFR 200.501: Audit requirements",
      url: "https://www.law.cornell.edu/cfr/text/2/200.501",
    },
    {
      title: "SAM.gov: Entity registration",
      url: "https://sam.gov/content/entity-registration",
    },
    {
      title: "IRS: About Form 990-PF",
      url: "https://www.irs.gov/forms-pubs/about-form-990-pf",
    },
    {
      title: "Candid: Glossary of nonprofit terms",
      url: "https://candid.org/resources/glossary-nonprofit-terms/",
    },
  ],
  related: [
    "sam-gov-uei-grants-gov-registration",
    "federal-state-foundation-corporate-grants",
    "need-statement-funders-trust",
  ],
};
