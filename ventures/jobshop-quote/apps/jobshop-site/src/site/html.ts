// A tiny escaping template tag for the prerendered pages. Interpolated values are escaped unless
// they are Html (the result of another html`` call or raw()), so page text can never inject markup.

export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type Interpolation = Html | string | number | false | null | undefined | Interpolation[];

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(v: Interpolation): string {
  if (v === false || v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  if (v instanceof Html) return v.value;
  return esc(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Interpolation[]): Html {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += render(v) + (strings[i + 1] ?? "");
  });
  return new Html(out);
}

/** Trusted markup only (constants written in this repo). */
export const raw = (s: string): Html => new Html(s);
