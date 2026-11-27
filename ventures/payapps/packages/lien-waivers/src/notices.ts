import { CA_CHECKED_ON, CA_SOURCE_URL } from "./ca.ts";
import { flNoticeToOwner } from "./fl-notice.ts";
import { fillBlocks } from "./render.ts";
import { normalizeState } from "./states.ts";
import { txLaborNotice, txRetainageNotice } from "./tx-notice.ts";
import type {
  Block,
  BlockTemplate,
  Citation,
  FieldSpec,
  ValidationError,
  WaiverData,
} from "./types.ts";
import { validate } from "./validate.ts";
import { WY_BODIES, WY_CHECKED_ON, WY_SOURCE_URL } from "./wy.ts";

/**
 * Preliminary notices of the right to a lien: the notice a subcontractor or supplier sends the
 * property's owner early in a job, where a state's statute prescribes its wording. Like the waivers,
 * wording comes only from the statute, copied verbatim and checked against a snapshot of the
 * official text; a state with no encoded notice gets none (never wording this package made up).
 *
 * Today: California, Cal. Civ. Code §§ 8102 and 8202 (private works); Florida's Notice to Owner,
 * Fla. Stat. § 713.06(2)(c) (fl-notice.ts); Texas' notices of claim for unpaid labor or materials
 * and for unpaid retainage, Tex. Prop. Code §§ 53.056 and 53.057 (tx-notice.ts); and Wyoming, Wyo. Stat.
 * § 29-10-101(a), whose form "shall be sent to the record owner of the
 * property against which the lien may be filed and shall be completed in substantially the
 * following form". When it must be sent is set by § 29-2-112, which is not encoded here: this
 * package states no deadline, only the form's own words ("sent within the time periods specified in
 * W.S. 29-2-112").
 */

export interface NoticeForm {
  /** Stable id, e.g. "WY/preliminary-notice/statutory". */
  id: string;
  /** Two-letter state code. */
  state: string;
  title: string;
  citation: Citation;
  /** Who the statute says the notice goes to, in its words. */
  sendTo: string;
  fields: readonly FieldSpec[];
  /** Verbatim body; `{{field}}` placeholders. */
  body: readonly BlockTemplate[];
  /**
   * Statutory text the notice says comes with it, printed after the notice on its own page with
   * its blanks left as rules. Wyoming's notice says "A form of lien waiver is attached to this
   * notice": the § 29-10-101(b) waiver form.
   */
  attachment: { title: string; body: readonly BlockTemplate[] } | null;
  /**
   * Optional fields whose heading and value are left off the notice when blank, for items the
   * statute asks for only "if any" (California's construction lender, the claimant's demand, unpaid
   * laborers). The body must hold each as a heading followed by a paragraph that is exactly
   * `{{key}}`. Other blank fields print a rule to fill by hand.
   */
  omitIfBlank?: readonly string[];
  /** Smallest type the statute allows (Georgia: "at least 12 point font"); the printer honours it. */
  minFontPt?: number;
  /** Checks across fields after each field passes (Georgia's unpaid amount within the waiver's). */
  crossCheck?: (data: WaiverData) => ValidationError[];
  notes: readonly string[];
}

export interface NoticeDocument {
  formId: string;
  state: string;
  title: string;
  citation: string;
  sendTo: string;
  disclaimers: readonly string[];
  values: Readonly<Record<string, string>>;
  blocks: readonly Block[];
  /** The attachment's blocks, all blanks left as printed rules, or null. */
  attachment: { title: string; blocks: readonly Block[] } | null;
  /** Smallest type the statute allows, when it sets one. */
  minFontPt?: number;
}

export type NoticeRenderResult =
  | { ok: true; document: NoticeDocument }
  | { ok: false; errors: ValidationError[] };

const f = (
  key: string,
  label: string,
  type: FieldSpec["type"],
  required: boolean,
  help: string,
): FieldSpec => ({ key, label, type, required, help });

