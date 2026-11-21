// P6 expenses (PROJCOST) through Microsoft Project XML and back.
//
// msproject.mjs writes each expense as an assignment of a cost resource (one
// per expense name, the cost category as its Group); p6xer.mjs writes each
// cost resource assignment back as an expense. This check sends XER files
// XER -> Project XML -> XER and compares every expense, matched by activity
// ID and expense name: budgeted, actual and remaining cost (to the cent),
// category, accrual (cost_load_type), vendor, PO number, quantity and unit,
// and description. Two expenses of one name on one activity become one
// assignment in Project (it allows one per resource per task), so they are
// compared as their sum, and their text fields are not compared.
//
// No public XER found carries P6-written expenses (2026-11-21: none of the
// six in eval/cpm-vs-p6-2026-11-19.md; the one public file with PROJCOST rows
// is written by a generator, autoConst-boq-schedule). So with --plant N,
// files with no expenses get them planted from a seed: on N activities
// (seeded pick), one or two expenses with a category, accrual, costs that fit
// the activity's status, and, on some, a vendor, PO number, quantity and
// description; one in twenty repeats a name already on its activity.
//
//   node eval/expenses-check.mjs <dir-or-files...> [--plant N] [--seed S] [--out dir] [--json out.json]
//   node eval/expenses-check.mjs --mspdi <dir> [--json out.json]
//
// --mspdi: the other way in. Every Microsoft Project XML file under <dir>
// (MPXJ's test corpus; no file there has a cost resource or a fixed cost)
// gets, from a seed, a cost resource (Group, AccrueAt) assigned to one leaf
// task in four with a cost, an actual cost and, on half, a baseline cost,
// and a fixed cost on one leaf task in ten; p6xer.mjs must write one expense
// per assignment and per fixed cost, budget = baseline cost where set, and
// pass its own P6 import checks.
//
// --out writes each Project XML and the XER read back from it, for
// eval/expenses-mpxj.py (MPXJ, an independent reader of both formats).
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const mspdiDir = opt("--mspdi");
const plant = Number(opt("--plant") || 0), seed0 = Number(opt("--seed") || 1), outDir = opt("--out"), jsonOut = opt("--json");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--plant", "--seed", "--out", "--json", "--mspdi"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
if (outDir) mkdirSync(outDir, { recursive: true });

// a small seeded generator (mulberry32)
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const CATS = ["Materials", "Subcontract", "Equipment rental", "Permits and fees", "Travel"];
const NAMES = ["Concrete supply", "Rebar", "Crane hire", "Building permit", "Scaffold", "Skip bins", "Survey", "Testing lab", "Glazing package", "Site security"];
const VENDORS = ["Acme Ready-Mix", "Northside Steel, Inc.", 'O\'Brien "Big Lift" Cranes', "City of Springfield", "Delta Survey Ltd"];
const UNITS = ["m3", "t", "day", "ea", "m2"];
const LOADS = ["CL_Uniform", "CL_Start", "CL_End"];

function plantExpenses(T, pid, n, seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const cents = (x) => Math.round(x * 100) / 100;
  T.COSTTYPE = CATS.map((c, k) => ({ cost_type_id: String(9001 + k), seq_num: String(k * 10), cost_type: c }));
  const acts = T.TASK.filter((t) => t.proj_id === pid && t.task_type !== "TT_WBS");
  const chosen = [];
  const pool = [...acts];
  for (let k = 0; k < Math.min(n, pool.length); k++) chosen.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  T.PROJCOST = [];
  for (const t of chosen) {
    const names = [];
    const howMany = r() < 0.3 ? 2 : 1;
    for (let j = 0; j < howMany; j++) {
      const name = names.length && r() < 0.05 * 2 ? names[0] : pick(NAMES.filter((x) => !names.includes(x)));
      names.push(name);
      const target = cents(100 + r() * 49900);
      const status = t.status_code || "TK_NotStart";
      const act = status === "TK_Complete" ? cents(target * (0.8 + r() * 0.4)) : status === "TK_Active" ? cents(target * r()) : 0;
      const remain = status === "TK_Complete" ? 0 : cents(Math.max(0, target - act + (r() < 0.2 ? target * 0.1 : 0)));
      const qty = r() < 0.4 ? Math.round(1 + r() * 400) : 0;
      T.PROJCOST.push({
        cost_item_id: String(70000 + T.PROJCOST.length), acct_id: "", pobs_id: "", cost_type_id: r() < 0.85 ? pick(T.COSTTYPE).cost_type_id : "",
        proj_id: pid, task_id: t.task_id, cost_name: name, po_number: r() < 0.3 ? `PO-${Math.floor(r() * 90000) + 10000}` : "",
        vendor_name: r() < 0.4 ? pick(VENDORS) : "", act_cost: String(act), cost_per_qty: qty ? String(Math.round((target / qty) * 10000) / 10000) : String(target),
        remain_cost: String(remain), target_cost: String(target), cost_load_type: pick(LOADS), auto_compute_act_flag: "N",
        target_qty: qty ? String(qty) : "1", qty_name: qty ? pick(UNITS) : "", cost_descr: r() < 0.3 ? `Allowance per bid ${Math.floor(r() * 900) + 100}, incl. delivery` : "", contract_manager_import: "",
      });
    }
  }
  return chosen.length;
}

