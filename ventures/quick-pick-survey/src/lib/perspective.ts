/**
 * The three framings the same content is rated under. They never share
 * rating state, which is what makes the couples comparison possible:
 * PARTNER_GUESS vs. the other person's real PARTNER ranking is the whole
 * point of the app, so a value that gets silently coerced to something
 * else here destroys the headline output.
 *
 * Kept as one module because the value, its label, and its blurb were
 * previously restated in three places and had already drifted apart.
 */

export const PERSPECTIVES = ["SELF", "PARTNER", "PARTNER_GUESS"] as const;

export type PerspectiveValue = (typeof PERSPECTIVES)[number];

/** What a session measures when nothing else is specified. */
export const DEFAULT_PERSPECTIVE: PerspectiveValue = "PARTNER";

export type PerspectiveMeta = {
  key: PerspectiveValue;
  /** Decorative only — always paired with text, never the sole label. */
  glyph: string;
  /** Fits in the always-on badge above the cards. */
  short: string;
  /** Row label on the profile screen. */
  label: string;
  /** One line of "what am I actually answering". */
  blurb: string;
  /** Full-sentence call to action on the welcome screen. */
  cta: string;
};

/**
 * Display order everywhere a chooser is rendered. "In a partner" leads
 * because it is the one perspective that is useful on its own; the other
 * two only pay off once there is something to compare them against.
 */
export const PERSPECTIVE_ORDER: PerspectiveValue[] = ["PARTNER", "SELF", "PARTNER_GUESS"];

export const PERSPECTIVE_META: Record<PerspectiveValue, PerspectiveMeta> = {
  PARTNER: {
    key: "PARTNER",
    glyph: "💞",
    short: "In a partner",
    label: "In a partner",
    blurb: "What you want in someone else.",
    cta: "What I want in a partner",
  },
  SELF: {
    key: "SELF",
    glyph: "⭐",
    short: "For me",
    label: "For myself",
    blurb: "What you want to build in your own life.",
    cta: "What I want for myself",
  },
  PARTNER_GUESS: {
    key: "PARTNER_GUESS",
    glyph: "🔮",
    short: "Their view",
    label: "What they want",
    blurb: "Your guess at your partner's answers.",
    cta: "What I think my partner wants",
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
