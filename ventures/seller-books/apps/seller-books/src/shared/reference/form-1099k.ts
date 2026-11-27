// Form 1099-K reporting thresholds: federal and state notes, each with its source and how it was checked.
//
// A reporting threshold only decides whether a platform files a 1099-K. It never changes whether income is
// taxable: sales profit is reportable whether or not a form arrives. Shown as reference notes, not advice.
//
// How these were checked (2026-11-24): the build environment could not open irs.gov or state sites, so each
// entry was checked against search-engine excerpts of the official page named in `url`. `status` says how
// strong that is. Re-open each link before relying on it; docs/RESEARCH-2026-11-24.md has the full notes.

export type SourceStatus =
  /** Excerpt of the official page itself states the rule. */
  | "official-excerpt"
  /** The official page states a general 1099 filing rule; applying it to 1099-K is an inference. */
  | "general-1099-rule"
  /** Only secondary sources; shown so the seller knows to check. */
  | "unverified";

export interface ThresholdNote {
  jurisdiction: string;
  code: string;
  rule: string;
  years: string;
  url: string;
  quote: string;
  status: SourceStatus;
  checkedOn: string;
  caveat?: string;
}

export const FEDERAL_1099K: ThresholdNote = {
  jurisdiction: "Federal (IRS)",
  code: "US",
  rule: "Over $20,000 in gross payments AND over 200 transactions in the calendar year.",
  years:
    "All years from 2022 on: the One Big Beautiful Bill Act restored this threshold retroactively, so the $600 / $2,500 / $5,000 phase-in no longer applies.",
  url: "https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000",
  quote:
    "The OBBB retroactively reinstated the reporting threshold in effect prior to the passage of the American Rescue Plan Act of 2021 (ARPA)",
  status: "official-excerpt",
  checkedOn: "2026-11-24",
  caveat:
    "Getting or not getting a 1099-K does not change what is taxable: report your actual business income either way.",
};