const WY_NOTICE_FIELDS: readonly FieldSpec[] = [
  f(
    "claimantContact",
    "Name, address and telephone number of contractor, subcontractor or materialman, and contact person",
    "multiline",
    true,
    "Your company's name, mailing address and phone number, and who to contact.",
  ),
  f(
    "workDescription",
    "Materials provided or work performed",
    "multiline",
    true,
    "What you are providing on this job, e.g. electrical rough-in and finish per subcontract.",
  ),
  f(
    "propertyDescription",
    "Property description",
    "multiline",
    true,
    "The project and property, e.g. the building and the job's name.",
  ),
  f("propertyAddress", "Address", "multiline", true, "The property's street address."),
  f(
    "legalDescription",
    "Legal description",
    "multiline",
    false,
    "As on the deed or the county's property record (lot, block, subdivision). Left blank, the notice prints a line to fill in by hand.",
  ),
  f("signedDate", "Date", "date", true, "The date you sign and send the notice."),
];

const WY_NOTE =
  "Note to Lien Claimant: This form, if filled out correctly and sent within the time periods specified in W.S. 29-2-112, constitutes prima facie evidence that you have provided the content of the notice required by W.S. 29-2-112(a)(i). If you have any questions regarding how to fill out this form or whether it has been filled out properly, you should consult an attorney.";

const WY_NOTICE_TEXT =
  'The undersigned party is providing work or materials to the property described below. Failure of payment due and owing to a contractor, subcontractor or materialman for work performed or materials provided to the project located on the property can result in the filing of a lien against the property. To avoid this result, when paying for labor and materials you may ask the contractor, subcontractor or materialman for "lien waivers" from all persons supplying materials or services. Failure to secure lien waivers may result in your paying for labor and materials twice. A form of lien waiver is attached to this notice.';

const WY_NOTICE_BODY: readonly BlockTemplate[] = [
  { type: "notice", text: WY_NOTE },
  { type: "title", text: "NOTICE TO OWNER" },
  { type: "paragraph", text: WY_NOTICE_TEXT },
  {
    type: "heading",
    text: "Name, address and telephone number of contractor, subcontractor or materialman, and contact person:",
  },
  { type: "paragraph", text: "{{claimantContact}}" },
  { type: "heading", text: "MATERIALS PROVIDED OR WORK PERFORMED:" },
  { type: "paragraph", text: "{{workDescription}}" },
  { type: "heading", text: "PROPERTY DESCRIPTION:" },
  { type: "paragraph", text: "{{propertyDescription}}" },
  { type: "heading", text: "ADDRESS:" },
  { type: "paragraph", text: "{{propertyAddress}}" },
  { type: "heading", text: "LEGAL DESCRIPTION:" },
  { type: "paragraph", text: "{{legalDescription}}" },
  { type: "spacer" },
  {
    type: "signature",
    lines: [
      { label: "SIGNED", value: "" },
      { label: "DATE", value: "{{signedDate}}" },
    ],
  },
];

export const WY_NOTICE_ID = "WY/preliminary-notice/statutory";

/** Wyoming's preliminary notice of right to lien, Wyo. Stat. § 29-10-101(a). */
export function wyPreliminaryNotice(): NoticeForm {
  const waiver = WY_BODIES["unconditional-final"];
  if (!waiver) throw new Error("Wyoming waiver body missing");
  return {
    id: WY_NOTICE_ID,
    state: "WY",
    title: "Preliminary notice of right to lien (Notice to Owner)",
    citation: {
      text: "Wyo. Stat. § 29-10-101(a)",
      officialUrl: WY_SOURCE_URL,
      verification: {
        status: "verified",
        checkedOn: WY_CHECKED_ON,
        sourceUrl: WY_SOURCE_URL,
        checkedBy: "sources/wy-29-10-101.txt; test/notices.test.ts",
      },
    },
    sendTo: "the record owner of the property against which the lien may be filed",
    fields: WY_NOTICE_FIELDS,
    body: WY_NOTICE_BODY,
    attachment: { title: "LIEN WAIVER", body: waiver },
    notes: [
      'Wyoming: the preliminary notice of right to a lien "shall be sent to the record owner of the property against which the lien may be filed and shall be completed in substantially the following form" (Wyo. Stat. § 29-10-101(a)).',
      "When it must be sent is set by Wyo. Stat. § 29-2-112, which PayApps does not encode or check. Read it, or ask counsel, for your deadline and how to send the notice, and keep proof of sending.",
      "The notice says a form of lien waiver is attached: the Wyoming lien waiver form (§ 29-10-101(b)) prints blank on the next page.",
    ],
  };
}

