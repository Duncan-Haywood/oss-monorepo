import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `Most funders ask for the same handful of documents. If you gather them once, keep them current and store them in one place, every application after that gets faster. This guide covers what each document is, where to get it and what to watch for.

A simple habit helps: keep one shared "grant-ready" folder. Name each file clearly, with the date or fiscal year in the name, for example "Board list 2026-09" or "Form 990 FY2025". When a funder asks for something, you attach it instead of hunting for it.

## 1. Your IRS determination letter

The determination letter is the IRS letter recognizing your organization as tax-exempt, usually under section 501(c)(3). Funders use it to confirm you can receive charitable grants.

- **Letters issued in 2014 or later** can be downloaded from the IRS Tax Exempt Organization Search (TEOS).
- **Older letters** can be requested from the IRS with Form 4506-B. You can also ask for an *affirmation letter*, which the IRS says serves the same purpose for grantors as a copy of the original.
- **If you're part of a group exemption**, for example a local chapter, ask the central organization that holds the group ruling to confirm your membership.
- **If you use a fiscal sponsor**, funders will usually want the sponsor's letter plus your sponsorship agreement. Ask each funder whether it accepts fiscally sponsored projects.

**Tribal governments are different.** The IRS treats federally recognized tribal governments much like states for many federal tax purposes. They are not 501(c)(3) charities, but they can receive tax-deductible charitable gifts. Tribal nonprofits, such as a separately incorporated tribal community organization, may have their own 501(c)(3) status. If you're a tribal government or tribal entity, ask each funder what documentation it accepts to show eligibility.

While you're on TEOS, check that your organization isn't on the auto-revocation list (see the next section).

## 2. Form 990 (your annual IRS return)

Most tax-exempt organizations file an annual return in the Form 990 series. Which form depends on size. At the time of writing, the IRS says:

- **Form 990-N (e-Postcard)** for organizations whose gross receipts are normally $50,000 or less;
- **Form 990-EZ** for gross receipts under $200,000 and total assets under $500,000;
- **Form 990** above those amounts;
- **Form 990-PF** for private foundations.

Check the current thresholds on the IRS site before you file. Churches and some other organizations aren't required to file, but funders may still ask for financial information.

Two things to know:

- **Your 990 is public.** Exempt organizations must make their recent annual returns and their exemption application available for public inspection, so funders and reviewers can look them up. Make sure your mission description, program descriptions and numbers match what you say in your proposals.
- **Missing three years in a row costs you your exemption.** The IRS says organizations that don't file for three consecutive years automatically lose their tax-exempt status, and getting it back means applying again. If you've fallen behind, deal with it before you apply for grants.

## 3. Budgets: organizational and project

Funders usually want two budgets:

- **The organizational budget** for the current fiscal year: all expected income and expenses for the whole organization. A board-approved budget carries more weight.
- **The project budget** for the work you're asking them to fund: personnel (with the share of each person's time), supplies, travel, contracts, equipment, indirect or administrative costs, and other funding sources, including in-kind contributions such as donated space or volunteer time.

Many funders also want a short **budget narrative** that explains how you arrived at each line. Make sure the numbers add up, that the amount you request matches the amount in your proposal, and that the budget matches the activities you describe. Candid, the nonprofit research organization, calls a budget error "a big red flag" for funders.

## 4. Financial statements and audits

Funders ask for financial statements to see that you manage money responsibly. What they mean varies:

- **Audited financial statements**, prepared by an independent CPA, give the most assurance and are often required for larger grants.
- **Reviewed or compiled statements** are lighter, cheaper services that some funders accept.
- **Internal statements**, such as a board-approved statement of financial position and statement of activities, are what many small organizations have.

If you don't have an audit, say so plainly and offer what you do have, along with your most recent Form 990. Many funders, especially for smaller grants, accept this. Don't describe statements as audited unless they are.

**For federal funding**, the rules in 2 CFR part 200 require a Single Audit (or program-specific audit) for a year in which an organization spends $1,000,000 or more in federal awards. The threshold has changed over time, so check the current figure in 2 CFR 200.501. Some states also require audited or reviewed statements from charities above certain revenue levels, so check with your state's charity regulator.

## 5. Board list

A board list shows who governs your organization. Include each member's name, board role (chair, treasurer and so on), professional or community affiliation, and term dates. Some funders ask about board demographics or about how many members give financially. Answer honestly, and only share personal details your board members have agreed to share.

Keep the list current. A board list with people who left two years ago suggests weak governance, even when the real cause is just an old file.

## 6. Program descriptions

Write a one-page description of each program and keep it up to date. Each should cover:

- who the program serves and where;
- what you actually do, and how often;
- staff and partners involved;
- how long it has run;
- how you know it works (see the next section).

You'll adapt these for each funder, but starting from a clear, accurate base saves hours and keeps your story consistent across applications.

## 7. Outcomes data

Many funders ask for evidence of results. It helps to separate:

- **Outputs**: what you did, such as the number of workshops held or meals served;
- **Outcomes**: what changed for the people you served, such as credentials earned, jobs kept or housing secured.

For every number, write down where it comes from (intake forms, attendance sheets, follow-up surveys), the time period it covers and who counted it. If you don't track an outcome yet, say so, and describe how you'll measure it during the grant. Funders generally respect an honest "we're building this" more than a figure nobody can back up.

## 8. Letters of support and commitment

A **letter of support** shows that partners or community members back your project. A **letter of commitment** goes further and states what a partner will actually provide, such as space, staff time, referrals or matching funds. Some funders, including many federal programs, treat these differently, so read the instructions closely.

- Ask early. Partners are busy, and letters often need a signature from someone senior. Give them several weeks if you can.
- Make it easy. Send the deadline, a short project summary and the points that matter to this funder. Let them write in their own words. Funders notice when ten letters read the same.
- Make sure commitments are real. Only list resources the partner has actually agreed to provide.

## Other documents to keep on hand

Funders sometimes ask for your W-9, an organizational chart, résumés or bios of key staff, a strategic plan, your annual report and key policies. Form 990 itself asks whether you have certain policies, such as a conflict of interest policy, so it's worth having them adopted and filed.

## Keep it current

Put a recurring reminder on your calendar, for example each quarter and after each fiscal year closes, to refresh your board list, budget, financial statements, program descriptions and outcomes. When requirements are specific to one funder, check the current requirements in that funder's guidelines rather than relying on last year's checklist.

Grant Autopilot can help here: you upload these documents once, and the facts in them, each with the exact quote it came from, become suggestions your team confirms before any application uses them.`;

