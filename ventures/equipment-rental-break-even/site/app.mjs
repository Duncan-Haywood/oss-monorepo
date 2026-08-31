import { calculate, buildSnapshotText } from "./model.mjs";
import { encodeShare, decodeShare } from "./share.mjs";
const ids = ["currency", "booking", "rental_days", "delivery", "cleaning", "damage", "purchase", "life", "fixed_monthly", "available", "target_margin"];
const $ = (id) => document.getElementById(id);
const values = () => Object.fromEntries(ids.map((id) => [id, id === "currency" ? $(id).value.trim() || "units" : Number($(id).value)]));
const DRAFTS_KEY = "rental-drafts";
let last;
let countedSignature = "";
function render(count = true) {
  try {
    const v = values();
    last = { v, r: calculate(v) };
    const { r } = last;
    const daysShare = r.daysShare;
    const rows = [
      ["Booking-specific costs", `${v.currency} ${r.bookingCosts.toFixed(2)}`],
      ["Ownership recovery per rental day", `${v.currency} ${r.ownershipPerDay.toFixed(2)}`],
      ["Minimum price at expected utilization", `${v.currency} ${r.minimumPrice.toFixed(2)}`],
      ["Price at target contribution margin", `${v.currency} ${r.targetPrice.toFixed(2)}`],
      ["Contribution after booking and ownership costs", `${v.currency} ${r.contribution.toFixed(2)}`, r.contribution >= 0],
      ["Break-even bookings per month", Number.isFinite(r.utilization) ? r.utilization.toFixed(2) : "Not reached", r.utilization <= (v.available / v.rental_days)],
      ["Share of available rental days", Number.isFinite(daysShare) ? `${(daysShare * 100).toFixed(1)}%` : "Not reached", daysShare <= 1],
    ];
    const result = $("result");
    result.replaceChildren();
    const dl = document.createElement("dl");
    rows.forEach(([label, value, positive]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (positive !== undefined) dd.className = positive ? "good" : "bad";
      dl.append(dt, dd);
    });
    result.append(dl);
    const signature = ids.map((id) => String(v[id])).join("|");
    if (count && signature !== countedSignature) {
      usage("calculation");
      countedSignature = signature;
    }
  } catch (e) {
    const error = document.createElement("p");
    error.className = "bad";
    error.textContent = e.message;
    $("result").replaceChildren(error);
  }
}
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
}
async function copyShare() {
  const hash = encodeShare(values());
  const url = `${location.origin}${location.pathname}#${hash}`;
  await writeClipboard(url);
  history.replaceState(null, "", `#${hash}`);
  usage("share_copied");
  $("share-status").textContent = "Share link copied";
  setTimeout(() => { $("share-status").textContent = ""; }, 2500);
}
function usage(event) {
  if (localStorage.getItem("rental-usage-off") === "1" || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
  const data = JSON.parse(localStorage.getItem("rental-usage") || "{}");
  data[event] = (data[event] || 0) + 1;
  localStorage.setItem("rental-usage", JSON.stringify(data));
  showUsage();
}
function showUsage() { const data = JSON.parse(localStorage.getItem("rental-usage") || "{}"); $("usage").textContent = `Local usage: ${data.calculation || 0} calculations, ${data.export || 0} exports. No usage is sent anywhere.`; }
function drafts() { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]"); } catch { return []; } }
function showDrafts() { const select = $("drafts"); select.replaceChildren(new Option("Choose a draft", "")); drafts().forEach((draft) => select.add(new Option(`${draft.name} (${draft.savedAt.slice(0, 10)})`, draft.id))); $("delete-draft").disabled = !select.value; }
function applyDraft(draft) { ids.forEach((id) => { if (draft.values[id] !== undefined) $(id).value = draft.values[id]; }); render(false); }
ids.forEach((id) => $(id).addEventListener("input", () => render(false)));
$("export").addEventListener("click", () => { if (!last) return; const { v, r } = last; const text = buildSnapshotText(v, r, new Date().toISOString()); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "equipment-rental-price-snapshot.txt"; a.click(); URL.revokeObjectURL(a.href); usage("export"); });
$("save-draft").addEventListener("click", () => { if (!last) return; const name = window.prompt("Name this pricing draft:", "Untitled rental"); if (!name?.trim()) return; const saved = drafts().filter((draft) => draft.name !== name.trim()); saved.push({ id: crypto.randomUUID(), name: name.trim().slice(0, 80), savedAt: new Date().toISOString(), values: last.v }); localStorage.setItem(DRAFTS_KEY, JSON.stringify(saved.slice(-20))); showDrafts(); usage("draft_save"); });
$("drafts").addEventListener("change", (event) => { const draft = drafts().find((item) => item.id === event.target.value); if (draft) { applyDraft(draft); usage("draft_load"); } $("delete-draft").disabled = !event.target.value; });
$("delete-draft").addEventListener("click", () => { const id = $("drafts").value; if (!id) return; localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts().filter((draft) => draft.id !== id))); showDrafts(); usage("draft_delete"); });
$("clear-usage").addEventListener("click", () => { localStorage.removeItem("rental-usage"); localStorage.setItem("rental-usage-off", "1"); showUsage(); });
$("copy-share").addEventListener("click", () => { copyShare().catch(() => { $("share-status").textContent = "Copy failed."; }); });
const shared = decodeShare(location.hash);
if (shared) applyDraft({ values: shared });
render(false); showUsage(); showDrafts();
