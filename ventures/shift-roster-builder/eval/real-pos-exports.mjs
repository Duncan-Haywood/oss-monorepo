// Real Square and Toast exports (2026-11-13). Until today `--from-sales` had read Square and Toast layouts only as
// made-up rows under headers written from memory. These public files are the first real ones: three shops' Square
// item-sales exports (one shop's 11 weeks come as 17 date-range files) and one restaurant's Toast ItemSelectionDetails.
// They sit in other people's public GitHub repositories with no licence we could check, so they are not committed:
// this script downloads each, checks its SHA-256 against the copy measured, and prints what --from-sales reads and,
// for the 11-week shop, the backtest. Output: eval/real-pos-exports.out.txt. Customer and staff columns are never printed.
//   node eval/real-pos-exports.mjs
import { createHash } from "node:crypto";
import { demandShifts, readSales, backtestSales } from "../demand.mjs";
import { backtestReport } from "../cli.mjs";

const RAW = "https://raw.githubusercontent.com/";
const SINGLE = [
  ["Square, a print shop (29 lines, 3 days)", "iamrbtm/dfp_os/HEAD/docs/import/items-2022-12-01-2023-01-01.csv", "906cbca151a3322d96bd5ddc87fc28d08ec6d1bd57d6cdcf25107fa065238fb2"],
  ["Square, a Highland-wear shop (1 day; item descriptions over several lines in Notes)", "ksfraser/FA_ImportSquareUp/HEAD/includes/items-2024-08-24-2024-08-25.csv", "87ea11ecadddbfc14682fa8de97a30448fb2cc3efa2218be962553ac375866ee"],
  ["Toast ItemSelectionDetails, a restaurant (1 day)", "we-byte-solutions/TasteBudsLocationDashboard/HEAD/attached_assets/ItemSelectionDetails.csv", "9981df530a6f2ee7c87595d79d85106463bdca3b0a6a682a665140266f2165a7"],
];
const SHOP = "zoetankersley/sunrise_social_club/HEAD/data/raw/";
const PARTS = [
  ["item_sales_may", "2967a854e86d7ce3409742d6fa50e6cef8f202203069801783039553b37cca4b"],
  ["items-2026-06-01-2026-06-12", "35595635713f1171bf26417f087816ef5c01ec97e9f2075abd68fea9c2f2c424"],
  ["items-2026-06-12-2026-06-17", "34bd554e77155c7c63022b81089fdf86fc38d8562774990f9d78ffee2c6deeb2"],
  ["items-2026-06-17-2026-06-21", "9be2e34327009f549647b906b89fb1aab565a3d484d8990caf761b8187bf7410"],
  ["items-2026-06-21-2026-06-30", "d9f21826e36ec2fc111c3a526348754dd02052eed114d9590e21b02b367e746f"],
  ["items-2026-06-30-2026-07-01", "e19229969f49274f463682e2947af2dfcc237c36689de6a332dcfbf0a9eda0d1"],
  ["items-2026-07-01-2026-07-02", "15d1afe78932605238bb0e2b6b9ba6640a5969d27b65075c63ae9f50030c38ba"],
  ["items-2026-07-07-2026-07-08", "3bc0a64cbcb8d79d95210ff4e93bda4e1708f54f060e9cfeb7b026797f319d03"],
  ["items-2026-07-08-2026-07-09", "94de620198626c9c68cd5147a034e269674a26e937b96bcb4f369034a8972950"],
  ["items-2026-07-10-2026-07-15", "e48ce909b67de9b9edd70b7e506357d50a098945cad1140a4cc8fe122104d163"],
  ["items-2026-07-15-2026-07-16", "289158f3a76b6cc825bc78d073b1f725cf947b91f10d100455a1f80e438f2908"],
  ["items-2026-07-18-2026-07-19", "52e1b3497cbce0d1517fd0c49a4ca377e6e919548becd95cfb96928cd99a0545"],
  ["items-2026-07-21-2026-07-22", "6cba2e98275f141094dd10a0fd6ed7ac9a4c101aef66a7babcb03ae78100e6f7"],
  ["items-2026-07-28-2026-07-30", "66ecb2c1472614494dec71483d2ad2db3ba56f7d4931f28c60a808454568f6b2"],
  ["items-2026-08-01-2026-08-02", "53861f6575cf9f5a01719bcfe45c86b327c6b8da84659befdad6b1887f252b66"],
  ["items-2026-08-05-2026-08-06", "0816bdd92d4ec73e86fa773477b1163ac518781707b0c2aa95b6131ed057e907"],
  ["items-2026-08-08-2026-08-09", "3054338b2e7ce99d82e0c8a0c258b9a9509ebd01e443df6d597c53923a23e418"],
];
async function get(path, sha) {
  const b = Buffer.from(await (await fetch(RAW + path)).arrayBuffer());
  const got = createHash("sha256").update(b).digest("hex");
  if (got !== sha) { console.error(`${path}: SHA-256 ${got} is not the copy measured (${sha}).`); process.exit(1); }
  return b.toString("utf8");
}
const read = (text) => { const r = readSales(text); return `${r.rows} rows read, ${r.skipped.length} skipped, refunds ${r.refunds.n}, voids ${r.voids.n}, sales ${r.entries.reduce((a, e) => a + e.amount, 0).toFixed(2)}`; };
for (const [label, path, sha] of SINGLE) {
  const t = await get(path, sha);
  console.log(`== ${label}\n${read(t)}`);
  const d = demandShifts(t, { splh: 60 });
  console.log(d.notes.filter((n) => !n.startsWith("Half-life auto")).join("\n"));
}
const shop = (await Promise.all(PARTS.map(([f, sha]) => get(SHOP + f + ".csv", sha)))).map((t) => t.replace(/\s+$/, "")).join("\n");
console.log(`\n== Square, one shop's 11 weeks as 17 files pasted together\n${read(shop)}`);
console.log(readSales(shop).notes.join("\n"));
// Trading days by week: the shop traded Saturdays throughout, a Thursday and Friday once in June, and Tuesdays and
// Wednesdays from mid-June, so its pattern changed inside the file.
const days = new Map();
for (const e of readSales(shop).entries) days.set(e.key, (days.get(e.key) || 0) + e.amount);
console.log("\nTrading dates (sales): " + [...days].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).map(([k, v]) => `${k} ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(k).getDay()]} ${v.toFixed(0)}`).join(", "));
for (const splh of [60, 120]) {
  console.log(`\n== --backtest --splh ${splh} (the default score: staffing an hour the shop is normally shut counts as over)`);
  process.stdout.write(backtestReport(backtestSales(shop, { splh })));
  console.log(`\n== --backtest --splh ${splh} --score-open-hours (the score before 2026-11-12)`);
  process.stdout.write(backtestReport(backtestSales(shop, { scoreClosed: false, splh })));
}
