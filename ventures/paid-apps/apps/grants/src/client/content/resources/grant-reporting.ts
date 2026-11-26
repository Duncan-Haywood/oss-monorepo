import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `Winning a grant is the start of a relationship, not the end of an application. What you do after the award, how you report, how you handle changes and how you stay in touch, shapes whether the funder renews your grant and what it tells other funders about you.

This guide covers the basics for both government and private funders.

## Start with the award agreement

Before you spend the first dollar, read the award letter or grant agreement closely, ideally with whoever manages your finances. Write down:

- **the grant period** (start and end dates);
- **what you promised**: activities, numbers served, outcomes and any matching funds;
- **every report** that's due, what it must contain and how to submit it;
- **what needs approval** before you change anything, such as moving money between budget lines, changing key staff or changing the project's scope;
- **how you'll be paid**: up front, in installments or as reimbursement after you spend;
- **acknowledgment rules**: whether and how to credit the funder publicly;
- **record-keeping requirements**.

If anything is unclear, ask the program officer now. It's much easier than explaining a problem later.

## Build a reporting calendar

A missed report is one of the easiest problems to avoid. Put every due date on a shared calendar with reminders a few weeks ahead, and name the person responsible for each one. Include the internal deadlines too: when program staff need to send numbers, when finance needs to close the books for the period, and who signs off.

## Federal reporting basics

Most federal awards to nonprofits follow the Uniform Guidance in 2 CFR part 200. Your award terms are what count, but the general rules look like this:

- **Performance reports.** The agency sets how often, but no less often than once a year and no more often than quarterly, unless special conditions apply. Quarterly or semiannual reports are generally due within 30 calendar days after the reporting period, and annual reports within 90 days. They compare what you accomplished with the objectives of the award and explain any goals you didn't meet and why.
- **Financial reports.** Agencies also require reports on how award funds have been spent. Your award terms set the form and the schedule.
- **Significant developments.** If something happens between reports that affects the project, such as problems, delays or conditions that will keep you from meeting milestones, the rules say you must tell the agency (or the state, if the money comes through it).
- **Prior approval for changes.** Changes to the project's scope or objectives, changes to key personnel named in the award, or the project director being away for more than three months or cutting their time on the project by 25 percent need the agency's written approval first.
- **Closeout.** Final reports are generally due no later than 120 calendar days after the period of performance ends (90 days for subrecipients reporting to a pass-through entity, unless they agree on an earlier date).
- **Records.** Keep financial records, supporting documents and other records for three years after you submit your final financial report, and longer if there's an audit, litigation or a written request to keep them.

If your money comes from the state or another organization passing on federal funds, they will set your deadlines, often earlier than the federal ones so they can meet their own. Check the current requirements in your agreement and in 2 CFR 200 rather than relying on this summary.

## Foundation and corporate reporting

Private funders set their own requirements. Some want a one-page update; others want detailed narratives and a budget-to-actual report. A good report usually includes:

- **What you did**, compared with what you said you'd do;
- **Results**, with numbers where you have them, and how you know them;
- **What changed or didn't work**, and what you learned;
- **Finances**: how the grant was spent, compared with the approved budget;
- **A story or quote**, with the person's permission, that shows the work in human terms;
- **What's next** for the program.

Corporate funders may also want photos, social media content or details they can share with employees. Only share images and stories of participants who have agreed, and be especially careful with young people and anyone whose safety or privacy could be at risk.

## Be honest, especially when things go wrong

Every program hits obstacles: a key staff member leaves, enrollment is lower than expected, a partner pulls out, costs rise. Funders know this. What damages trust is hearing about it late, or not at all.

- **Tell the funder early.** A short email explaining what happened and what you're doing about it goes a long way.
- **Ask before you change the plan.** If you need to move money between budget lines or change what you'll deliver, ask for approval first. Government awards often require it, and most private funders expect it.
- **Report real numbers.** Don't round up, don't count the same person twice and don't present outputs as outcomes. If a target wasn't met, say so and explain why.
- **Return money you can't use properly.** If you can't spend funds as agreed, talk to the funder about an extension, a change or returning them.

Your reports become part of your record with that funder, and future applications are easier when what you said before was accurate.

## Collect data from day one

Reports are much easier when data collection is part of the program from the start rather than a scramble at the deadline.

- Decide at the outset which numbers you'll report, and how you'll count each one.
- Use simple tools your staff will actually use: sign-in sheets, intake forms, a shared spreadsheet.
- Record consent when you collect stories or photos.
- Save supporting documents, such as receipts, timesheets and invoices, as you go, organized by grant.
- Review the numbers monthly, so surprises show up while there's still time to act.

## Say thank you, and stay in touch

A prompt thank-you after an award, from your director or a board member, is simple and appreciated. Beyond that:

- **Share good news between reports**, such as a milestone, a story or a news article. Keep it short.
- **Invite funders to see the work**, such as a site visit, a graduation or a community event, without pressure.
- **Acknowledge them as they've asked**, in your annual report, on your website or at events, and check before naming them, since some prefer not to be named.
- **Ask for feedback** if a proposal is declined. Some funders will tell you how to make a stronger request next time.

## Plan for renewal

If you hope to apply again, start the conversation well before the grant ends. Ask the program officer about timing and any changes in priorities. Your reports, and the relationship you've built, will be part of the case.

Grant Autopilot tracks follow-ups after you submit: deadline reminders, status checks, report due dates and thank-you notes. You can record whether each application was funded, so your next application starts from an accurate history.`;

export const grantReporting: ResourceArticle = {
  slug: "grant-reporting-and-follow-ups",
  title: "Grant reporting and follow-ups: keeping funders happy after the award",
  description:
    "After the award: reading the agreement, a reporting calendar, federal reporting basics, honest reports, handling changes and staying in touch with funders.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title: "2 CFR 200.329: Monitoring and reporting program performance (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.329",
    },
    {
      title: "2 CFR 200.308: Revision of budget and program plans (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.308",
    },
    {
      title: "2 CFR 200.344: Closeout (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.344",
    },
    {
      title: "2 CFR 200.334: Record retention requirements (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/200.334",
    },
  ],
  related: [
    "federal-state-foundation-corporate-grants",
    "documents-funders-ask-for",
    "how-we-keep-ai-drafts-honest",
  ],
};