// California, Cal. Civ. Code §§ 8102 and 8202 (private works of improvement). Unlike Wyoming's,
// California's statute prescribes what the notice must contain, not a whole form: the § 8102 items
// "to the extent known", § 8202(a)(1) and (2), and § 8202(a)(3)'s statement word for word "in
// boldface type". Each heading below is the statute's own phrase for its item; the boldface
// statement is copied verbatim (checked against sources/ca-8102-8216.txt in
// test/ca-notice.test.ts). The layout, the title and the signature lines are this package's.

const CA_STATEMENT_TITLE = "NOTICE TO PROPERTY OWNER";
const CA_STATEMENT: readonly string[] = [
  "EVEN THOUGH YOU HAVE PAID YOUR CONTRACTOR IN FULL, if the person or firm that has given you this notice is not paid in full for labor, service, equipment, or material provided or to be provided to your construction project, a lien may be placed on your property. Foreclosure of the lien may lead to loss of all or part of your property. You may wish to protect yourself against this by (1) requiring your contractor to provide a signed release by the person or firm that has given you this notice before making payment to your contractor, or (2) any other method that is appropriate under the circumstances.",
  "This notice is required by law to be served by the undersigned as a statement of your legal rights. This notice is not intended to reflect upon the financial condition of the contractor or the person employed by you on the construction project.",
  "If you record a notice of cessation or completion of your construction project, you must within 10 days after recording, send a copy of the notice of completion to your contractor and the person or firm that has given you this notice. The notice must be sent by registered or certified mail. Failure to send the notice will extend the deadline to record a claim of lien. You are not required to send the notice if you are a residential homeowner of a dwelling containing four or fewer units.",
];

/** Each item's heading is its phrase in § 8102(a) or § 8202, in that order; `from` names which. */
export const CA_NOTICE_ITEMS: readonly {
  key: string;
  heading: string;
  from: string;
  label: string;
  required: boolean;
  help: string;
}[] = [
  {
    key: "ownerNameAddress",
    heading: "The name and address of the owner or reputed owner",
    from: "8102",
    label: "Owner or reputed owner, name and address",
    required: true,
    help: "As on the building permit, the direct contract or the county record.",
  },
  {
    key: "directContractor",
    heading: "The name and address of the direct contractor",
    from: "8102",
    label: "Direct contractor (the GC with the contract with the owner), name and address",
    required: true,
    help: "The general contractor whose contract is with the owner.",
  },
  {
    key: "lender",
    heading: "The name and address of the construction lender, if any",
    from: "8102",
    label: "Construction lender, name and address (if any)",
    required: false,
    help: "Left blank, this item is left off. The GC must give you the lender's name and address on request (§ 8208).",
  },
  {
    key: "siteDescription",
    heading:
      "A description of the site sufficient for identification, including the street address of the site, if any",
    from: "8102",
    label: "The site: a description and its street address",
    required: true,
    help: "The project's name and street address; a legal description (lot, tract, APN) if you have it.",
  },
  {
    key: "claimant",
    heading: "The name, address, and relationship to the parties of the person giving the notice",
    from: "8102",
    label: "Your company: name, address and relationship to the parties",
    required: true,
    help: "E.g. ABC Electric, 1 Main St, Fresno, CA 93721; subcontractor to the direct contractor.",
  },
  {
    key: "hiredBy",
    heading: "The name of the person to or for whom the work is provided",
    from: "8102",
    label: "Who you provide the work to or for",
    required: true,
    help: "The company that hired you: the GC, or the subcontractor above you.",
  },
  {
    key: "workDescription",
    heading: "A general description of the work to be provided",
    from: "8202",
    label: "General description of the work",
    required: true,
    help: "E.g. electrical rough-in and finish, labor and materials. A general description also covers later work (§ 8206(c)).",
  },
  {
    key: "estimate",
    heading: "An estimate of the total price of the work provided and to be provided",
    from: "8202",
    label: "Estimate of the total price of the work",
    required: true,
    help: "Usually your contract sum with approved change orders, e.g. $184,500.00.",
  },
  {
    key: "demand",
    heading:
      "A statement or estimate of the claimant’s demand, if any, after deducting all just credits and offsets",
    from: "8102",
    label: "Amount owed to you now, after credits and offsets (if any)",
    required: false,
    help: "Left blank, this item is left off.",
  },
  {
    key: "laborers",
    heading:
      "the name and address of the laborer and any person or entity described in subdivision (b) of Section 8024 to which payments are due",
    from: "8202",
    label: "Only if you owe a laborer unpaid wages: their name and address, and any fund owed",
    required: false,
    help: "Required by § 8202(b) only from a subcontractor that has not paid all compensation due to a laborer. Left blank, this item is left off.",
  },
];

