/**
 * Colour contrast, computed from the palette that actually ships.
 *
 * Tailwind v4 defines its palette in oklch, in `node_modules/tailwindcss/theme.css`.
 * Reading it from there rather than from a hand-copied table of hex values means
 * the numbers here are the numbers a phone renders: a palette change upstream
 * moves this check with it instead of leaving it quietly wrong.
 *
 * WCAG 2.1 contrast is defined on sRGB relative luminance, so the oklch values
 * are converted through OKLab to linear sRGB and gamma-encoded on the way.
 */

export type Rgb = { r: number; g: number; b: number };

/** WCAG 2.1 AA, text below 18.66px bold / 24px regular. */
export const AA_NORMAL = 4.5;
/** WCAG 2.1 AA, large text. Also the floor for icons and other non-text. */
export const AA_LARGE = 3;

function gammaEncode(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * oklch → sRGB, clipped to gamut per channel.
 *
 * Clipping rather than gamut-mapping: every colour in Tailwind's default
 * palette is already inside sRGB, so the clip never fires on real input, and a
 * silent chroma reduction would be a worse failure than an obviously wrong
 * channel if one ever did land outside.
 */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;

  return {
    r: Math.round(255 * gammaEncode(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)),
    g: Math.round(255 * gammaEncode(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)),
    b: Math.round(255 * gammaEncode(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)),
  };
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A translucent colour over an opaque one. Tailwind's `/40` suffix is an alpha,
 * and a half-transparent card back does not have the contrast of the colour
 * named in the class — it has the contrast of what you actually see.
 */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
  };
}

const OKLCH = /--(color-[a-z]+-?\d*):\s*oklch\(([\d.]+)%\s+([\d.]+|none)\s+([\d.]+|none)\)/g;
const HEX = /--(color-[a-z]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;

/**
 * Parse Tailwind's theme layer into `{ "neutral-400": {r,g,b} }`.
 *
 * Accepts both the oklch entries (the palette proper) and the plain hex ones
 * (`white`, `black`), and ignores everything that is not a colour.
 */
export function parsePalette(css: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};

  for (const m of css.matchAll(OKLCH)) {
    const name = m[1].replace(/^color-/, "");
    const c = m[3] === "none" ? 0 : Number(m[3]);
    const h = m[4] === "none" ? 0 : Number(m[4]);
    out[name] = oklchToRgb(Number(m[2]) / 100, c, h);
  }

  for (const m of css.matchAll(HEX)) {
    const name = m[1].replace(/^color-/, "");
    out[name] = hexToRgb(m[2]);
  }

  return out;
}

/**
 * Resolve one Tailwind colour token — `white`, `neutral-400`, `amber-950/40` —
 * against a palette and the background it sits on. Returns null for anything
 * not in the palette, so an arbitrary-value class like `bg-[#123456]` is
 * reported as unresolvable rather than silently passing.
 */
export function resolveToken(token: string, palette: Record<string, Rgb>, over: Rgb): Rgb | null {
  const [name, alphaPart] = token.split("/");
  const base = palette[name];
  if (!base) return null;
  if (alphaPart === undefined) return base;

  const alpha = Number(alphaPart) / 100;
  if (!Number.isFinite(alpha)) return null;
  return composite(base, alpha, over);
}
