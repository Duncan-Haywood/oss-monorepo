// The early-access form contract, shared by the prerendered page (src/site) and the Worker that
// stores submissions (src/worker). Pure: no Worker or DOM APIs, so unit tests and the build use it too.

/**
 * Wording shown next to the consent checkbox. Bump CONSENT_VERSION whenever it changes: each stored
 * request records the version its submitter saw.
 */
export const CONSENT_TEXT =
  "Email me about early access to this product. I can ask to be removed at any time.";
export const CONSENT_VERSION = "2026-11-24";

export const ROLES = {
  owner: "Owner or general manager",
  estimator: "Estimator or quoting lead",
  sales: "Sales or customer service",
  production: "Production or engineering",
  other: "Something else",
} as const;
export type Role = keyof typeof ROLES;

export const PROCESSES = {
  milling: "CNC milling",
  turning: "CNC turning",
  sheet_metal: "Sheet metal / laser / press brake",
  welding: "Welding and fabrication",
  other: "Other processes",
} as const;
export type Process = keyof typeof PROCESSES;

export const RFQ_VOLUMES = {
  under_5: "Fewer than 5",
  "5_20": "5 to 20",
  "20_50": "20 to 50",
  over_50: "More than 50",
} as const;
export type RfqVolume = keyof typeof RFQ_VOLUMES;

export const LIMITS = { name: 120, shop: 160, email: 254, quotingToday: 300, notes: 2000 } as const;

export interface EarlyAccessRequest {
  email: string;
  name: string;
  shop: string;
  role: Role;
  processes: Process[];
  rfqsPerWeek: RfqVolume;
  quotingToday: string;
  notes: string;
  consentVersion: string;
}

/** Field name → message, in form order. Empty when valid. */
export type FieldErrors = Partial<Record<keyof EarlyAccessRequest | "consent", string>>;

/** Raw form values (strings / string lists), as posted. Used to refill the form after an error. */
export interface FormValues {
  email?: string;
  name?: string;
  shop?: string;
  role?: string;
  processes?: string[];
  rfqsPerWeek?: string;
  quotingToday?: string;
  notes?: string;
  consent?: boolean;
}

export type ParseResult =
  | { ok: true; value: EarlyAccessRequest }
  | { ok: false; errors: FieldErrors; values: FormValues };

// One bare address: no display names, no lists, no whitespace. Deliberately simple; the address is
// only ever used to reply by hand.
const EMAIL =
  /^[^\s@<>(),;:"[\]]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

const isKey = <T extends object>(obj: T, key: string): key is Extract<keyof T, string> =>
  Object.hasOwn(obj, key);

const isControl = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x20 || c === 0x7f;
};

/** Collapses whitespace and strips control characters (keeps newlines when multiline). */
function clean(value: string | undefined, multiline = false): string {
  const v = (value ?? "").normalize("NFC");
  if (!multiline) {
    const spaced = [...v].map((ch) => (isControl(ch) ? " " : ch)).join("");
    return spaced.replace(/\s+/g, " ").trim();
  }
  const kept = [...v.replace(/\r\n?/g, "\n")]
    .filter((ch) => ch === "\n" || !isControl(ch))
    .join("");
  return kept
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Validates posted form values. Pure; the Worker turns the result into a redirect or an error page. */
export function parseEarlyAccess(values: FormValues): ParseResult {
  const errors: FieldErrors = {};
  const email = clean(values.email).toLowerCase();
  const name = clean(values.name);
  const shop = clean(values.shop);
  const role = clean(values.role);
  const rfqsPerWeek = clean(values.rfqsPerWeek);
  const quotingToday = clean(values.quotingToday);
  const notes = clean(values.notes, true);
  const processes = [...new Set((values.processes ?? []).map((p) => clean(p)))];

  if (!email) errors.email = "Enter your work email address.";
  else if (email.length > LIMITS.email || !EMAIL.test(email))
    errors.email = "Enter one email address, like name@yourshop.example.";
  if (!name) errors.name = "Enter your name.";
  else if (name.length > LIMITS.name)
    errors.name = `Keep your name under ${LIMITS.name} characters.`;
  if (!shop) errors.shop = "Enter your shop or company name.";
  else if (shop.length > LIMITS.shop)
    errors.shop = `Keep the shop name under ${LIMITS.shop} characters.`;
  if (!isKey(ROLES, role)) errors.role = "Choose the role closest to yours.";
  if (processes.length === 0) errors.processes = "Choose at least one kind of work you quote.";
  else if (!processes.every((p) => isKey(PROCESSES, p)))
    errors.processes = "Choose from the listed kinds of work.";
  if (!isKey(RFQ_VOLUMES, rfqsPerWeek))
    errors.rfqsPerWeek = "Choose roughly how many RFQs you get.";
  if (quotingToday.length > LIMITS.quotingToday)
    errors.quotingToday = `Keep this under ${LIMITS.quotingToday} characters.`;
  if (notes.length > LIMITS.notes) errors.notes = `Keep this under ${LIMITS.notes} characters.`;
  if (values.consent !== true) errors.consent = "Tick the box so we may email you about access.";

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: {
        email: values.email,
        name: values.name,
        shop: values.shop,
        role: values.role,
        processes: values.processes,
        rfqsPerWeek: values.rfqsPerWeek,
        quotingToday: values.quotingToday,
        notes: values.notes,
        consent: values.consent,
      },
    };
  }
  return {
    ok: true,
    value: {
      email,
      name,
      shop,
      role: role as Role,
      processes: processes as Process[],
      rfqsPerWeek: rfqsPerWeek as RfqVolume,
      quotingToday,
      notes,
      consentVersion: CONSENT_VERSION,
    },
  };
}
