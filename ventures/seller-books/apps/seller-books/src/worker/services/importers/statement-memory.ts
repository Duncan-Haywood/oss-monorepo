// What the seller filed each merchant under before, so next month's statement starts with their own
// choices instead of the generic rules. Pure: no DB (the route reads the expenses and passes them in).
//
// Statement descriptions carry store numbers, order ids and processor prefixes that change on every
// line ("SQ *CORNER CAFE 0412", "ULINE *S1234567", "PAYPAL *VENDOO"), so a merchant is keyed by the first
// two words left after dropping processor prefixes and any word with a digit in it. Expenses typed in by
// hand ("Uline") are keyed the same way, so they teach the import too.
//
// The seller's latest choice for a merchant wins: a seller who moved a merchant to another category meant
// to. A learned category always replaces the rule's, and the row starts ticked, except where the rule
// says the line needs a decision each time (a store that sells everything, a payment or transfer): there
// the category is filled in and the row still starts unticked, with the reason.
import type { ExpenseCategory } from "@shared/enums";
import { normDescription, type Suggestion } from "./statement-rules";

/** Card-processor and bank prefixes that say how a charge was paid, not who was paid. */
const NOISE = new Set([
  "PAYPAL",
  "PP",
  "SQ",
  "SQU",
  "SQUARE",
  "TST",
  "SP",
  "POS",
  "DEBIT",
  "PURCHASE",
  "CHECKCARD",
  "CHKCARD",
  "CARD",
  "RECURRING",
  "ACH",
  "VISA",
  "DDA",
]);

/** Kinds where the rule asks for a decision per line, so a learned category does not tick the row. */
const DECIDE_EACH_TIME = new Set(["ambiguous", "transfer"]);

/** "SQ *CORNER CAFE 0412 AUSTIN TX" -> "CORNER CAFE"; null when nothing is left to key on. */
export function merchantKey(description: string): string | null {
  const words = normDescription(description)
    .trim()
    .split(" ")
    .filter((w) => w !== "" && !/\d/.test(w));
  while (words.length > 0 && NOISE.has(words[0] as string)) words.shift();
  if (words.length === 0) return null;
  return words.slice(0, 2).join(" ");
}

export interface LearnedChoice {
  /** The merchant as keyed, e.g. "ULINE". */
  merchant: string;
  category: ExpenseCategory;
  /** How many expenses in the books from this merchant are filed under `category`. */
  count: number;
  /** The date of the latest one. */
  lastDate: string;
}

export interface BookedExpense {
  vendor: string | null;
  category: ExpenseCategory;
  date: string;
}

export type MerchantMemory = Map<string, LearnedChoice>;

/** Each merchant's latest category (by expense date; later in the list wins a tie) and how often it was used. */
export function learnFromBooks(expenses: readonly BookedExpense[]): MerchantMemory {
  const byKey = new Map<string, { latest: BookedExpense; counts: Map<ExpenseCategory, number> }>();
  for (const e of expenses) {
    if (!e.vendor) continue;
    const key = merchantKey(e.vendor);
    if (!key) continue;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { latest: e, counts: new Map([[e.category, 1]]) });
      continue;
    }
    seen.counts.set(e.category, (seen.counts.get(e.category) ?? 0) + 1);
    if (e.date >= seen.latest.date) seen.latest = e;
  }
  const memory: MerchantMemory = new Map();
  for (const [key, { latest, counts }] of byKey) {
    memory.set(key, {
      merchant: key,
      category: latest.category,
      count: counts.get(latest.category) ?? 1,
      lastDate: latest.date,
    });
  }
  return memory;
}

/**
 * The learned choice for a statement line: the merchant's own key first, then, for a merchant typed by
 * hand as one word ("USPS"), any line whose key starts with that word ("USPS PO").
 */
export function recall(memory: MerchantMemory, description: string): LearnedChoice | null {
  const key = merchantKey(description);
  if (!key) return null;
  const exact = memory.get(key);
  if (exact) return exact;
  const first = key.split(" ")[0] as string;
  if (first === key) return null;
  return memory.get(first) ?? null;
}

const label = (c: ExpenseCategory) => c.replace(/_/g, " ");

/** The rule's suggestion with the seller's earlier choice applied, or unchanged when there is none. */
export function applyLearned(s: Suggestion, learned: LearnedChoice | null): Suggestion {
  if (!learned) return s;
  const times = learned.count === 1 ? "an earlier charge" : `${learned.count} earlier charges`;
  const filed = `You filed ${times} from ${learned.merchant} as ${label(learned.category)} (latest ${learned.lastDate}).`;
  if (DECIDE_EACH_TIME.has(s.kind)) {
    return {
      ...s,
      category: learned.category,
      reason: `${filed} ${s.reason ?? ""}`.trim(),
      learned,
    };
  }
  return { ...s, category: learned.category, include: true, reason: filed, learned };
}

// ---------------------------------------------------------------------------------------------------
// Merchants the seller leaves out. A personal streaming subscription or the grocery store shows up on
// every statement; once the seller has left it unticked and asked the page to remember, the next
// statement starts it unticked too, with the reason. Only the merchant key and dates are kept (never the
// description, amount or statement), and only when the seller ticks "Remember" on the save.

export interface LeftOutMerchant {
  merchant: string;
  /** How many statement lines from this merchant the seller has left out. */
  count: number;
  /** The statement date of the latest one. */
  lastDate: string;
}

export type LeftOutMemory = Map<string, LeftOutMerchant>;

/**
 * The merchants to remember from one save's left-out lines, counted per merchant with the latest date.
 * The page sends only lines that started ticked and that the seller unticked: a line the rules already
 * start unticked (inventory, marketplace charges, fuel, stores that sell everything, transfers, lines no
 * rule knows) keeps its own reason, so remembering it would teach nothing.
 */
export function leftOutFromLines(
  lines: readonly { description: string; date: string }[],
): LeftOutMerchant[] {
  const byKey = new Map<string, LeftOutMerchant>();
  for (const l of lines) {
    const key = merchantKey(l.description);
    if (!key) continue;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { merchant: key, count: 1, lastDate: l.date });
    else {
      seen.count++;
      if (l.date > seen.lastDate) seen.lastDate = l.date;
    }
  }
  return [...byKey.values()];
}

/** The remembered left-out entry for a statement line, by the same key rules as `recall`. */
export function recallLeftOut(memory: LeftOutMemory, description: string): LeftOutMerchant | null {
  const key = merchantKey(description);
  if (!key) return null;
  return memory.get(key) ?? null;
}

/**
 * Starts the line unticked when the seller's latest decision for its merchant was to leave it out: a
 * left-out date after the latest expense filed from it (a seller who later files one meant to). A tie
 * goes to the filed expense. Only a line that would otherwise start ticked changes; one the rules or the
 * seller's filing already leave unticked keeps its own reason.
 */
export function applyLeftOut(s: Suggestion, left: LeftOutMerchant | null): Suggestion {
  if (!left || !s.include) return s;
  if (s.learned && s.learned.lastDate >= left.lastDate) return s;
  const times = left.count === 1 ? "an earlier charge" : `${left.count} earlier charges`;
  return {
    ...s,
    include: false,
    reason: `You left out ${times} from ${left.merchant} (latest ${left.lastDate}). Tick it if this one was for the business.`,
    leftOut: left,
  };
}
