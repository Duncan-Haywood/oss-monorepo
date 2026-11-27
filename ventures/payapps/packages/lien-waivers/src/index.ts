import { genericForms } from "./generic.ts";
import { MA_GENERAL_NOTES, maPartialForm } from "./ma.ts";
import { MO_GENERAL_NOTES, moResidentialForm } from "./mo.ts";
import { normalizeState } from "./states.ts";
import { STATUTORY_STATES, statutoryForm, statutoryStateFor } from "./statutory.ts";
import { type FormDefinition, WAIVER_KINDS } from "./types.ts";

export {
  CA_NOTICE_DAYS,
  CA_NOTICE_METHOD_LABELS,
  CA_NOTICE_METHODS,
  CA_NOTICE_RECIPIENT_LABELS,
  CA_NOTICE_RECIPIENTS,
  CA_PROOF_ID,
  type CaNoticeMethod,
  type CaNoticeRecipient,
  type CaNoticeTiming,
  type CaProofInput,
  caNoticeCompleteOn,
  caNoticeDueOn,
  caNoticeTiming,
  caProofAttachments,
  caProofOfNotice,
} from "./ca-proof.ts";
export { fieldsFor } from "./fields.ts";
export {
  GA_AFFIDAVIT_COPY_DAYS,
  GA_AFFIDAVIT_ID,
  GA_WAIVER_DAYS,
  type GaNinetyDays,
  gaAffidavitCopyDueOn,
  gaAffidavitOfNonpayment,
  gaNinetyDays,
} from "./ga-affidavit.ts";
export { GENERIC_NOTICE, genericForm } from "./generic.ts";
export { MA_PARTIAL_FORM_ID } from "./ma.ts";
export { MO_RESIDENTIAL_FORM_ID } from "./mo.ts";
export {
  MS_AFFIDAVIT_COPY_DAYS,
  MS_AFFIDAVIT_ID,
  MS_WAIVER_DAYS,
  type MsSixtyDays,
  msAffidavitCopyDueOn,
  msAffidavitOfNonpayment,
  msSixtyDays,
} from "./ms-affidavit.ts";
export {
  CA_NOTICE_ID,
  type NoticeDocument,
  type NoticeForm,
  type NoticeRenderResult,
  noticeById,
  noticeForms,
  renderNotice,
  WY_NOTICE_ID,
} from "./notices.ts";
export {
  fillBlocks,
  placeholdersOf,
  render,
  toPlainText,
  undeclaredPlaceholders,
} from "./render.ts";
export { normalizeState, US_STATES, type UsState } from "./states.ts";
export { STATUTORY_STATES } from "./statutory.ts";
export * from "./types.ts";
export { formatCents, formatDate, isIsoDate, validate } from "./validate.ts";
export { amountInWords } from "./words.ts";

/**
 * The waiver forms to offer for a project in `state` (two-letter code, any case).
 * - States listed with statutory forms: the four statutory forms. Each is unrenderable
 *   (`body === null`) until its verified text is encoded. No generic fallback is offered
 *   there, because a non-statutory waiver may not be effective in those states.
 * - Every other state: the four generic forms, marked as not statutory. Missouri's carry notes
 *   pointing to its one statutory form, which `alternativeForms("MO")` offers beside them;
 *   Massachusetts' point to its § 32(4) partial waiver, offered the same way.
 * Throws RangeError for an unknown state code.
 */
export function listForms(state: string): FormDefinition[] {
  const code = normalizeState(state);
  const s = statutoryStateFor(code);
  if (s) return WAIVER_KINDS.map((k) => statutoryForm(s, k));
  const forms = genericForms(code);
  if (code === "MO") return forms.map((f) => ({ ...f, notes: [...f.notes, ...MO_GENERAL_NOTES] }));
  if (code === "MA") return forms.map((f) => ({ ...f, notes: [...f.notes, ...MA_GENERAL_NOTES] }));
  return forms;
}

/**
 * Forms offered for only some jobs in `state`, beside `listForms(state)`'s form of the same kind.
 * Each says in `appliesTo` when to choose it; the caller (or the user) decides, never this
 * package. Today: Missouri's unconditional final waiver for residential real property
 * (Mo. Rev. Stat. § 429.016.27) and Massachusetts' partial waiver and subordination of lien for a
 * person who filed or recorded a notice of contract (Mass. Gen. Laws c. 254, § 32(4)).
 * Throws RangeError for an unknown state code.
 */
export function alternativeForms(state: string): FormDefinition[] {
  const code = normalizeState(state);
  if (code === "MO") return [moResidentialForm()];
  if (code === "MA") return [maPartialForm()];
  return [];
}

/** Every form offered for `state`: `listForms` then `alternativeForms`. */
export function allForms(state: string): FormDefinition[] {
  return [...listForms(state), ...alternativeForms(state)];
}

/** The form with this id in `state` (from `listForms` or `alternativeForms`), if still offered. */
export function formById(state: string, id: string): FormDefinition | undefined {
  return allForms(state).find((f) => f.id === id);
}

/** Whether this package lists `state` as having statutory waiver forms. */
export function hasStatutoryForms(state: string): boolean {
  const code = normalizeState(state);
  return STATUTORY_STATES.some((s) => s.state === code);
}
