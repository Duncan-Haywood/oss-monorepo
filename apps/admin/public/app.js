// Owner Console SPA. No build step, no dependencies. Every value is written with textContent (no
// innerHTML), so customer names and emails can never inject markup. null renders as "—" with a
// "not measured" tooltip; it is never shown as 0.

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat(Number.POSITIVE_INFINITY)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const NOT_MEASURED = "not measured";
const fmtInt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US"));
const ZERO_DEC = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"]);
function fmtMoney(m) {
  if (!m) return "—";
  const z = ZERO_DEC.has(m.currency);
  const v = z ? m.amountMinor : m.amountMinor / 100;
  return `${m.currency} ${v.toLocaleString("en-US", { minimumFractionDigits: z ? 0 : 2, maximumFractionDigits: z ? 0 : 2 })}`;
}
const fmtMoneyList = (list) => (list?.length ? list.map(fmtMoney).join(" · ") : "none recorded");
const fmtMicros = (n) => (n === null || n === undefined ? "—" : `USD ${(n / 1e6).toFixed(2)}`);
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") : "—");

function partial(p, fmt = fmtInt) {
  if (!p || p.value === null) return { text: "—", note: NOT_MEASURED };
  return {
    text: fmt(p.value),
    note: p.unmeasuredIn.length ? `not measured in: ${p.unmeasuredIn.join(", ")}` : "",
  };
}

function tile(label, value, note) {
  return h(
    "div",
    { class: "tile", title: note || null },
    h("div", { class: "k" }, label),
    h("div", { class: "v" }, value),
    note ? h("div", { class: "n" }, note) : null,
  );
}

function spark(byDay) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", `0 0 ${Math.max(byDay.length, 1) * 4} 36`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  const total = byDay.reduce((n, d) => n + d.total, 0);
  svg.setAttribute("aria-label", `${total} sign-ups over ${byDay.length} days`);
  const max = Math.max(1, ...byDay.map((d) => d.total));
  byDay.forEach((d, i) => {
    const hgt = (d.total / max) * 34;
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(i * 4));
    r.setAttribute("y", String(36 - hgt));
    r.setAttribute("width", "3");
    r.setAttribute("height", String(hgt));
    const t = document.createElementNS(NS, "title");
    t.textContent = `${d.day}: ${d.total}${d.verified === null ? "" : ` (${d.verified} verified/confirmed)`}`;
    r.append(t);
    svg.append(r);
  });
  return svg;
}

function row(k, v, title) {
  return [h("dt", {}, k), h("dd", { title: title || null }, v)];
}

