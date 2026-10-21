// Optional fifth layer: a language model suggests accounts for the lines still
// in the review queue, on the user's own key or a model on their own computer
// (byok.mjs is a synced copy of platform/llm/byok.mjs; ai.test.mjs fails if they
// drift). Without one, the four deterministic layers in categorize.mjs are the
// product.
//
// Guard rails, because a bookkeeping error is quiet and expensive:
//  * the model only suggests; nothing it says is posted until a person accepts it;
//  * an answer naming an account that is not in the chart is dropped;
//  * only the review lines' dates, descriptions and amounts are sent, plus the
//    chart of accounts and up to 40 lines the user already confirmed as examples.
import { complete, withFallback } from "./byok.mjs";
import { accountMap, dollars } from "./ledger.mjs";

export const SYSTEM = [
  "You are a careful small-business bookkeeper. For each bank or card line, choose the one account from the chart of accounts it should be posted to.",
  "A positive amount is money into the bank or card account; a negative amount is money out.",
  "Money out is usually an expense, an asset purchase, a loan or card payment (a liability), or an owner draw (equity). Money in is usually income, a loan, an owner contribution or a refund.",
  "Follow the examples of how this business filed past lines when the payee matches.",
  "If you cannot tell, use the uncategorized account and say why in the reason. Never invent an account.",
  'Answer with JSON only, no prose and no code fence: {"lines":[{"id":"...","account":"<code>","confidence":0.0,"reason":"<under 15 words>"}]}',
].join("\n");

export function aiPrompt(books, lines, { examples = 40 } = {}) {
  const map = accountMap(books.accounts);
  const chart = books.accounts.map((a) => `${a.code} ${a.name} (${a.type})`).join("\n");
  const past = books.transactions.filter((t) => t.status === "confirmed").slice(-examples).map((t) => `${dollars(t.cents)} | ${t.desc} => ${t.posted} ${map.get(t.posted)?.name ?? ""}`);
  const rows = lines.map((t) => JSON.stringify({ id: t.id, date: t.date, bank_account: map.get(t.account)?.name, amount: dollars(t.cents), description: t.desc }));
  return [
    `Business: ${books.name || "a small business"}`,
    "Chart of accounts:", chart,
    past.length ? "Lines this business already filed (amount | description => account):" : "",
    ...past,
    "Lines to file:", ...rows,
  ].filter(Boolean).join("\n");
}

// Pull the first JSON object out of a reply, tolerating a code fence or a
// sentence before it, since small local models often add one.
export function parseReply(text) {
  const s = String(text ?? "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("the model did not answer with JSON");
  const obj = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(obj.lines)) throw new Error('the model\'s JSON has no "lines" list');
  return obj.lines;
}

// -> { books, source: "model" | "fallback", error?, suggested, dropped }
export async function aiSuggest(config, books, { max = 40, fetch, maxTokens = 3000 } = {}) {
  const queue = books.transactions.filter((t) => t.status === "review").slice(0, max);
  const unchanged = () => ({ books, suggested: 0, dropped: 0 });
  if (!queue.length) return { ...unchanged(), source: "fallback", error: "nothing is waiting for review" };
  const r = await withFallback(config, unchanged, async (c) => {
    const out = await complete(c, { system: SYSTEM, prompt: aiPrompt(books, queue), maxTokens, fetch });
    const answers = parseReply(out.text);
    const codes = new Set(books.accounts.map((a) => a.code));
    const ids = new Set(queue.map((t) => t.id));
    const next = JSON.parse(JSON.stringify(books));
    let suggested = 0, dropped = 0;
    for (const a of answers) {
      const code = String(a?.account ?? "").trim().split(/\s/)[0];
      if (!ids.has(a?.id) || !codes.has(code)) { dropped++; continue; }
      const t = next.transactions.find((x) => x.id === a.id);
      const confidence = Math.max(0, Math.min(1, Number(a.confidence) || 0));
      t.suggestion = { account: code, confidence, source: "ai", reason: `AI (${out.model}): ${String(a.reason ?? "").slice(0, 160)}`, alternatives: t.suggestion?.account && t.suggestion.account !== code ? [{ account: t.suggestion.account, p: t.suggestion.confidence }] : [] };
      suggested++;
    }
    if (!suggested) throw new Error("the model's answer named no account in your chart");
    return { books: next, suggested, dropped };
  });
  return { ...r.value, source: r.source, error: r.error };
}
