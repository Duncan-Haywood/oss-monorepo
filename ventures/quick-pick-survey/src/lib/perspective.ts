/**
 * The core framings under which preference content is rated.
 * "PARTNER" (In a partner) and "SELF" (About myself).
 */

export const PERSPECTIVES = ["PARTNER", "SELF", "PARTNER_GUESS"] as const;

export type PerspectiveValue = (typeof PERSPECTIVES)[number];

/** What a session measures when nothing else is specified. */
export const DEFAULT_PERSPECTIVE: PerspectiveValue = "PARTNER";

export type PerspectiveMeta = {
  key: PerspectiveValue;
  /** Decorative glyph paired with text. */
  glyph: string;
  /** Fits in the always-on badge above the cards. */
  short: string;
  /** Row label on the profile screen. */
  label: string;
  /** One line explanation of what you are answering. */
  blurb: string;
  /** Full-sentence call to action on the welcome screen. */
  cta: string;
  /** Modal headline when switching to this mode. */
  modalHeadline: string;
  /** Detailed instruction popup text for mode transition. */
  modalInstruction: string;
  /** Tailwind color class for active mode badge. */
  badgeStyle: string;
  /** Tailwind accent border class for cards. */
  accentBorder: string;
};

/**
 * Display order everywhere a chooser is rendered.
 */
export const PERSPECTIVE_ORDER: PerspectiveValue[] = ["PARTNER", "SELF", "PARTNER_GUESS"];

export const PERSPECTIVE_META: Record<PerspectiveValue, PerspectiveMeta> = {
  PARTNER: {
    key: "PARTNER",
    glyph: "💛",
    short: "Partner Preferences",
    label: "The partner I would choose",
    blurb: "Rate the traits, life, and relationship qualities you want in a romantic partner.",
    cta: "The partner I would choose",
    modalHeadline: "Switching to Partner Preferences 💛",
    modalInstruction: "Rate the traits, life, and relationship qualities you want in a romantic partner.",
    badgeStyle: "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60",
    accentBorder: "border-amber-400 dark:border-amber-600",
  },
  SELF: {
    key: "SELF",
    glyph: "👤",
    short: "Self Values",
    label: "What I want for myself",
    blurb: "Choose the qualities, work, relationships, and way of life you want in your own future—not what you want in a partner.",
    cta: "What I want for my own life",
    modalHeadline: "Switching to Self Values 👤",
    modalInstruction: "Choose the qualities, work, relationships, and way of life you want in your own future—not what you want in a partner.",
    badgeStyle: "bg-sky-50 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-700/60",
    accentBorder: "border-sky-400 dark:border-sky-600",
  },
  PARTNER_GUESS: {
    key: "PARTNER_GUESS",
    glyph: "🔎",
    short: "Partner Read",
    label: "What I think my partner wants",
    blurb: "A comparison mode used for couple blind spots; it stays separate from your own and ideal-partner rankings. this gets dropped from profile. it happens automatically.",
    cta: "What I think my partner wants",
    modalHeadline: "Switching to Partner Read 🔎",
    modalInstruction: "A comparison mode used for couple blind spots; it stays separate from your own and ideal-partner rankings. this gets dropped from profile. it happens automatically.",
    badgeStyle: "bg-purple-50 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-700/60",
    accentBorder: "border-purple-400 dark:border-purple-600",
  },
};

/** Narrows untrusted input (request bodies, localStorage) to a real perspective. */
export function parsePerspective(value: unknown): PerspectiveValue | null {
  return typeof value === "string" && (PERSPECTIVES as readonly string[]).includes(value)
    ? (value as PerspectiveValue)
    : null;
}

/** Same, but falls back rather than failing — for optional fields. */
export function perspectiveOrDefault(value: unknown): PerspectiveValue {
  return parsePerspective(value) ?? DEFAULT_PERSPECTIVE;
}
