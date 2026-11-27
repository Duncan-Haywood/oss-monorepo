import { AZ_BODIES, AZ_CHECKED_ON, AZ_FIELDS, AZ_NOTES, AZ_SOURCE_URL } from "./az.ts";
import { CA_BODIES, CA_CHECKED_ON, CA_FIELDS, CA_NOTES, CA_SOURCE_URL } from "./ca.ts";
import { fieldsFor } from "./fields.ts";
import {
  FL_BODIES,
  FL_CHECKED_ON,
  FL_FIELDS,
  FL_NO_CONDITIONAL_FORM,
  FL_NOTES,
  FL_SOURCE_URL,
} from "./fl.ts";
import {
  GA_AMENDMENT_URL,
  GA_BODIES,
  GA_CHECKED_ON,
  GA_FIELDS,
  GA_MIN_FONT_PT,
  GA_NOTES,
  GA_SOURCE_URL,
} from "./ga.ts";
import { MI_BODIES, MI_CHECKED_ON, MI_FIELDS, MI_NOTES, MI_SOURCE_URL } from "./mi.ts";
import { MS_BODIES, MS_CHECKED_ON, MS_FIELDS, MS_NOTES, MS_SOURCE_URL } from "./ms.ts";
import { NV_BODIES, NV_CHECKED_ON, NV_FIELDS, NV_NOTES, NV_SOURCE_URL } from "./nv.ts";
import { TX_BODIES, TX_CHECKED_ON, TX_FIELDS, TX_NOTES, TX_SOURCE_URL } from "./tx.ts";
import type {
  BlockTemplate,
  Citation,
  FieldSpec,
  FormDefinition,
  Verification,
  WaiverKind,
} from "./types.ts";
import {
  UT_BODIES,
  UT_CHECKED_ON,
  UT_FIELDS,
  UT_NO_UNCONDITIONAL_FORM,
  UT_NOTES,
  UT_SOURCE_URL,
} from "./ut.ts";
import {
  WY_BODIES,
  WY_CHECKED_ON,
  WY_FIELDS,
  WY_NO_CONDITIONAL_FORM,
  WY_NOTES,
  WY_SOURCE_URL,
} from "./wy.ts";

/**
 * States listed as having statutory lien waiver forms.
 *
 * HONESTY NOTE (read before editing): as of 2026-11-24 no form text was encoded here and no
 * citation had been checked against an official source. On 2026-11-25 Arizona's four forms were
 * encoded from the Legislature's own site (src/az.ts, checked word for word by test/az.test.ts),
 * Nevada's the same day (src/nv.ts, test/nv.test.ts), then Texas (src/tx.ts), Utah (src/ut.ts,
 * which has two forms, not four), Florida (src/fl.ts, also two forms), Michigan (src/mi.ts), Wyoming (src/wy.ts, one form listed as both unconditional kinds), Georgia (src/ga.ts, 2026-11-26, from the Acts as passed, since the Code is published only through LexisNexis; its interim and final forms are each listed as both kinds), Mississippi (src/ms.ts, 2026-11-26, the same way, from SB 2622 (2014) as sent to the Governor) and California (src/ca.ts, from the Legislative Counsel's bulk download, since leginfo's display site answers 403); test/whole-form.test.ts compares every encoded form with the
 * statute as a whole. Missouri was read the same day (src/mo.ts) and left this list: its one form is
 * an unconditional final waiver for residential real property only (§ 429.016.27), so Missouri gets
 * the general forms plus that one as an alternative (index.ts, `alternativeForms`). Every other state below is still unverified. The build environment's network
 * policy blocked every official statute site we tried (California, Texas, Arizona, Utah,
 * Nevada, Florida, Michigan, Missouri, Massachusetts, and Justia), so we could not read the
 * current text. The list and section numbers come from the project brief and general
 * knowledge, and are marked `unverified`.
 *
 * To encode a form, read the CURRENT section on the official site, copy the form text
 * verbatim into `body` using `{{field}}` placeholders only where the statute has a blank, and
 * set `verification` to `{ status: "verified", checkedOn, sourceUrl, checkedBy }`. Tests
 * refuse a body whose citation is unverified.
 */

const ATTEMPTED_ON = "2026-11-24";
const UNVERIFIED_NOTE =
  "Citation not yet checked against the official source; the official site was unreachable " +
  "from the build environment. Confirm the current section before relying on it.";

type KindMap<T> = Record<WaiverKind, T>;

