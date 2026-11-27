// Which unconditional lien waivers a contractor still owes the GC. The usual exchange: a conditional
// waiver goes out with the pay application (it waives lien rights only once the payment clears), and
// once the check is in, the GC asks for the unconditional waiver for that payment. PayApps knows
// both halves (the application is paid; a conditional waiver on it was marked sent), so it can say
// when the second half is missing. Pure: computed on read from the waiver rows, nothing stored.
//
// Rules, per application and per scope (progress or final):
// - a paid application counts (paid in full, or marked paid), and so does money already received on
//   a sent application still owed the rest (a check that came in short). For that one, only the
//   progress scope and only the amount received: an unconditional waiver for money not received, or
//   a final waiver while a balance is owed, is the one thing never to prompt. GCs commonly hold the
//   next check until the unconditional waiver for the last one is in, so the partial check's waiver
//   is asked for as soon as it is recorded, not once the whole application is paid.
// - only after a conditional waiver of that scope was marked sent; a contractor who never sent one
//   may be on a job that asks for no waivers.
// - an unconditional waiver of that scope marked sent settles it, unless the amounts say otherwise:
//   when the application's paid amount and the waivers' amounts are known and the sent unconditional
//   waivers add up to less than was paid, the rest is still owed. That is the partial-payment case:
//   check one came in and its unconditional waiver went out, then check two paid the balance, and the
//   GC wants a second unconditional waiver for check two. A sent unconditional final waiver also
//   settles progress (it waives everything through the end of the job).
// - one saved but still a draft: "unsent", so the prompt is to send it, not to create another.
// - a state whose statute has no unconditional form of that scope (Utah's forms take effect once
//   the check is paid) is left out: there is nothing more to send.
import type { PayAppStatus, WaiverKind, WaiverStatus } from "./enums";
import type { GaAffidavitFiling } from "./ga-waiver-clock";
import { formatCents } from "./money";

export const WAIVER_SCOPES = ["progress", "final"] as const;
export type WaiverScope = (typeof WAIVER_SCOPES)[number];

export interface WaiverFollowUpInput {
  kind: WaiverKind;
  status: WaiverStatus;
  state: string;
  /** The state's statute has no unconditional form of this waiver's scope (Utah). */
  noUnconditionalForm?: boolean;
  /** The amount the waiver is for; when absent, a sent unconditional waiver settles its scope. */
  amountCents?: number;
  /** YYYY-MM-DD it was marked sent (Georgia's 90 days, src/shared/ga-waiver-clock.ts). */
  sentOn?: string;
  /** Georgia: the affidavit of nonpayment, once recorded as filed. */
  gaAffidavit?: GaAffidavitFiling;
}

export interface WaiverToSend {
  payAppId: string;
  number: number;
  scope: WaiverScope;
  state: string;
  /** missing: no unconditional waiver saved yet; unsent: one is saved but not marked sent. */
  reason: "missing" | "unsent";
  /**
   * Set when unconditional waivers of this scope were sent but cover less than was paid: the amount
   * still to waive (the next check after a partial payment). On a partial payment, always set: the
   * money received and not yet covered by a sent unconditional waiver.
   */
  remainingCents?: number;
  /** The application is not paid yet: the waiver covers only money received so far. */
  partial?: true;
}

export function waiversToSend(
  app: {
    id: string;
    number: number;
    status: PayAppStatus;
    /** What was paid on the application (the certified amount, else line 8, once paid). */
    paidCents?: number;
    /** Money recorded as received on a sent application not yet paid (its payments). */
    receivedCents?: number;
  },
  waivers: readonly WaiverFollowUpInput[],
): WaiverToSend[] {
  if (app.status === "submitted" || app.status === "certified") {
    return partialPaymentWaiver(app, app.receivedCents ?? 0, waivers);
  }
  if (app.status !== "paid") return [];
  const sentUnconditionalFinal = waivers.some(
    (w) => w.kind === "unconditional-final" && w.status === "sent",
  );
  const out: WaiverToSend[] = [];
  for (const scope of WAIVER_SCOPES) {
    const conditional = waivers.filter(
      (w) => w.kind === `conditional-${scope}` && w.status === "sent",
    );
    if (conditional.length === 0) continue;
    const unconditional = waivers.filter((w) => w.kind === `unconditional-${scope}`);
    if (scope === "progress" && sentUnconditionalFinal) continue;
    const sentU = unconditional.filter((w) => w.status === "sent");
    const remaining = shortfall(app.paidCents, sentU);
    if (sentU.length > 0 && remaining === null) continue;
    const base = {
      payAppId: app.id,
      number: app.number,
      scope,
      ...(remaining !== null ? { remainingCents: remaining } : {}),
    };
    const draft = unconditional.find((w) => w.status === "draft");
    if (draft) {
      out.push({ ...base, state: draft.state, reason: "unsent" });
      continue;
    }
    const owed = conditional.find((w) => !w.noUnconditionalForm);
    if (owed) out.push({ ...base, state: owed.state, reason: "missing" });
  }
  return out;
}

