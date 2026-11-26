import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `"Grants" covers very different kinds of money. A federal award, a state contract, a family foundation grant and a corporate sponsorship each come with their own process, expectations and paperwork. Knowing the difference helps a small team decide where to spend its limited time.

## At a glance

| What to expect | Federal | State and local | Foundation | Corporate |
| --- | --- | --- | --- | --- |
| Where to find them | Grants.gov and agency websites | State agency sites and state grant portals | Funder websites, Candid and the funder's Form 990-PF | Company websites and local branches |
| How you apply | Formal application to a published notice | Formal application, often modeled on federal rules | Often a letter of inquiry first, then a proposal | Online form, letter or invitation |
| Registration | SAM.gov and a UEI | Varies; a UEI if federal money passes through | Usually none beyond your nonprofit status | Usually none beyond your nonprofit status |
| Rules after the award | Detailed federal rules (2 CFR 200) | State rules, plus federal rules for passed-through money | Set by the grant agreement | Set by the agreement, often light |
| Relationships | Formal; questions go to the listed contact | Formal, with program staff | Often central | Often local and personal |

These are generalizations. Always read the specific opportunity: the details vary a lot.

## Federal grants

Federal agencies publish funding opportunities, usually called a notice of funding opportunity (NOFO), and most are listed on Grants.gov. Federal grants can be large and multi-year, but they're also the most demanding.

**How to approach them:**

- **Register early.** You'll need an active SAM.gov registration and a UEI before you apply, and you must keep the registration active for the life of the award. See our guide to [SAM.gov, UEI and Grants.gov registration](/resources/sam-gov-uei-grants-gov-registration).
- **Read the whole notice.** Federal notices spell out eligibility, required sections, page limits, scoring criteria and required forms. Reviewers typically score against those criteria, so organize your application around them.
- **Use the listed contact.** Most notices name an agency contact for questions, and some hold informational webinars or publish answers to common questions. Ask before the deadline. During a competition, agency staff generally can't help you write your application or tell you how it will score.
- **Understand the rules that come with the money.** Most federal awards to nonprofits follow the Uniform Guidance in 2 CFR part 200, which covers allowable costs, financial management, procurement, reporting and audits. If you'll spend $1,000,000 or more in federal awards in a year, you'll generally need a Single Audit (check the current threshold in 2 CFR 200.501).

Federal grants can be a good fit when the program matches your work closely and you have, or can build, the financial systems to manage them. Smaller federal programs, and federal money passed through your state, can be an easier way in.

## State and local grants

State agencies, counties and cities fund many of the same areas as federal agencies: health, housing, workforce development, public safety, education. Much of that money is federal funding that a state agency passes on to local organizations. Under the federal rules, the state is then the *pass-through entity* and your organization is a *subrecipient*.

**How to approach them:**

- **Find your state's grant portal.** Many states list opportunities in one place, while others leave it to each agency. Sign up for notices from the agencies that fund your field.
- **Ask where the money comes from.** If it's federal money, many federal rules apply to you through the state, and you'll need a UEI even though a full SAM.gov registration isn't required for a subaward.
- **Expect state-specific requirements.** States may require their own vendor or grantee registration, insurance, background checks or specific budget forms. Check the current requirements with the agency that's offering the funding.
- **Build relationships with program staff.** State program officers are often closer to the ground than federal ones and may welcome a call about whether your project fits, outside of a formal competition.

## Foundation grants

Foundations include private foundations (often funded by one family or person), community foundations that make grants in a specific region, and company-sponsored foundations. They have more freedom than government funders to set their own priorities and process.

**How to approach them:**

- **Research before you write.** Read the foundation's guidelines and its list of past grants. Private foundations file Form 990-PF, a public IRS return that reports their charitable distributions, so you can often see who they've funded and for how much. Candid's database is another common research tool.
- **Respect "invitation only."** Many foundations don't accept unsolicited proposals. If the guidelines say so, look for another way in, such as a community event, a mutual contact or an open call.
- **Start with a letter of inquiry when asked.** A letter of inquiry (LOI) is a short letter, usually a few pages, that summarizes your organization, the need, your project and your request. Some foundations use it to decide whom to invite to submit a full proposal; others treat it as the whole application. Follow their format exactly.
- **Invest in the relationship.** Foundation program officers often want to understand your work before they recommend a grant. If they offer a call or a site visit, take it. Be honest about what you do well and what you're still figuring out.
- **Ask about general operating support.** Some foundations fund an organization's overall work rather than a single project. For small organizations, flexible money can be the most valuable kind.

Community foundations are often the best first stop for small, local organizations: they focus on a specific area and often know its nonprofits well.

## Corporate grants and giving

Companies give in two main ways. A **company-sponsored foundation** is a separate private foundation funded by the business and follows foundation rules, including filing a public 990-PF. A **corporate giving program** is run inside the company itself. It isn't a separate legal entity, so it doesn't have to publish what it funds, and its budget often rises and falls with company profits.

**How to approach them:**

- **Think local.** Many companies focus their giving where they have employees, customers or operations. A regional bank, utility, hospital system or manufacturer near you is often a better prospect than a national brand.
- **Look for the connection.** Corporate funders often care about their employees and communities, and many value volunteer opportunities. If your board members or volunteers work there, ask whether the company matches employee gifts or volunteer hours.
- **Consider in-kind support.** Companies may donate equipment, supplies, space or professional services instead of, or as well as, cash.
- **Know the difference between a grant and a sponsorship.** Sponsorships, such as an event sponsorship, usually come from a marketing budget and expect public recognition. Grants come from a giving budget and expect results. Be clear about which you're asking for.

## Reporting differs too

What you owe after an award varies as much as the application:

- **Federal awards** usually require regular financial and performance reports, prior approval for certain changes and a final report after the project ends. Records must generally be kept for three years after your final financial report.
- **State awards** follow the state's agreement, plus federal rules if the money is federal.
- **Foundations** set their own reporting, from a short narrative and budget update to detailed outcome reports. If the requirements seem heavy for a small grant, it's reasonable to ask whether a shorter report or a call would work.
- **Corporate funders** often want a short report, photos or stories they can share, and recognition. Get permission from anyone pictured or quoted.

Read the agreement before you sign, and put every due date on a calendar. Our guide to [grant reporting and follow-ups](/resources/grant-reporting-and-follow-ups) covers this in detail.

## Choosing where to start

For a small team, a sensible mix is often a few local foundation and corporate relationships for steady, flexible support, plus carefully chosen state or federal opportunities that fit your programs closely. Whatever the source, the work underneath is the same: clear, accurate facts about your organization, a well-documented need and a realistic plan.`;