interface StatutoryState {
  state: string;
  name: string;
  /** Citation per kind. `null` section text means the section number is not yet identified. */
  citations: KindMap<string>;
  officialUrls: KindMap<string | null>;
  /** Verified verbatim bodies, once encoded (requires `verified`). */
  bodies?: Partial<KindMap<readonly BlockTemplate[]>>;
  /** The statute's own blanks, when they differ from the generic field set. */
  fields?: Partial<KindMap<readonly FieldSpec[]>>;
  /** Kinds the statute, once read, turns out not to prescribe, with the reason (requires `verified`). */
  absent?: Partial<KindMap<string>>;
  /** The statute's smallest type size for the form, in points (Georgia's 12). */
  minFontPt?: number;
  /** Set only when someone read the official text and encoded it. */
  verified?: { checkedOn: string; sourceUrl: string; checkedBy: string };
  notes: readonly string[];
}

function same<T>(v: T): KindMap<T> {
  return {
    "conditional-progress": v,
    "unconditional-progress": v,
    "conditional-final": v,
    "unconditional-final": v,
  };
}

const caUrl = (s: number) =>
  `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=${s}.`;

export const STATUTORY_STATES: readonly StatutoryState[] = [
  {
    state: "AZ",
    name: "Arizona",
    citations: same("Ariz. Rev. Stat. § 33-1008"),
    officialUrls: same(AZ_SOURCE_URL),
    bodies: AZ_BODIES,
    fields: AZ_FIELDS,
    verified: {
      checkedOn: AZ_CHECKED_ON,
      sourceUrl: AZ_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Arizona Legislature's published text",
    },
    notes: AZ_NOTES,
  },
  {
    state: "CA",
    name: "California",
    citations: {
      "conditional-progress": "Cal. Civ. Code § 8132",
      "unconditional-progress": "Cal. Civ. Code § 8134",
      "conditional-final": "Cal. Civ. Code § 8136",
      "unconditional-final": "Cal. Civ. Code § 8138",
    },
    officialUrls: {
      "conditional-progress": caUrl(8132),
      "unconditional-progress": caUrl(8134),
      "conditional-final": caUrl(8136),
      "unconditional-final": caUrl(8138),
    },
    bodies: CA_BODIES,
    fields: CA_FIELDS,
    verified: {
      checkedOn: CA_CHECKED_ON,
      sourceUrl: CA_SOURCE_URL,
      checkedBy:
        "Claude Code agent session, against the California Legislative Counsel's official bulk download of the codes",
    },
    notes: CA_NOTES,
  },
  {
    state: "FL",
    name: "Florida",
    citations: same("Fla. Stat. § 713.20"),
    officialUrls: same(FL_SOURCE_URL),
    bodies: FL_BODIES,
    fields: FL_FIELDS,
    absent: {
      "conditional-progress": FL_NO_CONDITIONAL_FORM,
      "conditional-final": FL_NO_CONDITIONAL_FORM,
    },
    verified: {
      checkedOn: FL_CHECKED_ON,
      sourceUrl: FL_SOURCE_URL,
      checkedBy:
        "Claude Code agent session, against the Florida Senate's published Florida Statutes",
    },
    notes: FL_NOTES,
  },
  {
    state: "GA",
    name: "Georgia",
    citations: {
      "conditional-progress": "O.C.G.A. § 44-14-366(d)",
      "unconditional-progress": "O.C.G.A. § 44-14-366(d)",
      "conditional-final": "O.C.G.A. § 44-14-366(e)",
      "unconditional-final": "O.C.G.A. § 44-14-366(e)",
    },
    officialUrls: same(GA_SOURCE_URL),
    bodies: GA_BODIES,
    fields: GA_FIELDS,
    minFontPt: GA_MIN_FONT_PT,
    verified: {
      checkedOn: GA_CHECKED_ON,
      sourceUrl: GA_SOURCE_URL,
      checkedBy: `Claude Code agent session, against the Acts as passed (SB 315, 2020; SB 143, 2021, ${GA_AMENDMENT_URL}); the LexisNexis-published Code was not reachable`,
    },
    notes: GA_NOTES,
  },
  {
    state: "MI",
    name: "Michigan",
    citations: same("Mich. Comp. Laws § 570.1115"),
    officialUrls: same(MI_SOURCE_URL),
    bodies: MI_BODIES,
    fields: MI_FIELDS,
    verified: {
      checkedOn: MI_CHECKED_ON,
      sourceUrl: MI_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Michigan Legislature's published text",
    },
    notes: MI_NOTES,
  },
  {
    state: "MS",
    name: "Mississippi",
    citations: {
      "conditional-progress": "Miss. Code Ann. § 85-7-433(1)",
      "unconditional-progress": "Miss. Code Ann. § 85-7-433(1)",
      "conditional-final": "Miss. Code Ann. § 85-7-433(2)",
      "unconditional-final": "Miss. Code Ann. § 85-7-433(2)",
    },
    officialUrls: same(MS_SOURCE_URL),
    bodies: MS_BODIES,
    fields: MS_FIELDS,
    verified: {
      checkedOn: MS_CHECKED_ON,
      sourceUrl: MS_SOURCE_URL,
      checkedBy:
        "Claude Code agent session, against the Act as sent to the Governor (SB 2622, 2014), published by the Mississippi Legislature; the LexisNexis-published Code was not reachable",
    },
    notes: MS_NOTES,
  },
  {
    state: "NV",
    name: "Nevada",
    citations: same("Nev. Rev. Stat. § 108.2457"),
    officialUrls: same(NV_SOURCE_URL),
    bodies: NV_BODIES,
    fields: NV_FIELDS,
    verified: {
      checkedOn: NV_CHECKED_ON,
      sourceUrl: NV_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Nevada Legislature's published text",
    },
    notes: NV_NOTES,
  },
  {
    state: "TX",
    name: "Texas",
    citations: same("Tex. Prop. Code § 53.284"),
    officialUrls: same(TX_SOURCE_URL),
    bodies: TX_BODIES,
    fields: TX_FIELDS,
    verified: {
      checkedOn: TX_CHECKED_ON,
      sourceUrl: TX_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Texas Legislature's published text",
    },
    notes: TX_NOTES,
  },
  {
    state: "UT",
    name: "Utah",
    citations: same("Utah Code § 38-1a-802"),
    officialUrls: same(UT_SOURCE_URL),
    bodies: UT_BODIES,
    fields: UT_FIELDS,
    absent: {
      "unconditional-progress": UT_NO_UNCONDITIONAL_FORM,
      "unconditional-final": UT_NO_UNCONDITIONAL_FORM,
    },
    verified: {
      checkedOn: UT_CHECKED_ON,
      sourceUrl: UT_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Utah Legislature's published text",
    },
    notes: UT_NOTES,
  },
  {
    state: "WY",
    name: "Wyoming",
    citations: same("Wyo. Stat. § 29-10-101(b)"),
    officialUrls: same(WY_SOURCE_URL),
    bodies: WY_BODIES,
    fields: WY_FIELDS,
    absent: {
      "conditional-progress": WY_NO_CONDITIONAL_FORM,
      "conditional-final": WY_NO_CONDITIONAL_FORM,
    },
    verified: {
      checkedOn: WY_CHECKED_ON,
      sourceUrl: WY_SOURCE_URL,
      checkedBy: "Claude Code agent session, against the Wyoming Legislature's published Title 29",
    },
    notes: WY_NOTES,
  },
];

