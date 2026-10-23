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

// Pull the answer out of a reply, tolerating a code fence or a sentence around
// it, since small local models often add one. Accepts {"lines":[...]}, a bare
// array (qwen2.5:3b answers that way), or a run of loose objects with an id.
export function parseReply(text) {
  const s = String(text ?? "");
  const tries = [];
  const o = [s.indexOf("{"), s.lastIndexOf("}")], a = [s.indexOf("["), s.lastIndexOf("]")];
  if (o[0] !== -1 && o[1] > o[0]) tries.push(s.slice(o[0], o[1] + 1));
  if (a[0] !== -1 && a[1] > a[0]) tries.push(s.slice(a[0], a[1] + 1));
  for (const t of a[0] !== -1 && (o[0] === -1 || a[0] < o[0]) ? tries.reverse() : tries) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v;
      if (Array.isArray(v?.lines)) return v.lines;
    } catch { /* try the next shape */ }
  }
  // Loose objects: scan balanced braces outside strings, keep those with an id.
  const out = [];
  for (let i = 0, depth = 0, start = -1, str = false; i < s.length; i++) {
    const c = s[i];
    if (str) { if (c === "\\") i++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === "{") { if (depth++ === 0) start = i; }
    else if (c === "}" && depth > 0 && --depth === 0) {
      try { const v = JSON.parse(s.slice(start, i + 1)); if (v && typeof v === "object" && "id" in v) out.push(v); } catch { /* skip */ }
    }
  }
  if (out.length) return out;
  if (o[0] === -1 && a[0] === -1) throw new Error("the model did not answer with JSON");
  throw new Error('the model\'s JSON has no "lines" list');
}

// -> { books, source: "model" | "fallback", error?, suggested, dropped }
// mode "fill" (default): only lines the four deterministic layers could not
// suggest an account for go to the model, and a line that has a suggestion is
// never overwritten. mode "replace": every review line goes and the model's
// answer takes over the suggestion. A 3B local model measured worse than the
// rules in "replace" (eval/ai-eval.mjs, README Next), so "fill" is the default.
export async function aiSuggest(config, books, { max = 40, offset = 0, fetch, maxTokens = 3000, mode = "fill" } = {}) {
  const hasOwn = (t) => t.suggestion?.account && t.suggestion.source !== "ai";
  const queue = books.transactions.filter((t) => t.status === "review" && (mode === "replace" || !hasOwn(t))).slice(offset, offset + max);
  const unchanged = () => ({ books, suggested: 0, dropped: 0 });
  if (!queue.length) return { ...unchanged(), source: "fallback", error: mode === "replace" ? "nothing is waiting for review" : "every review line already has a suggestion from the rules, memory or classifier" };
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
