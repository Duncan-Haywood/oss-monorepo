/**
 * payment-collection.ts — answers the silent gap p2-payment-collection
 * flagged: pricing-one-pager.tsx's callToAction has said "Book your first
 * listing for $19" since it was written, and leads-log.ts has tracked a
 * "paid" stage since p2-leads-tracking, but nothing anywhere in the repo
 * ever said HOW a prospect actually pays. Same class of gap as
 * booking-link.ts (prospects could read the offer but had no way to book)
 * and mirrors its zero-cost, zero-new-infrastructure treatment: this picks
 * a real, working-today payment path rather than deferring payment
 * collection to a merchant-processor integration project.
 *
 * Guardrail check: this file defines *how a customer would pay*, not an
 * agent action that spends or moves real money — no guardrail in
 * prompt_process.tsx is violated by writing it. Confirming these apps
 * actually deliver funds to the listed inbox/handle remains a human step
 * (see blockers.ts's payment-handle-setup entry) and is not claimed done
 * here.
 */

export type PaymentMethodOption = {
  id: string;
  name: string;
  setupCost: string;
  feePerTransaction: string;
  howToPay: string;
  tradeoffs: string;
  sources: string[];
};

export const paymentMethodOptions: PaymentMethodOption[] = [
  {
    id: "zelle",
    name: "Zelle (bank-to-bank transfer)",
    setupCost: "None beyond enrolling the receiving bank account/email with Zelle, a one-time step already inside most US banking apps.",
    feePerTransaction: "$0 — Zelle does not charge sender or receiver fees; funds move bank-to-bank, typically within minutes.",
    howToPay:
      "Prospect sends $19 via their bank's Zelle feature (or the standalone Zelle app) to duncan.andrew.haywood@gmail.com, with the listing address in the memo/note field.",
    tradeoffs:
      "No fee and fastest settlement of the three, but both sender and receiver need a US bank that participates in Zelle (most major banks do, but not all, and it's not usable by anyone without a US bank account) and it moves money before any dispute process exists — fine for a $19 concierge fee paid after delivery, riskier at higher price points later.",
    sources: [
      "https://www.zellepay.com/how-it-works",
      "https://www.zellepay.com/faq",
    ],
  },
  {
    id: "paypal",
    name: "PayPal (paypal.me link or direct send)",
    setupCost: "None if a personal PayPal account already exists (same email works); a paypal.me/username vanity link is free and optional.",
    feePerTransaction:
      "$0 if the prospect sends as \"friends & family\"; if sent as \"goods & services\" (buyer protection on), PayPal's standard US rate is roughly 2.9% + $0.30, which is about $0.85 on a $19 payment.",
    howToPay:
      "Prospect sends $19 to duncan.andrew.haywood@gmail.com via PayPal, noting the listing address; goods & services is the honest choice for a paid service (adds the small fee above) since friends & family is meant for payments with no purchase attached.",
    tradeoffs:
      "Works for prospects without a US bank/Zelle (PayPal balance, card, or linked bank all work), and goods & services gives the customer real buyer protection on their first $19 purchase from a brand-new concierge service, which is worth more at this trust-building stage than the ~$0.85 fee. Slower than Zelle (can take a day or two to bank-transfer out) and requires both parties to have or create a PayPal account.",
    sources: [
      "https://www.paypal.com/us/webapps/mpp/paypal-fees",
      "https://www.paypal.com/us/cshelp/article/what-are-the-differences-between-sending-money-to-friends-and-family-and-paying-for-goods-and-services-help543",
    ],
  },
  {
    id: "venmo",
    name: "Venmo",
    setupCost: "None if a personal Venmo account already exists.",
    feePerTransaction:
      "$0 for a standard balance/bank-funded personal payment marked as goods & services still carries Venmo's ~1.9% + $0.10 seller fee (about $0.46 on $19); card-funded payments add a further ~3% sender fee.",
    howToPay:
      "Prospect sends $19 to @[Duncan's Venmo handle] (not yet claimed/confirmed — see blockers.ts) noting the listing address, toggled to goods & services.",
    tradeoffs:
      "Lowest goods-and-services fee of the three card/wallet options and a younger-skewing user base that may already have it installed, but unlike Zelle/PayPal there is no existing, confirmed handle tied to duncan.andrew.haywood@gmail.com in this repo yet, and it shares PayPal's US-only, both-sides-need-an-account limitation without a durable link like paypal.me. Ranked third: only worth setting up if a real prospect specifically asks for it.",
    sources: [
      "https://help.venmo.com/hc/en-us/articles/209690068-Venmo-Fees",
    ],
  },
];

export type PaymentDecision = {
  primary: string;
  fallback: string;
  summary: string;
  revisitWhen: string;
};

export const paymentDecision: PaymentDecision = {
  primary: "zelle",
  fallback: "paypal",
  summary:
    "Lead with Zelle (zero fee, fastest, bank-to-bank) since it's the cheapest real option and Duncan's bank almost certainly supports it like the large majority of US banks do; offer PayPal (goods & services) as the fallback for any prospect whose bank doesn't participate in Zelle or who simply prefers PayPal's buyer protection on a first purchase from a new service. Venmo is documented as a distant third option (see paymentMethodOptions) but not offered by default since no handle is confirmed for it yet. Both primary options route to the same already-known real inbox, duncan.andrew.haywood@gmail.com, that outreach-templates.ts and booking-link.ts already use — no new business infrastructure (merchant account, invoicing tool, payment processor integration) needed to take the first paid concierge delivery.",
  revisitWhen:
    "Revisit once volume or price moves past what ad hoc peer-to-peer transfers comfortably support — e.g. multiple deliveries a week, a move to the Agent Pro monthly subscription STRATEGY.md describes, or a prospect who needs a real invoice/receipt for bookkeeping. At that point a real merchant processor (Stripe Payment Links is the standout zero-monthly-fee option — pay-per-transaction, hosted checkout page, real receipts) is the natural next step, not before; premature Stripe onboarding would violate the 'no spend of real money / no paid tools' guardrail for no benefit at $19/listing, one-off volume.",
};

/** Ready-to-paste, single-paragraph payment instructions, addressed to Duncan's known real inbox. Used by pricing-one-pager.tsx's FAQ. */
export function paymentInstructionsText(): string {
  return (
    "Pay after delivery, whichever's easier: Zelle (no fee) or PayPal (goods & services, ~$0.85 fee, " +
    "buyer protection) — both to duncan.andrew.haywood@gmail.com, with the listing address in the memo/note."
  );
}