const TITLES: Record<WaiverKind, string> = {
  "conditional-progress": "Conditional Waiver and Release on Progress Payment",
  "unconditional-progress": "Unconditional Waiver and Release on Progress Payment",
  "conditional-final": "Conditional Waiver and Release on Final Payment",
  "unconditional-final": "Unconditional Waiver and Release on Final Payment",
};

function citationFor(s: StatutoryState, kind: WaiverKind): Citation {
  const verification: Verification = s.verified
    ? { status: "verified", ...s.verified }
    : { status: "unverified", attemptedOn: ATTEMPTED_ON, note: UNVERIFIED_NOTE };
  return { text: s.citations[kind], officialUrl: s.officialUrls[kind], verification };
}

export function statutoryStateFor(state: string): StatutoryState | undefined {
  return STATUTORY_STATES.find((s) => s.state === state);
}

export function statutoryForm(s: StatutoryState, kind: WaiverKind): FormDefinition {
  const body = s.bodies?.[kind] ?? null;
  const absent = s.verified ? s.absent?.[kind] : undefined;
  const notes = [...s.notes];
  if (absent) {
    notes.unshift(absent);
  } else if (!body) {
    notes.unshift(
      `Statutory text pending — not yet verified. ${s.name} is listed as prescribing statutory waiver forms; this package has not encoded the verified text of ${s.citations[kind]}, so use the official form until it does.`,
    );
  }
  return {
    id: `${s.state}/${kind}/statutory`,
    state: s.state,
    kind,
    source: "statutory",
    title: TITLES[kind],
    citation: citationFor(s, kind),
    fields: s.fields?.[kind] ?? fieldsFor(kind),
    body,
    ...(absent ? { absent } : {}),
    ...(s.minFontPt ? { minFontPt: s.minFontPt } : {}),
    notes,
  };
}