function productCard(p) {
  if (!p.ok) {
    return h(
      "div",
      { class: "card down" },
      h("h3", {}, p.name),
      h("p", { class: "err" }, `Could not read: ${p.error}`),
    );
  }
  const m = p.metrics;
  if (m.kind === "early_access") {
    return h(
      "div",
      { class: "card" },
      h("h3", {}, p.name, " ", h("span", { class: "pill" }, "early access")),
      h(
        "dl",
        {},
        row("Sign-ups", fmtInt(m.total)),
        row("Confirmed", fmtInt(m.confirmed), m.confirmed === null ? NOT_MEASURED : null),
        row("Unsubscribed", fmtInt(m.unsubscribed), m.unsubscribed === null ? NOT_MEASURED : null),
        row(`Last ${m.windowDays} days`, fmtInt(m.lastWindow)),
        m.bySource.slice(0, 4).map((s) => row(`· ${s.source}`, fmtInt(s.count))),
      ),
      spark(m.byDay),
    );
  }
  const mrp = p.mrp;
  return h(
    "div",
    { class: "card" },
    h("h3", {}, p.name),
    h(
      "dl",
      {},
      row("Sign-ups (all time)", fmtInt(m.signups.total)),
      row("  verified / not", `${fmtInt(m.signups.verified)} / ${fmtInt(m.signups.unverified)}`),
      row(`Sign-ups, last ${m.windowDays} days`, fmtInt(m.signups.lastWindow)),
      row(
        "Orgs / active",
        `${fmtInt(m.orgs.total)} / ${fmtInt(m.orgs.active)}`,
        m.orgs.activeDefinition,
      ),
      row("Trials now", fmtInt(m.trials.current), m.trials.note),
      row(
        "Trials started / converted / expired",
        `${fmtInt(m.trials.startedInWindow)} / ${fmtInt(m.trials.converted)} / ${fmtInt(m.trials.expired)}`,
        m.trials.note,
      ),
      row("Paid subscriptions", fmtInt(m.subscriptions.paid)),
      m.subscriptions.byPlan.map((b) => row(`· ${b.planKey} (${b.status})`, fmtInt(b.count))),
      row(
        "MRR",
        fmtMoneyList(m.mrr.byCurrency),
        `${m.mrr.subscriptionsCounted} priced, ${m.mrr.subscriptionsUnpriced} without a recorded price`,
      ),
      row(
        "LLM spend this month",
        m.llmSpend ? fmtMicros(m.llmSpend.monthToDateMicros) : "—",
        m.llmSpend ? null : NOT_MEASURED,
      ),
      row(
        "MRP so far",
        mrp && mrp.amountMinor !== null
          ? fmtMoney({ currency: "USD", amountMinor: mrp.amountMinor })
          : "—",
        mrp?.note,
      ),
      row(
        "Cancellations / scheduled",
        `${fmtInt(m.cancellations.inWindow)} / ${fmtInt(m.cancellations.scheduled)}`,
      ),
      row(
        "Failed payments / past due",
        `${fmtInt(m.failedPayments.inWindow)} / ${fmtInt(m.failedPayments.pastDueNow)}`,
        m.failedPayments.inWindow === null
          ? "failed-payment events not received (Paddle destination does not send transaction events)"
          : null,
      ),
    ),
    spark(m.signups.byDay),
  );
}

function table(headers, rows, empty) {
  if (!rows.length) return h("p", { class: "muted" }, empty);
  return h(
    "div",
    { class: "tablewrap" },
    h(
      "table",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          headers.map((x) => h("th", {}, x)),
        ),
      ),
      h("tbody", {}, rows),
    ),
  );
}

