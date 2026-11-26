import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `If you want to apply for a federal grant, three names come up right away: SAM.gov, the UEI and Grants.gov. They're connected, they take time to set up, and an unfinished registration is one of the easiest ways to miss a federal deadline. This guide explains what each one is, the order to do them in and how to keep them active.

**The short version:** register in SAM.gov (which gives you a UEI), then set up your organization in Grants.gov, then make sure the people who will submit have the right role. Start well before any deadline, and never pay anyone to do it for you.

## What each one is

**SAM.gov** (the System for Award Management) is the U.S. government's official registry of organizations that do business with it. It's run by the General Services Administration (GSA). The GSA's guide for grant applicants says a SAM.gov registration is required to apply for and receive payment for federal grants and other financial assistance.

**The UEI** (Unique Entity ID) is a 12-character ID that SAM.gov assigns to your organization. It's the official identifier for your organization across federal systems, and you'll put it on every federal application. It replaced the older DUNS number. You can get a UEI without completing a full registration, but SAM.gov is clear that a UEI alone doesn't let you apply directly for federal awards.

**Grants.gov** is the website where you find and apply for most federal grant opportunities. Your Grants.gov organization profile is built from your SAM.gov registration, so SAM.gov comes first.

## Why federal grants need them

Federal rules (2 CFR 25.200) say an applicant must be registered in SAM.gov *before* submitting an application, must include its UEI in each application, and must keep its registration active the whole time it has an application under consideration or an active award. If your registration lapses, you can lose the ability to apply or be paid.

**Not every grant needs this.** The GSA notes that registration isn't required if your grant isn't federally funded. Most foundation and corporate grants don't ask for it. But if you receive federal money passed through a state agency or another organization (a *subaward*), the federal rules say you must at least have a UEI. You don't need a full SAM.gov registration for that, but you do need the ID.

## It's free. Don't pay for it.

The GSA says it plainly: **SAM.gov is free to use. There is no charge to get a Unique Entity ID, register your entity or maintain your registration.**

Even so, some private companies contact organizations offering to register or renew for a fee, and the GSA warns about imposters and phishing messages made to look official. The GSA's advice:

- Real SAM.gov emails come from a **.gov** address. If it doesn't end in .gov, it's not from the government.
- SAM.gov won't ask for your personal information anywhere except inside SAM.gov itself.
- You don't need a third party to register. If you get stuck, the Federal Service Desk (FSD.gov), the government's free help desk for SAM.gov, can help.

If you get a suspicious message, don't click its links. Go to SAM.gov directly by typing the address.

## Step 1: Register in SAM.gov

Before you start, gather:

- your organization's **legal business name** and **physical address**, exactly as the IRS has them (a P.O. box can't be your physical address);
- your **EIN** (taxpayer identification number), your start date and the date your fiscal year ends;
- your **bank account and routing numbers** for electronic payments;
- names and contact details for your **points of contact**: the Electronic Business (E-Business) contact, the Government Business contact and the Accounts Receivable contact.

Then:

1. **Sign in through Login.gov.** SAM.gov uses Login.gov for usernames and passwords, so create a Login.gov account if you don't have one.
2. **Choose a "Financial Assistance Awards Only" registration** if you only plan to apply for grants and other assistance, not contracts. It has fewer sections.
3. **Validate your organization.** SAM.gov checks your name and address to confirm your organization exists and isn't already registered. If it can't match you, you'll be asked to upload documents proving your legal name, address, start year and state of incorporation. Enter details exactly as they appear in your IRS and incorporation records; anything that doesn't match has to be sorted out before you can continue.
4. **Get your UEI**, then complete the remaining sections: core data, representations and certifications, and points of contact.
5. **Submit**, and look for the "Registration Submitted" confirmation. If you don't see it, it hasn't been submitted.

**Assign a second Entity Administrator.** The person who registers becomes the Entity Administrator. The GSA recommends giving the same role to at least one other person. Otherwise, if that person leaves, you'll need to send a notarized letter to the Federal Service Desk to replace them, which can delay renewal.

## Step 2: Set up Grants.gov

Once SAM.gov is active:

1. Your **E-Business Point of Contact** (named in SAM.gov) creates a Grants.gov account with the same email address listed for that role in SAM.gov, and adds an organization applicant profile with your UEI.
2. Everyone who will prepare or submit applications creates their own Grants.gov account and adds a profile with your organization's UEI.
3. The E-Business Point of Contact gives the people who will submit applications the **Authorized Organization Representative (AOR)** role. Only someone with that role can submit on your behalf.

NIH's guidance says this part can take a business day or more, depending on how quickly your E-Business Point of Contact responds. Check the current steps at [Grants.gov applicant registration](https://www.grants.gov/applicants/applicant-registration), since screens and role names change from time to time.

## How long it takes

Official estimates vary, so plan for the longer end:

- The GSA says to allow **at least ten business days** after you submit for a SAM.gov registration to become active.
- NIH tells applicants to allow **three weeks or more** for initial SAM.gov registration, and that the whole process, including Grants.gov, can take **six weeks or more**.
- Validation problems, a mismatch with IRS records or a missing document can add time.

If a deadline is less than six weeks away and you haven't started, start today, and read the funding notice for anything it says about registration. Don't count on an exception for late registrations.

## Renewal: every 365 days

A SAM.gov registration must be **renewed every 365 days** to stay active. The GSA recommends starting your renewal 45 to 60 days before it expires. NIH suggests allowing two weeks for renewal.

- Put the expiration date on a shared calendar with reminders at 60 and 30 days.
- Renewal is also free. Ignore any message that asks you to pay to renew.
- When staff change, update your points of contact and Grants.gov roles right away. A lapsed registration or a departed AOR is a common last-minute surprise.

## A quick checklist

- Legal name and address match your IRS records
- A Login.gov account for the person registering
- SAM.gov registration active, with a UEI
- At least two Entity Administrators in SAM.gov
- Grants.gov organization profile created by the E-Business Point of Contact
- AOR role assigned to everyone who will submit
- Renewal date on a shared calendar

Grant Autopilot keeps your UEI on your organization profile. It doesn't submit to Grants.gov directly: for Grants.gov opportunities it prepares the application package and a step-by-step guide, and your AOR submits it.`;

