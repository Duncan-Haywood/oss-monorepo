// Two sites in one sales export, planned as one shop and each alone (2026-11-13). The rows are the made-up fortnight
// of locations.test.mjs (real Square header; Main St trades 7-15 daily, Harbour 11-19 Fri-Sun). Output:
// eval/two-site-demo.out.txt.   node eval/two-site-demo.mjs
import { demandShifts } from "../demand.mjs";
const SQUARE_HEAD = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type";
const sq = (date, time, net, loc, item = "Latte") => `${date},${time},Eastern Time (US & Canada),Coffee,${item},1,Regular,,,${net},$0.00,${net},$0.50,T${time},P${time},iPad,,,Payment,${loc},,,,,,,Physical Item`;

// Two weeks: Main St open 7-15 every day busy all day; Harbour open 11-19 on Fri-Sun only.
function twoShops() {
  const rows = [SQUARE_HEAD];
  for (let d = 2; d <= 15; d++) {
    const date = `2026-11-${String(d).padStart(2, "0")}`;
    const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    for (let h = 7; h < 15; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:10:00`, "$130.00", "Main St"));
    if (wd >= 4) for (let h = 11; h < 19; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:20:00`, "$50.00", "Harbour"));
  }
  return rows.join("\n");
}

for (const [label, location] of [["As one shop (before)", undefined], ["Main St alone", "Main St"], ["Harbour alone", "Harbour"]]) {
  const r = demandShifts(twoShops(), { splh: 60, location, halfLife: "none" });
  console.log(`== ${label}: ${r.needed} person-hours needed, ${r.scheduled} scheduled\n${r.shiftsText}\n`);
}