function render(me, d) {
  const t = d.totals;
  const main = $("main");
  main.replaceChildren();
  const ver = partial(t.verified);
  const act = partial(t.activeOrgs);
  const llm = partial(t.llmSpendMonthToDateMicros, fmtMicros);
  const fail = partial(t.failedPaymentsInWindow);
  const conf = partial(t.earlyAccess.confirmed);
  const mrpNote = t.mrpSoFar.missingIn.length
    ? `blank: costs not measured in ${t.mrpSoFar.missingIn.join(", ")}`
    : "MRR − measured LLM spend this month";

  if (d.unreadable.length) {
    main.append(
      h(
        "div",
        { class: "warnbox" },
        `Not read, so not in any total: ${d.unreadable.map((u) => `${u.name} (${u.error})`).join("; ")}`,
      ),
    );
  }
  if (!me.digest.willSend) {
    main.append(
      h(
        "p",
        { class: "muted" },
        `Daily digest: off (${me.digest.enabled ? "no email sender configured" : "DIGEST_ENABLED is not on"}).`,
      ),
    );
  }
  main.append(
    h("h2", {}, `All products · last ${d.windowDays} days`),
    h(
      "div",
      { class: "tiles" },
      tile("Sign-ups (window)", fmtInt(t.signupsInWindow), `${fmtInt(t.signupsTotal)} all time`),
      tile("Verified accounts", ver.text, ver.note),
      tile("Orgs / active", `${fmtInt(t.orgs)} / ${act.text}`, act.note),
      tile("Paid subscriptions", fmtInt(t.paidSubscriptions)),
      tile(
        "MRR",
        fmtMoneyList(t.mrr),
        t.mrrUnpricedSubscriptions
          ? `${t.mrrUnpricedSubscriptions} paid without a recorded price (not counted)`
          : "from Paddle webhooks",
      ),
      tile(
        "MRP so far",
        t.mrpSoFar.amountMinor === null
          ? "—"
          : fmtMoney({ currency: "USD", amountMinor: t.mrpSoFar.amountMinor }),
        mrpNote,
      ),
      tile("LLM spend this month", llm.text, llm.note),
      tile(
        "Trials now / started",
        `${fmtInt(t.trialsCurrent)} / ${fmtInt(t.trialsStartedInWindow)}`,
        `${fmtInt(t.trialsConverted)} converted, ${fmtInt(t.trialsExpired)} expired (all time, recorded)`,
      ),
      tile(
        "Cancellations",
        fmtInt(t.cancellationsInWindow),
        `${fmtInt(t.cancellationsScheduled)} scheduled at period end`,
      ),
      tile("Past due / failed payments", `${fmtInt(t.pastDueNow)} / ${fail.text}`, fail.note),
      tile(
        "Early access",
        fmtInt(t.earlyAccess.total),
        `${conf.text} confirmed · ${fmtInt(t.earlyAccess.inWindow)} in window`,
      ),
    ),
    h("h2", {}, "Products"),
    h("div", { class: "cards" }, d.products.map(productCard)),
    h("h2", {}, "Recent sign-ups"),
    table(
      ["When (UTC)", "Product", "Who", "Email", "Plan / source"],
      d.feed.map((f) =>
        h(
          "tr",
          {},
          h("td", {}, fmtDate(f.at)),
          h("td", {}, f.productName),
          h(
            "td",
            {},
            f.kind === "account" ? `${f.label}${f.name ? ` (${f.name})` : ""}` : (f.name ?? "—"),
          ),
          h("td", {}, f.email ?? "—"),
          h("td", {}, f.planKey ?? f.source ?? "—"),
        ),
      ),
      "No sign-ups returned.",
    ),
    h("h2", {}, "Trials"),
    table(
      ["Started (UTC)", "Product", "Org", "Owner", "Plan", "Status"],
      d.trials.map((a) =>
        h(
          "tr",
          {},
          h("td", {}, fmtDate(a.trialStartedAt)),
          h("td", {}, a.productName),
          h("td", {}, a.orgName),
          h("td", {}, a.owner ? `${a.owner.name ?? ""} <${a.owner.email}>` : "—"),
          h("td", {}, a.planKey ?? "—"),
          h("td", {}, a.status ?? "—"),
        ),
      ),
      "No trials recorded.",
    ),
    h("h2", {}, "Churn and payment problems"),
    table(
      ["Canceled (UTC)", "Product", "Org", "Owner", "Plan", "Status", "MRR"],
      d.churn.map((a) =>
        h(
          "tr",
          {},
          h("td", {}, fmtDate(a.canceledAt)),
          h("td", {}, a.productName),
          h("td", {}, a.orgName),
          h("td", {}, a.owner ? `${a.owner.name ?? ""} <${a.owner.email}>` : "—"),
          h("td", {}, a.planKey ?? "—"),
          h("td", {}, `${a.status ?? "—"}${a.cancelAtPeriodEnd ? " (cancels at period end)" : ""}`),
          h("td", { class: "num" }, fmtMoney(a.mrr)),
        ),
      ),
      "No cancellations or past-due subscriptions.",
    ),
    h("p", { class: "muted" }, `Generated ${fmtDate(d.generatedAt)} UTC.`),
  );
}

async function getJson(path) {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

async function load() {
  const main = $("main");
  main.replaceChildren(h("p", { class: "muted" }, "Loading…"));
  try {
    const me = await getJson("/api/me");
    $("who").textContent = me.email;
    const d = await getJson(`/api/dashboard?days=${encodeURIComponent($("days").value)}`);
    render(me, d);
  } catch (e) {
    main.replaceChildren(h("p", { class: "err" }, `Could not load: ${e.message}`));
  }
}

$("refresh").addEventListener("click", load);
$("days").addEventListener("change", load);
load();
