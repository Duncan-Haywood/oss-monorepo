// @ts-check
// Explain each finding in plain German, French or English. Proprietary (see ../LICENSE, part 2).
//
// Order: (1) a deterministic template per rule id (explain-catalog.mjs); (2) for the long tail
// (official BR-xx, national rules, anything without a template) the model, through the `llm`
// port, clearly marked `source: "llm"`; (3) when no model is configured, the call fails, or the
// output does not pass the guard, the checker's own English text, marked `source: "checker"`.
//
// The explanation never changes a finding: rule, severity and the pass/fail verdict come from
// the deterministic checker only. The guard rejects model output that introduces a number the
// finding does not contain, or that tells the reader the invoice is valid.
import { TEMPLATES, extractParams, fill, normaliseLang } from "./explain-catalog.mjs";

/** @typedef {import("./explain-catalog.mjs").Lang} Lang */
/** @typedef {{ rule: string, message: string, fix?: string, path?: string, severity?: string }} Finding */
/**
 * @typedef {{
 *   lang: Lang, source: "template" | "llm" | "checker", title: string, action: string,
 *   notice?: string
 * }} Explanation
 */

export const LLM_NOTICE = {
  en: "Machine-written explanation (AI). The rule message from the checker is authoritative.",
  de: "Automatisch formulierte Erklärung (KI). Maßgeblich ist die Regelmeldung des Prüfprogramms.",
  fr: "Explication rédigée automatiquement (IA). Le message de la règle fait foi.",
};

export const CHECKER_NOTICE = {
  en: "No plain-language text for this rule yet; this is the checker's own message.",
  de: "Für diese Regel gibt es noch keinen Klartext; dies ist die Originalmeldung des Prüfprogramms (Englisch).",
  fr: "Pas encore de texte simplifié pour cette règle ; voici le message d'origine du contrôleur (en anglais).",
};

const SYSTEM = [
  "You explain e-invoice validation findings to small-business owners and their accountants in Germany and France.",
  "A deterministic validator (EN 16931, XRechnung, Peppol, French CTC rules) has already decided the invoice fails this rule.",
  "You never judge whether the invoice is valid and never contradict the finding. You only restate it plainly.",
  "Write in the requested language (de: formal 'Sie'; fr: 'vous'; en: plain English).",
  "title: one sentence saying what is wrong and why a receiver cares. action: one or two sentences saying what to change.",
  "Use only facts present in the input. Do not add numbers, codes, dates, laws or amounts that are not in the input.",
  "If the input is unclear, say what field to check rather than guessing.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, action: { type: "string" } },
  required: ["title", "action"],
  additionalProperties: false,
};

const MAX_LLM_CALLS_PER_REQUEST = 12;

/** @param {string} s */
const numbersIn = (s) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(",", ".")));

const VALIDITY_CLAIM = /\b(is valid|is compliant|passes|ist gültig|ist korrekt|ist konform|est valide|est conforme)\b/i;

/**
 * Accept model output only if it is two short strings, adds no number the finding lacks and
 * makes no validity claim.
 * @param {unknown} data @param {Finding} finding
 * @returns {{ title: string, action: string } | null}
 */
export function guardLlmOutput(data, finding) {
  if (!data || typeof data !== "object") return null;
  const { title, action } = /** @type {{ title?: unknown, action?: unknown }} */ (data);
  if (typeof title !== "string" || typeof action !== "string") return null;
  if (!title.trim() || !action.trim() || title.length > 400 || action.length > 600) return null;
  const allowed = numbersIn(`${finding.rule} ${finding.message} ${finding.fix ?? ""} ${finding.path ?? ""}`);
  for (const n of numbersIn(`${title} ${action}`)) if (!allowed.has(n)) return null;
  if (VALIDITY_CLAIM.test(`${title} ${action}`)) return null;
  return { title: title.trim(), action: action.trim() };
}

/** @param {Finding} finding @param {Lang} lang @returns {Explanation | null} */
export function templateExplanation(finding, lang) {
  const t = TEMPLATES[finding.rule];
  if (!t) return null;
  const params = extractParams(finding);
  const [title, action] = t[lang];
  return { lang, source: "template", title: fill(title, params, lang), action: fill(action, params, lang) };
}

/**
 * A cache shared across requests (explanations are per rule, message and language, never per
 * customer data beyond the checker's message). Any Map-like object works.
 * @typedef {{ get(key: string): Explanation | undefined, set(key: string, value: Explanation): unknown }} ExplainCache
 */

/**
 * @param {Finding[]} findings
 * @param {{ lang?: string, llm?: import("./llm.mjs").Llm | null, cache?: ExplainCache, onLlmCall?: () => void }} opts
 * @returns {Promise<Array<Finding & { explanation: Explanation }>>}
 */
export async function explainFindings(findings, opts = {}) {
  const lang = normaliseLang(opts.lang);
  const cache = opts.cache ?? new Map();
  let llmCalls = 0;
  const out = [];
  for (const finding of findings) {
    const fromTemplate = templateExplanation(finding, lang);
    if (fromTemplate) {
      out.push({ ...finding, explanation: fromTemplate });
      continue;
    }
    const key = `${lang}\u0000${finding.rule}\u0000${finding.message}\u0000${finding.fix ?? ""}`;
    const cached = cache.get(key);
    if (cached) {
      out.push({ ...finding, explanation: cached });
      continue;
    }
    /** @type {Explanation | null} */
    let explanation = null;
    if (opts.llm && llmCalls < MAX_LLM_CALLS_PER_REQUEST) {
      llmCalls++;
      opts.onLlmCall?.();
      try {
        const { data } = await opts.llm.complete({
          purpose: "explain.rule",
          system: SYSTEM,
          prompt: JSON.stringify({ rule: finding.rule, message: finding.message, fix: finding.fix ?? "", lang }),
          schema: SCHEMA,
          maxTokens: 1500,
        });
        const ok = guardLlmOutput(data, finding);
        if (ok) {
          explanation = { lang, source: "llm", ...ok, notice: LLM_NOTICE[lang] };
          cache.set(key, explanation);
        }
      } catch {
        explanation = null;
      }
    }
    explanation ??= {
      lang,
      source: "checker",
      title: finding.message,
      action: finding.fix ?? "",
      ...(lang === "en" ? {} : { notice: CHECKER_NOTICE[lang] }),
    };
    out.push({ ...finding, explanation });
  }
  return out;
}