export const funderTypes: ResourceArticle = {
  slug: "federal-state-foundation-corporate-grants",
  title: "Federal, state, foundation and corporate grants: what's different",
  description:
    "How federal, state, foundation and corporate funders differ: finding them, applying, letters of inquiry, building relationships and what reporting to expect.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title:
        "2 CFR 200.1: Definitions, including pass-through entity and subrecipient (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.1",
    },
    {
      title: "2 CFR 25.200 and 25.300: SAM.gov registration and UEI requirements (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/25.200",
    },
    {
      title: "2 CFR 200.501: Audit requirements (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.501",
    },
    {
      title: "2 CFR 200.334: Record retention requirements (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.334",
    },
    {
      title: "IRS: About Form 990-PF",
      url: "https://www.irs.gov/forms-pubs/about-form-990-pf",
    },
    {
      title: "Candid: Glossary of nonprofit terms",
      url: "https://candid.org/resources/glossary-nonprofit-terms/",
    },
    {
      title: "Candid: Four common grant proposal documents",
      url: "https://candid.org/blogs/four-common-examples-grant-proposal-documents-free-samples-included/",
    },
  ],
  related: [
    "sam-gov-uei-grants-gov-registration",
    "grant-reporting-and-follow-ups",
    "documents-funders-ask-for",
  ],
};