export const STATE_1099K: ThresholdNote[] = [
  {
    jurisdiction: "Massachusetts",
    code: "MA",
    rule: "$600 or more in a calendar year, regardless of the number of transactions (payees with an MA address).",
    years: "Tax year 2018 on; the Department says it stays at $600 after the federal change.",
    url: "https://www.mass.gov/regulations/830-CMR-62c81-massachusetts-reporting-requirements-for-third-party-settlement-organizations",
    quote: "equal or exceed $600 in a calendar year, regardless of the number of transactions",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
  },
  {
    jurisdiction: "Vermont",
    code: "VT",
    rule: "$2,000 or more paid to an individual.",
    years:
      "Current Department of Taxes guidance (it was $600 from tax year 2017); the year the change took effect was not confirmed.",
    url: "https://tax.vermont.gov/business-and-corp/withholding-tax/1099-k",
    quote:
      "if a third-party payment processor, gig work platform, or marketplace pays an individual $2,000 or more, they will issue a 1099-K",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
    caveat:
      "Many third-party tables still show $600 for Vermont; the state's own page says $2,000.",
  },
  {
    jurisdiction: "Virginia",
    code: "VA",
    rule: "The IRC §6041(a) (Form 1099-MISC/NEC) threshold, published by the state as $600.",
    years: "Payments on or after 2020-01-01.",
    url: "https://www.tax.virginia.gov/laws-rules-decisions/tax-bulletins/20-10",
    quote: "using the thresholds imposed for purposes of Form 1099-MISC under IRC § 6041(a)",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
    caveat:
      "The federal §6041(a) threshold rises to $2,000 for payments after 2025, so Virginia's figure may follow; the state had not published a new figure when checked.",
  },
  {
    jurisdiction: "Maryland",
    code: "MD",
    rule: "Meets or exceeds the IRC §6041(a) threshold ($600 when enacted).",
    years: "From 2020 (SB 192).",
    url: "https://mgaleg.maryland.gov/2026RS/Statute_Web/gtg/10-825.pdf",
    quote:
      "if the amount of reportable payment transactions meets or exceeds the filing threshold under § 6041(a)",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
    caveat:
      "Tied to §6041(a), which is $2,000 for payments after 2025; no new state figure was found.",
  },
  {
    jurisdiction: "Illinois",
    code: "IL",
    rule: "Over $1,000 in total AND 4 or more separate transactions (payees with an IL address).",
    years: "Current (Publication 110).",
    url: "https://tax.illinois.gov/research/publications/pubs/filing-and-storage-requirements-for-employers-and-payers.html",
    quote:
      "the payee has four or more separate transactions, and the cumulative total exceeds $1,000",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
  },
  {
    jurisdiction: "North Carolina",
    code: "NC",
    rule: "No separate threshold: platforms file NC a copy of every 1099-K they file with the IRS.",
    years: "Since Session Law 2017-204.",
    url: "https://www.ncdor.gov/taxes-forms/information-tax-professionals/tax-bulletins-directives-and-other-important-notices/important-notices-and-frequently-asked-questions-personal-taxes/important-notice-important-information-payment-settlement-entities",
    quote: "submit a duplicate of all information filed with the Internal Revenue Service",
    status: "official-excerpt",
    checkedOn: "2026-11-24",
    caveat: "Lists that show North Carolina at $600 are not supported by the state's notice.",
  },
  {
    jurisdiction: "Rhode Island",
    code: "RI",
    rule: "Over $100 for all Forms 1099 (tax year 2025); the law aligns with the federal thresholds from 2027.",
    years: "Tax years 2025–2026 at $100; federal thresholds from 2027-01-01.",
    url: "https://tax.ri.gov/sites/g/files/xkgbur541/files/2026-02/ADV_2026_05_Advisory_1099Updates.pdf",
    quote:
      "Beginning with Tax Year 2025, the issuer is required to file Form 1099 with the Division if income greater than $100 is reported",
    status: "general-1099-rule",
    checkedOn: "2026-11-24",
  },
  {
    jurisdiction: "New Jersey",
    code: "NJ",
    rule: "$1,000 or more (New Jersey's general Form 1099 filing rule).",
    years: "Long-standing general rule.",
    url: "https://nj.gov/treasury/taxation/pdf/other_forms/git-er/05njwt1099.pdf",
    quote: "when the amount paid or credited is $1,000 or more",
    status: "general-1099-rule",
    checkedOn: "2026-11-24",
    caveat: "No New Jersey page specific to 1099-K / payment platforms was found.",
  },
  {
    jurisdiction: "Arkansas",
    code: "AR",
    rule: "$2,500 or more for Forms 1099 other than DIV/INT when no Arkansas tax was withheld.",
    years: "2023–2025 filing specifications.",
    url: "https://www.dfa.arkansas.gov/wp-content/uploads/2025_Mag_Media.pdf",
    quote: "$2500.00 for all other 1099 types",
    status: "general-1099-rule",
    checkedOn: "2026-11-24",
  },
  {
    jurisdiction: "District of Columbia",
    code: "DC",
    rule: "$600 or more (DC's general Form 1099 rule; 1099-K is an accepted form).",
    years: "Tax years 2021–2025 instructions.",
    url: "https://otr.cfo.dc.gov/sites/default/files/dc/sites/otr/publication/attachments/2025%20MyTax%201099_W2G%20instructions%20v1.0_Final.pdf",
    quote: "filing is required if income of $600 or more is reported",
    status: "general-1099-rule",
    checkedOn: "2026-11-24",
  },
  {
    jurisdiction: "Missouri",
    code: "MO",
    rule: "$1,200 or more of Missouri-source payments when a federal 1099 is filed (general rule).",
    years: "Current filing guidelines.",
    url: "https://dor.mo.gov/taxation/business/tax-types/withholding/documents/Missouri1099FilingGuidelines.pdf",
    quote: "The payments were made from a Missouri source of $1,200.00 or more.",
    status: "general-1099-rule",
    checkedOn: "2026-11-24",
    caveat: "Missouri's guidance does not mention Form 1099-K specifically.",
  },
];

/** States sometimes listed elsewhere that are left out because no official source could be found. */
export const OMITTED_STATES = [
  {
    code: "MT",
    reason: "Shown at $600 by secondary lists only; no Montana Department of Revenue source found.",
  },
];
