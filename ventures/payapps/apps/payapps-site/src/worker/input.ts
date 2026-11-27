// Validation of the early-access form (form post or JSON). Pure, unit-tested.
import { CONSENT_VERSION, JOB_OPTIONS, ROLE_OPTIONS, TOOL_OPTIONS } from "@site/pages";
import { isEmailAddress } from "./email";
import type { SignupInput } from "./signups";

export type ParseResult =
  | { ok: true; value: SignupInput; honeypot: boolean }
  | { ok: false; field: string; message: string };

/** Drops control characters except tab, newline and carriage return. */
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) out += ch;
  }
  return out;
}

function text(v: unknown, max: number, multiline = false): string | null {
  if (typeof v !== "string") return null;
  let s = stripControl(v);
  if (!multiline) s = s.replace(/[\r\n]+/g, " ");
  s = s.trim().slice(0, max);
  return s ? s : null;
}

function choice(v: unknown, options: readonly (readonly [string, string])[]): string | null {
  return typeof v === "string" && options.some(([o]) => o === v) ? v : null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function parseSignup(body: Record<string, unknown>): ParseResult {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isEmailAddress(email)) {
    return { ok: false, field: "email", message: "Enter a valid email address." };
  }
  const consent = body.consent;
  if (!(consent === "yes" || consent === true || consent === "true")) {
    return {
      ok: false,
      field: "consent",
      message: "Tick the box to agree to early-access emails.",
    };
  }
  if (body.consentVersion !== CONSENT_VERSION) {
    return {
      ok: false,
      field: "consentVersion",
      message: "This form is out of date. Reload the page and try again.",
    };
  }
  const source =
    typeof body.source === "string" && /^\/[A-Za-z0-9/_-]{0,199}$/.test(body.source)
      ? body.source
      : "/early-access";
  return {
    ok: true,
    honeypot: typeof body.website === "string" && body.website.trim() !== "",
    value: {
      email,
      company: text(body.company, 120),
      role: choice(body.role, ROLE_OPTIONS),
      jobs: choice(body.jobs, JOB_OPTIONS),
      tool: choice(body.tool, TOOL_OPTIONS),
      message: text(body.message, 1000, true),
      source,
      consentVersion: CONSENT_VERSION,
    },
  };
}