const CA_NOTICE_FIELDS: readonly FieldSpec[] = [
  ...CA_NOTICE_ITEMS.map((i) =>
    f(
      i.key,
      i.label,
      i.key === "estimate" || i.key === "demand" ? "text" : "multiline",
      i.required,
      i.help,
    ),
  ),
  f("signedDate", "Date", "date", true, "The date you sign and send the notice."),
];

const CA_NOTICE_BODY: readonly BlockTemplate[] = [
  { type: "title", text: "PRELIMINARY NOTICE" },
  {
    type: "paragraph",
    text: "California Civil Code Sections 8102 and 8202 (private works of improvement)",
  },
  ...CA_NOTICE_ITEMS.flatMap((i): BlockTemplate[] => [
    {
      type: "heading",
      text: `${i.heading.charAt(0).toUpperCase()}${i.heading.slice(1)}:`,
    },
    { type: "paragraph", text: `{{${i.key}}}` },
  ]),
  { type: "spacer" },
  { type: "title", text: CA_STATEMENT_TITLE },
  ...CA_STATEMENT.map((text): BlockTemplate => ({ type: "notice", text })),
  { type: "spacer" },
  {
    type: "signature",
    lines: [
      { label: "Signature", value: "" },
      { label: "Name and title", value: "" },
      { label: "Date", value: "{{signedDate}}" },
    ],
  },
];

export const CA_NOTICE_ID = "CA/preliminary-notice/private-works";