if (mspdiDir) {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.xml$/i.test(f) ? [p] : []; });
  const rows = [];
  let n = 0;
  for (const f of walk(mspdiDir).sort()) {
    const text = readFileSync(f, "utf8");
    if (!/schemas\.microsoft\.com\/project/.test(text.slice(0, 3000))) continue;
    const r = rng(seed0 + n++);
    // leaf tasks: a UID, no Summary 1, not the project summary (UID 0)
    const tasks = [...text.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map((m) => m[1]);
    const leaves = tasks.filter((t) => !/<Summary>1<\/Summary>/.test(t) && !/<UID>0<\/UID>/.test(t) && /<UID>\d+<\/UID>/.test(t) && !/<IsNull>1<\/IsNull>/.test(t)).map((t) => /<UID>(\d+)<\/UID>/.exec(t)[1]);
    if (!leaves.length) continue;
    const accrue = 1 + Math.floor(r() * 3);
    const asg = [], fixed = new Map();
    let target = 0, actual = 0, remaining = 0;
    for (const uid of leaves) {
      if (r() < 0.25) {
        const cost = Math.round(100 + r() * 99900) * 100, act = r() < 0.3 ? Math.round(cost * r()) : 0, base = r() < 0.5 ? Math.round(cost * (0.8 + r() * 0.4)) : null;
        asg.push(`<Assignment><UID>${900000 + asg.length}</UID><TaskUID>${uid}</TaskUID><ResourceUID>999999</ResourceUID><Cost>${cost}</Cost><ActualCost>${act}</ActualCost><RemainingCost>${cost - act}</RemainingCost>${base !== null ? `<Baseline><Number>0</Number><Cost>${base}</Cost></Baseline>` : ""}</Assignment>`);
        target += base ?? cost; actual += act; remaining += cost - act;
      }
      if (r() < 0.1) fixed.set(uid, Math.round(100 + r() * 9900) * 100);
    }
    let x = text.replace(/<Task>([\s\S]*?)<\/Task>/g, (m, body) => {
      const uid = /<UID>(\d+)<\/UID>/.exec(body)?.[1];
      // Project writes <FixedCost>0</FixedCost> and an accrual on every task: replace them
      if (!fixed.has(uid)) return m;
      const b2 = body.replace(/<FixedCost>[^<]*<\/FixedCost>/g, "").replace(/<FixedCostAccrual>[^<]*<\/FixedCostAccrual>/g, "");
      return `<Task>${b2}<FixedCost>${fixed.get(uid)}</FixedCost><FixedCostAccrual>2</FixedCostAccrual></Task>`;
    });
    const res = `<Resource><UID>999999</UID><ID>999999</ID><Name>Planted expense</Name><Type>2</Type><Group>Materials</Group><AccrueAt>${accrue}</AccrueAt></Resource>`;
    x = /<Resources>/.test(x) ? x.replace("</Resources>", `${res}</Resources>`) : x.replace("</Tasks>", `</Tasks><Resources>${res}</Resources>`);
    x = /<Assignments>/.test(x) ? x.replace("</Assignments>", `${asg.join("")}</Assignments>`) : x.replace("</Resources>", `</Resources><Assignments>${asg.join("")}</Assignments>`);
    let out2;
    try { out2 = p6XerText(x); } catch (e) { rows.push({ file: basename(f), error: e.message }); continue; }
    const P = out2.xer.tables.PROJCOST || [];
    const fromRes = P.filter((c) => c.cost_name === "Planted expense"), fromFixed = P.filter((c) => c.cost_name === "Fixed cost");
    const sum = (a, k) => Math.round(a.reduce((s2, c) => s2 + Number(c[k]) * 100, 0));
    const fixedSum = [...fixed.values()].reduce((a, b) => a + b, 0);
    rows.push({
      file: f.slice(mspdiDir.length + 1), assignments: asg.length, expenses: fromRes.length, fixed: fixed.size, fixedExpenses: fromFixed.length,
      target: sum(fromRes, "target_cost") === target, actual: sum(fromRes, "act_cost") === actual, remaining: sum(fromRes, "remain_cost") === remaining,
      fixedTotal: sum(fromFixed, "target_cost") === fixedSum, fixedActualPlusRemaining: sum(fromFixed, "act_cost") + sum(fromFixed, "remain_cost") === fixedSum,
      accrual: fromRes.every((c) => c.cost_load_type === ["", "CL_Start", "CL_End", "CL_Uniform"][accrue]), category: fromRes.every((c) => out2.xer.tables.COSTTYPE?.find((t) => t.cost_type_id === c.cost_type_id)?.cost_type === "Materials"),
      problems: p6Problems(out2.xer.tables).length,
    });
  }
  const ok = rows.filter((r) => !r.error);
  const all = (k) => ok.filter((r) => r[k] === true).length;
  const summary = {
    files: rows.length, errors: rows.length - ok.length, assignments: ok.reduce((a, r) => a + r.assignments, 0), expenses: ok.reduce((a, r) => a + r.expenses, 0),
    fixed: ok.reduce((a, r) => a + r.fixed, 0), fixedExpenses: ok.reduce((a, r) => a + r.fixedExpenses, 0),
    target: all("target"), actual: all("actual"), remaining: all("remaining"), fixedTotal: all("fixedTotal"), fixedActualPlusRemaining: all("fixedActualPlusRemaining"), accrual: all("accrual"), category: all("category"),
    withProblems: ok.filter((r) => r.problems).length,
  };
  console.log(JSON.stringify(summary));
  for (const r of rows.filter((r) => r.error || r.problems)) console.log(`  ${r.file}: ${r.error || `${r.problems} problem(s)`}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 1) + "\n");
  process.exit(0);
}

const c2 = (x) => Math.round((Number(x) || 0) * 100);
const out = [];
for (const f of files) {
  const X = parseXer(decodeXer(readFileSync(f)));
  const T = X.tables;
  // the project with the most activities (as msproject.mjs picks by default)
  const byProj = new Map();
  for (const t of T.TASK) byProj.set(t.proj_id, (byProj.get(t.proj_id) || 0) + 1);
  const pid = [...byProj].sort((a, b) => b[1] - a[1])[0][0];
  let planted = 0;
  const realRows = (T.PROJCOST || []).filter((c) => c.proj_id === pid).length;
  if (!realRows && plant) planted = plantExpenses(T, pid, plant, seed0 + out.length);
  const conv = mspdiText(X, { projId: pid });
  const back = p6XerText(conv.xml);
  const problems = p6Problems(back.xer.tables);
  if (outDir) {
    const stem = basename(f).replace(/\.xer$/i, "");
    writeFileSync(join(outDir, `${stem}.source.xer`), xerText(X));
    writeFileSync(join(outDir, `${stem}.xml`), conv.xml);
    writeFileSync(join(outDir, `${stem}.back.xer`), back.bytes);
  }
  const code = new Map(T.TASK.map((t) => [t.task_id, t.task_code]));
  const cat = new Map((T.COSTTYPE || []).map((c) => [c.cost_type_id, c.cost_type]));
  const bcode = new Map(back.xer.tables.TASK.map((t) => [t.task_id, t.task_code]));
  const bcat = new Map((back.xer.tables.COSTTYPE || []).map((c) => [c.cost_type_id, c.cost_type]));
  const group = (rows, codeOf, catOf) => {
    const m = new Map();
    for (const c of rows) {
      const k = `${codeOf.get(c.task_id)}|${(c.cost_name || "").trim() || "Expense"}`;
      const g = m.get(k) || { n: 0, target: 0, act: 0, remain: 0, rows: [] };
      g.n++; g.target += c2(c.target_cost); g.act += c2(c.act_cost); g.remain += c2(c.remain_cost); g.rows.push(c);
      g.cat = catOf.get(c.cost_type_id) || ""; g.load = c.cost_load_type;
      m.set(k, g);
    }
    return m;
  };
  const src = (T.PROJCOST || []).filter((c) => c.proj_id === pid && conv.taskUid.has(c.task_id));
  const A = group(src, code, cat), B = group(back.xer.tables.PROJCOST || [], bcode, bcat);
  const fields = { matched: 0, target: 0, actual: 0, remaining: 0, category: 0, accrual: 0, vendor: 0, po: 0, quantity: 0, description: 0 };
  let textCompared = 0;
  const misses = [];
  for (const [k, a] of A) {
    const b = B.get(k);
    if (!b) { misses.push(`${k}: missing`); continue; }
    fields.matched++;
    const ok = { target: a.target === b.target, actual: a.act === b.act, remaining: a.remain === b.remain, category: a.cat === b.cat || a.n > 1, accrual: a.load === b.load || a.n > 1 };
    for (const [f2, v] of Object.entries(ok)) if (v) fields[f2]++;
    if (a.n === 1) {
      textCompared++;
      const x = a.rows[0], y = b.rows[0];
      const qty = (r) => (Number(r.target_qty) && (Number(r.target_qty) !== 1 || r.qty_name) ? `${Number(r.target_qty)} ${r.qty_name || ""}`.trim() : "");
      const t = { vendor: (x.vendor_name || "") === y.vendor_name, po: (x.po_number || "") === y.po_number, quantity: qty(x) === qty(y), description: (x.cost_descr || "").replace(/\s+/g, " ").trim() === y.cost_descr };
      for (const [f2, v] of Object.entries(t)) if (v) fields[f2]++;
      if (!Object.values(t).every(Boolean)) misses.push(`${k}: ${Object.entries(t).filter(([, v]) => !v).map(([f2]) => f2).join(", ")}`);
    }
    if (!Object.values(ok).every(Boolean)) misses.push(`${k}: ${Object.entries(ok).filter(([, v]) => !v).map(([f2]) => f2).join(", ")}`);
  }
  const extra = [...B.keys()].filter((k) => !A.has(k)).length;
  const sum = (rows, k) => rows.reduce((s, c) => s + c2(c[k]), 0);
  const row = {
    file: basename(f), project: conv.project.id, expenses: src.length, planted: planted ? src.length : 0, onActivities: planted, groups: A.size, merged: src.length - A.size,
    costResources: conv.counts.costResources, back: (back.xer.tables.PROJCOST || []).length, extra, ...fields, textCompared,
    totals: { target: [sum(src, "target_cost") / 100, sum(back.xer.tables.PROJCOST || [], "target_cost") / 100], actual: [sum(src, "act_cost") / 100, sum(back.xer.tables.PROJCOST || [], "act_cost") / 100], remaining: [sum(src, "remain_cost") / 100, sum(back.xer.tables.PROJCOST || [], "remain_cost") / 100] },
    problems: problems.length, misses: misses.slice(0, 10),
  };
  out.push(row);
  console.log(`${row.file}: ${row.expenses} expense(s)${planted ? ` planted on ${planted} activities` : ""} in ${row.groups} (activity, name) groups -> ${row.costResources} cost resources -> ${row.back} back; ` +
    `matched ${fields.matched}/${A.size}, target ${fields.target}, actual ${fields.actual}, remaining ${fields.remaining}, category ${fields.category}, accrual ${fields.accrual}; ` +
    `text on ${textCompared}: vendor ${fields.vendor}, PO ${fields.po}, quantity ${fields.quantity}, description ${fields.description}; extra ${extra}; P6 import problems ${problems.length}`);
  for (const m of misses.slice(0, 5)) console.log(`  ${m}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