/**
 * A sent application with some money in and some still owed: the unconditional progress waiver for
 * the money received (less what sent unconditional progress waivers already cover). Never final.
 */
function partialPaymentWaiver(
  app: { id: string; number: number },
  received: number,
  waivers: readonly WaiverFollowUpInput[],
): WaiverToSend[] {
  if (received <= 0) return [];
  const conditional = waivers.filter(
    (w) => w.kind === "conditional-progress" && w.status === "sent",
  );
  if (conditional.length === 0) return [];
  // An unconditional final waiver sent before the balance came in is the contractor's own call;
  // never ask for more on top of it.
  if (waivers.some((w) => w.kind === "unconditional-final" && w.status === "sent")) return [];
  const unconditional = waivers.filter((w) => w.kind === "unconditional-progress");
  let covered = 0;
  for (const w of unconditional) {
    if (w.status !== "sent") continue;
    // A sent waiver with no amount on record: assume it covers what came in, as for a paid app.
    if (w.amountCents === undefined) return [];
    covered += w.amountCents;
  }
  if (covered >= received) return [];
  const base = {
    payAppId: app.id,
    number: app.number,
    scope: "progress" as const,
    remainingCents: received - covered,
    partial: true as const,
  };
  const draft = unconditional.find((w) => w.status === "draft");
  if (draft) return [{ ...base, state: draft.state, reason: "unsent" }];
  const owed = conditional.find((w) => !w.noUnconditionalForm);
  return owed ? [{ ...base, state: owed.state, reason: "missing" }] : [];
}

/**
 * How much of the paid amount the sent unconditional waivers leave uncovered, or null when they
 * cover it, none was sent, or an amount is unknown (then a sent waiver settles the scope, as before).
 */
function shortfall(
  paidCents: number | undefined,
  sent: readonly WaiverFollowUpInput[],
): number | null {
  if (paidCents === undefined || sent.length === 0) return null;
  let covered = 0;
  for (const w of sent) {
    if (w.amountCents === undefined) return null;
    covered += w.amountCents;
  }
  return covered < paidCents ? paidCents - covered : null;
}

/** One sentence for the cash report's next steps and the pay-app page. */
export function waiverToSendText(w: WaiverToSend, gcName: string): string {
  if (w.partial && w.remainingCents !== undefined) {
    const amount = formatCents(w.remainingCents);
    return w.reason === "unsent"
      ? `Application #${w.number} is paid in part: an unconditional progress waiver is saved but not marked sent. Check it is for the ${amount} received and no more, then send it to ${gcName}.`
      : `Application #${w.number} is paid in part and you sent a conditional progress waiver for it: if ${gcName} or the subcontract asks, the unconditional progress waiver for the ${amount} received is next. Make it for that amount only, never the balance still owed.`;
  }
  if (w.remainingCents !== undefined) {
    return w.reason === "unsent"
      ? `Application #${w.number} is paid and the unconditional ${w.scope} waivers sent so far leave ${formatCents(w.remainingCents)} uncovered: the one saved for the rest is not marked sent; send it to ${gcName}.`
      : `Application #${w.number} is paid and the unconditional ${w.scope} waivers sent so far cover ${formatCents(w.remainingCents)} less than was paid: the waiver for the later payment is next, if ${gcName} or the subcontract asks for one.`;
  }
  return w.reason === "unsent"
    ? `Application #${w.number} is paid and its unconditional ${w.scope} waiver is saved but not marked sent: send it to ${gcName}.`
    : `Application #${w.number} is paid and you sent a conditional ${w.scope} waiver for it: the unconditional ${w.scope} waiver for that payment is next, if ${gcName} or the subcontract asks for one.`;
}
