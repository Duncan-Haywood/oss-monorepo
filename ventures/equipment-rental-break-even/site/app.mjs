const ids = ["currency", "booking", "rental_days", "delivery", "cleaning", "damage", "purchase", "life", "fixed_monthly", "available", "target_margin"];
const $ = (id) => document.getElementById(id);
const values = () => Object.fromEntries(ids.map((id) => [id, id === "currency" ? $(id).value.trim() || "units" : Number($(id).value)]));
function calculate(v) {
  if (Object.entries(v).some(([key, value]) => key !== "currency" && (!Number.isFinite(value) || value < 0))) throw new Error("Enter non-negative numbers in every field.");
  if (!v.booking || !v.rental_days || !v.life || !v.available || v.target_margin >= 100) throw new Error("Booking, rental days, recovery life, availability, and margin must be valid.");
  const bookingCosts = v.delivery + v.cleaning + v.damage;
  const ownershipPerDay = v.purchase / v.life;
  const contribution = v.booking - bookingCosts - ownershipPerDay * v.rental_days;
  const minimumPrice = bookingCosts + ownershipPerDay * v.rental_days + v.fixed_monthly / (v.available / v.rental_days);
  const targetPrice = (bookingCosts + ownershipPerDay * v.rental_days) / (1 - v.target_margin / 100);
  const monthlyContribution = v.booking - bookingCosts;
  const utilization = monthlyContribution > 0 ? (v.fixed_monthly + v.purchase / (v.life / v.rental_days)) / monthlyContribution : Infinity;
  return { bookingCosts, ownershipPerDay, contribution, minimumPrice, targetPrice, utilization };
}
let last;
function render(count = true) { try { const v = values(); last = { v, r: calculate(v) }; const { r } = last; $("result").innerHTML = `<dl><dt>Booking-specific costs</dt><dd>${v.currency} ${r.bookingCosts.toFixed(2)}</dd><dt>Ownership recovery per rental day</dt><dd>${v.currency} ${r.ownershipPerDay.toFixed(2)}</dd><dt>Minimum price at expected utilization</dt><dd>${v.currency} ${r.minimumPrice.toFixed(2)}</dd><dt>Price at target contribution margin</dt><dd>${v.currency} ${r.targetPrice.toFixed(2)}</dd><dt>Contribution after booking and ownership costs</dt><dd class="${r.contribution >= 0 ? "good" : "bad"}">${v.currency} ${r.contribution.toFixed(2)}</dd><dt>Break-even utilization</dt><dd class="${r.utilization <= 1 ? "good" : "bad"}">${Number.isFinite(r.utilization) ? (r.utilization * 100).toFixed(1) + "%" : "Not reached"}</dd></dl>`; if (count) usage("calculation"); } catch (e) { $("result").innerHTML = `<p class="bad">${e.message}</p>`; } }
function usage(event) { if (localStorage.getItem("rental-usage-off") === "1") return; const data = JSON.parse(localStorage.getItem("rental-usage") || "{}"); data[event] = (data[event] || 0) + 1; localStorage.setItem("rental-usage", JSON.stringify(data)); showUsage(); }
function showUsage() { const data = JSON.parse(localStorage.getItem("rental-usage") || "{}"); $("usage").textContent = `Local usage: ${data.calculation || 0} calculations, ${data.export || 0} exports. No usage is sent anywhere.`; }
ids.forEach((id) => $(id).addEventListener("input", () => render(false)));
$("export").addEventListener("click", () => { if (!last) return; const { v, r } = last; const text = `Equipment Rental Break-Even\nBooking price: ${v.currency} ${v.booking}\nMinimum price: ${v.currency} ${r.minimumPrice.toFixed(2)}\nTarget-margin price: ${v.currency} ${r.targetPrice.toFixed(2)}\nBreak-even utilization: ${Number.isFinite(r.utilization) ? (r.utilization * 100).toFixed(1) + "%" : "Not reached"}\nGenerated: ${new Date().toISOString()}`; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "equipment-rental-price-snapshot.txt"; a.click(); URL.revokeObjectURL(a.href); usage("export"); });
$("clear-usage").addEventListener("click", () => { localStorage.removeItem("rental-usage"); localStorage.setItem("rental-usage-off", "1"); showUsage(); });
render(false); showUsage();