export const documentsFundersAskFor: ResourceArticle = {
  slug: "documents-funders-ask-for",
  title: "The documents funders ask for (and how to get them ready)",
  description:
    "Determination letter, Form 990, budgets, audits, board list, program descriptions, outcomes and letters of support: what funders want and how to prepare them.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title: "IRS: Obtaining copies of exemption determination letters",
      url: "https://www.irs.gov/charities-non-profits/eo-operational-requirements-obtaining-copies-of-exemption-determination-letter-from-irs",
    },
    {
      title: "IRS: Form 990 series, which forms do exempt organizations file",
      url: "https://www.irs.gov/charities-non-profits/form-990-series-which-forms-do-exempt-organizations-file-filing-phase-in",
    },
    {
      title: "IRS: Documents subject to public disclosure",
      url: "https://www.irs.gov/charities-non-profits/public-disclosure-and-availability-of-exempt-organizations-returns-and-applications-documents-subject-to-public-disclosure",
    },
    {
      title: "IRS: Automatic revocation of exemption",
      url: "https://www.irs.gov/charities-non-profits/automatic-revocation-of-exemption",
    },
    {
      title: "IRS: FAQs for Indian tribal governments on IRC section 7871",
      url: "https://www.irs.gov/government-entities/indian-tribal-governments/faqs-for-indian-tribal-governments-regarding-irc-section-7871-tribes-treated-like-states-for-federal-tax-purposes",
    },
    {
      title: "2 CFR 200.501: Audit requirements (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.501",
    },
    {
      title: "Candid: Four common grant proposal documents",
      url: "https://candid.org/blogs/four-common-examples-grant-proposal-documents-free-samples-included/",
    },
  ],
  related: [
    "sam-gov-uei-grants-gov-registration",
    "need-statement-funders-trust",
    "federal-state-foundation-corporate-grants",
  ],
};
