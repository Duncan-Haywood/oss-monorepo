// Weekly digest and churn alert, posted to a Slack- or Discord-compatible
// incoming webhook. Off unless ALERT_WEBHOOK_URL is set. The webhook is the
// deployer's own; nothing is sent anywhere else.
import { formatMoney } from "./metrics.mjs";

const pc = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export function buildDigest({ company, summary, currency }) {
  if (!summary) return null;
  const m = (v) => formatMoney(v, currency);
  const r = summary.rates;
  const lines = [
    `${company || "Your company"}: MRR ${m(summary.mrr)} (${summary.growthPct == null ? "no prior month" : `${summary.growthPct >= 0 ? "+" : ""}${pc(summary.growthPct)} vs last month`}), ${summary.customers} customers, ARR ${m(summary.arr)}`,
    `${summary.month} net new: ${summary.netNew >= 0 ? "+" : "-"}${m(Math.abs(summary.netNew))}`,
    `${r.basis}: logo churn ${pc(r.logoChurn)}, NRR ${pc(r.nrr)}, GRR ${pc(r.grr)}, quick ratio ${r.quickRatio == null ? "n/a" : r.quickRatio.toFixed(2)}`,
  ];
  return lines.join("\n");
}

// Churn alert: this month's churned MRR has grown past `thresholdPct` of the
// month's starting MRR, and past what the last alert already reported.
export function churnAlert({ company, months, currency, alerted, thresholdPct = 0.05 }) {
  const cur = months[months.length - 1];
  if (!cur || !(cur.startMrr > 0)) return null;
  const share = cur.churn / cur.startMrr;
  if (share < thresholdPct) return null;
  if (alerted && alerted.month === cur.month && alerted.churn >= cur.churn) return null;
  return {
    month: cur.month, churn: cur.churn,
    text: `${company || "Your company"}: ${formatMoney(cur.churn, currency)} MRR churned so far in ${cur.month} (${pc(share)} of the starting ${formatMoney(cur.startMrr, currency)}).`,
  };
}

export const validWebhook = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

export async function post(url, text, fetchImpl = fetch) {
  // `text` is Slack's field, `content` is Discord's; each ignores the other.
  const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) });
  if (!r.ok) throw new Error(`webhook returned ${r.status}`);
}

// Called after every sync. cfg: {state, save, webhook, company, now, digestDays, churnAlertPct, fetch}
export async function notify(cfg, months) {
  if (!cfg.webhook || !months.length) return { digest: false, alert: false };
  const st = cfg.state; const currency = st.currency || "usd";
  const out = { digest: false, alert: false };
  const a = churnAlert({ company: cfg.company, months, currency, alerted: st.alerted, thresholdPct: cfg.churnAlertPct });
  if (a) { await post(cfg.webhook, a.text, cfg.fetch); st.alerted = { month: a.month, churn: a.churn }; out.alert = true; }
  const every = (cfg.digestDays ?? 7) * 86400000;
  if (every > 0 && cfg.now() - (st.lastDigestAt || 0) >= every) {
    const { summarize } = await import("./metrics.mjs");
    await post(cfg.webhook, buildDigest({ company: cfg.company, summary: summarize(months), currency }), cfg.fetch);
    st.lastDigestAt = cfg.now(); out.digest = true;
  }
  if (out.alert || out.digest) cfg.save();
  return out;
}