/** California's preliminary notice for a private work, Cal. Civ. Code §§ 8102, 8200-8216. */
export function caPreliminaryNotice(): NoticeForm {
  return {
    id: CA_NOTICE_ID,
    state: "CA",
    title: "Preliminary notice (private works)",
    citation: {
      text: "Cal. Civ. Code §§ 8102, 8202",
      officialUrl:
        "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=8202.",
      verification: {
        status: "verified",
        checkedOn: CA_CHECKED_ON,
        sourceUrl: CA_SOURCE_URL,
        checkedBy: "sources/ca-8102-8216.txt; test/ca-notice.test.ts",
      },
    },
    sendTo:
      "the owner or reputed owner, the direct contractor or reputed direct contractor, and the construction lender or reputed construction lender, if any",
    fields: CA_NOTICE_FIELDS,
    body: CA_NOTICE_BODY,
    attachment: null,
    omitIfBlank: ["lender", "demand", "laborers"],
    notes: [
      "California: before recording a lien claim, giving a stop payment notice, or asserting a claim against a payment bond, a claimant gives preliminary notice to the owner or reputed owner, the direct contractor or reputed direct contractor, and the construction lender or reputed construction lender, if any (Cal. Civ. Code § 8200(a)). A laborer need not give one, and a claimant with a contract directly with the owner gives it only to the construction lender, if any (§ 8200(e)).",
      'Timing, in the statute\'s words: "A preliminary notice shall be given not later than 20 days after the claimant has first furnished work on the work of improvement." A late notice still covers work "performed within 20 days prior to the service of the preliminary notice, and at any time thereafter" (§ 8204(a)). Enter the day you first furnished work and PayApps counts the 20 calendar days and reminds you; it does not move the date for a weekend or holiday.',
      "How to give it: personal delivery, or mail by registered or certified mail, express mail, or overnight delivery by an express service carrier, or leaving it and mailing a copy under Code Civ. Proc. § 415.20 (§§ 8106, 8110). Proof is a proof of notice declaration with the mailing receipt or tracking record (§ 8118). Record each notice you give and PayApps prints the declaration for it.",
      "One notice per person covers all your work on the job, except that work under contracts with more than one subcontractor needs a separate notice for each contract (§ 8206).",
      "A licensed subcontractor whose contract is over $400 and who does not give the notice can be disciplined under the Contractors' State License Law (§ 8216).",
      "This is the notice for private works (§ 8200 ff.). A public work's preliminary notice is under § 9300 ff. and is not encoded here.",
    ],
  };
}

/** The preliminary notices encoded for `state` (two-letter code, any case). Throws RangeError for an unknown code. */
export function noticeForms(state: string): NoticeForm[] {
  const code = normalizeState(state);
  if (code === "CA") return [caPreliminaryNotice()];
  if (code === "FL") return [flNoticeToOwner()];
  if (code === "TX") return [txLaborNotice(), txRetainageNotice()];
  return code === "WY" ? [wyPreliminaryNotice()] : [];
}

/** The notice with this id in `state`, if encoded. */
export function noticeById(state: string, id: string): NoticeForm | undefined {
  return noticeForms(state).find((n) => n.id === id);
}

/** The body less the heading and paragraph of each `omitIfBlank` field left blank. */
function withoutBlankItems(
  form: NoticeForm,
  values: Readonly<Record<string, string>>,
): readonly BlockTemplate[] {
  const drop = new Set((form.omitIfBlank ?? []).filter((k) => !values[k]));
  if (drop.size === 0) return form.body;
  const out: BlockTemplate[] = [];
  for (let i = 0; i < form.body.length; i++) {
    const b = form.body[i];
    const next = form.body[i + 1];
    if (b?.type === "heading" && next?.type === "paragraph") {
      const key = /^\{\{(\w+)\}\}$/.exec(next.text)?.[1];
      if (key && drop.has(key)) {
        i++;
        continue;
      }
    }
    if (b) out.push(b);
  }
  return out;
}

/** Validate `data` and render the notice (and its attachment, blank) into PDF-ready blocks. */
export function renderNotice(form: NoticeForm, data: WaiverData): NoticeRenderResult {
  const v = validate(form, data);
  if (!v.ok) return v;
  const cross = form.crossCheck?.(data) ?? [];
  if (cross.length > 0) return { ok: false, errors: cross };
  return {
    ok: true,
    document: {
      formId: form.id,
      state: form.state,
      title: form.title,
      citation: form.citation.text,
      sendTo: form.sendTo,
      disclaimers: [
        ...form.notes,
        "Generated by software; not legal advice. Have counsel review before relying on it.",
      ],
      values: v.values,
      blocks: fillBlocks(withoutBlankItems(form, v.values), v.values),
      attachment: form.attachment
        ? { title: form.attachment.title, blocks: fillBlocks(form.attachment.body, {}) }
        : null,
      ...(form.minFontPt ? { minFontPt: form.minFontPt } : {}),
    },
  };
}
