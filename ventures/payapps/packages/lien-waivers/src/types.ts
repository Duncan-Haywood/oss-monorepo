/** The four waiver kinds: conditional/unconditional x progress/final. */
export const WAIVER_KINDS = [
  "conditional-progress",
  "unconditional-progress",
  "conditional-final",
  "unconditional-final",
] as const;
export type WaiverKind = (typeof WAIVER_KINDS)[number];

export function isConditional(kind: WaiverKind): boolean {
  return kind.startsWith("conditional");
}
export function isFinal(kind: WaiverKind): boolean {
  return kind.endsWith("final");
}

/** Input field value types. Money is integer cents; dates are ISO `YYYY-MM-DD`. */
export type FieldType = "text" | "multiline" | "date" | "money";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help?: string;
}

/** Values supplied by the caller. Money fields take integer cents. */
export type WaiverData = Record<string, string | number | undefined>;

/**
 * Where a form's wording comes from.
 * - `statutory`: wording prescribed by a state statute (public law), cited.
 * - `generic`: this package's own wording. NOT a statutory form.
 */
export type FormSource = "statutory" | "generic";

/**
 * Honest record of whether a citation / form text was checked against the official
 * source. `checkedOn` is only set when someone actually read the official text.
 */
export type Verification =
  | { status: "verified"; checkedOn: string; sourceUrl: string; checkedBy: string }
  | { status: "unverified"; attemptedOn?: string; note: string };

export interface Citation {
  /** Human-readable citation, e.g. "Cal. Civ. Code § 8132". */
  text: string;
  /** Official source to read the current text at. */
  officialUrl: string | null;
  verification: Verification;
}

/** A block template: `{{fieldKey}}` placeholders are replaced with formatted values. */
export type BlockTemplate =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "notice"; text: string }
  | { type: "field"; label: string; value: string }
  | { type: "signature"; lines?: readonly SignatureLineTemplate[] }
  | { type: "spacer" };

/** One line of a signature block; `value` may hold `{{field}}` placeholders ("" = sign by hand). */
export interface SignatureLineTemplate {
  label: string;
  value: string;
}

export interface FormDefinition {
  /** Stable id, e.g. "CA/conditional-progress/statutory" or "generic/unconditional-final". */
  id: string;
  /** Two-letter state code this form is offered for, or null for the state-agnostic generic form. */
  state: string | null;
  kind: WaiverKind;
  source: FormSource;
  title: string;
  /** Statutory forms only. */
  citation: Citation | null;
  fields: readonly FieldSpec[];
  /**
   * Verbatim body. `null` for a statutory form whose official text has not yet been
   * encoded and verified: such a form cannot be rendered.
   */
  body: readonly BlockTemplate[] | null;
  /**
   * Set when the state's statute was read and prescribes no form of this kind (Utah has no
   * unconditional form). The text says why; `body` is then null for good, not pending.
   */
  absent?: string;
  /**
   * Set on a form offered only for some jobs in its state, beside the state's usual form of the
   * same kind (`alternativeForms`): when to choose it. Missouri's residential form is one.
   */
  appliesTo?: string;
  /**
   * The smallest type size, in points, the statute allows for the whole form (Georgia: "at least
   * 12 point font"). Unset where the statute names none; printers then use their own sizes.
   */
  minFontPt?: number;
  /** Notes shown to the integrator (and in the rendered disclaimer). */
  notes: readonly string[];
}

/** Rendered, PDF-ready blocks. All text is final; no placeholders remain. */
export type Block =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "notice"; text: string }
  | { type: "field"; label: string; value: string }
  | {
      type: "signature";
      lines: readonly { label: string; value: string }[];
    }
  | { type: "spacer" };

export interface WaiverDocument {
  formId: string;
  state: string | null;
  kind: WaiverKind;
  source: FormSource;
  title: string;
  citation: string | null;
  /** Always present; render these on the page (generic) or in the app UI (statutory). */
  disclaimers: readonly string[];
  /** The normalized field values used to fill the form. */
  values: Readonly<Record<string, string>>;
  blocks: readonly Block[];
  /** From the form: print every block at this size or larger. */
  minFontPt?: number;
}

export type ErrorCode =
  | "REQUIRED"
  | "INVALID_DATE"
  | "INVALID_MONEY"
  | "INVALID_TEXT"
  | "UNKNOWN_FIELD"
  | "STATUTORY_TEXT_NOT_ENCODED"
  | "NO_STATUTORY_FORM";

export interface ValidationError {
  field: string | null;
  code: ErrorCode;
  message: string;
}

export type RenderResult =
  | { ok: true; document: WaiverDocument }
  | { ok: false; errors: ValidationError[] };