export const samUeiGrantsGov: ResourceArticle = {
  slug: "sam-gov-uei-grants-gov-registration",
  title: "SAM.gov, UEI and Grants.gov registration explained",
  description:
    "What SAM.gov, the UEI and Grants.gov are, why federal grants need them, how long registration takes, how to renew, and why you should never pay to register.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title: "GSA: Quick Start Guide for Financial Assistance Registrations (FSD.gov)",
      url: "https://www.fsd.gov/sys_attachment.do?sys_id=48eec29b1bd7fa501b7ea828624bcb68",
    },
    {
      title: "SAM.gov: Entity registration",
      url: "https://sam.gov/content/entity-registration",
    },
    {
      title: "SAM.gov: Entity Registration Checklist",
      url: "https://sam.gov/sites/default/files/2024-11/entity-checklist.pdf",
    },
    {
      title: "GSA: Don't take the bait. Beware of misleading marketing, imposters and phishing",
      url: "https://content.govdelivery.com/accounts/USGSA/bulletins/358af1f",
    },
    {
      title: "NIH: Organization registrations (SAM.gov, UEI, Grants.gov)",
      url: "https://grants.nih.gov/grants/how-to-apply-application-guide/prepare-to-apply-and-register/registration/org-representative-registration.htm",
    },
    {
      title: "2 CFR 25.200: Requirements for programs and applicants (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/25.200",
    },
    {
      title: "2 CFR 25.300: Requirement for subrecipients to have a UEI (Cornell LII)",
      url: "https://www.law.cornell.edu/cfr/text/2/25.300",
    },
  ],
  related: [
    "documents-funders-ask-for",
    "federal-state-foundation-corporate-grants",
    "grant-reporting-and-follow-ups",
  ],
};
