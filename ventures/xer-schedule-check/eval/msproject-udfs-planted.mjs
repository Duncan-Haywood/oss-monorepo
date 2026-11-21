// A planted XER for the UDF kinds no public file carries (cost, start date,
// integer and decimal side by side): writes eval/msproject-udfs-planted.xer
// from the example schedule, so eval/msproject-udfs.mjs and the MPXJ reader
// can check them like the public files.
//
//   node eval/msproject-udfs-planted.mjs <out-dir>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, xerText } from "../xer.mjs";
import { EXAMPLE_XER } from "../example.mjs";

const x = parseXer(EXAMPLE_XER);
const T = x.tables;
const kinds = [
  ["Claimed to date", "FT_MONEY", (i) => (1234.56 * (i + 1)).toFixed(2)],
  ["Retention", "FT_MONEY", (i) => (i % 3 ? String(-12.5 * i) : null)],
  ["Access from", "FT_START_DATE", (i) => `2026-04-${String(6 + i).padStart(2, "0")} 08:00`],
  ["Access until", "FT_END_DATE", (i) => `2026-06-${String(1 + i).padStart(2, "0")} 17:00`],
  ["Crew size", "FT_INT", (i) => String(2 + (i % 5))],
  ["Optimistic (days)", "FT_FLOAT_2_DECIMALS", (i) => String(1.25 + i)],
];
T.UDFTYPE = kinds.map(([label, type], k) => ({ udf_type_id: String(900 + k), table_name: "TASK", udf_type_name: `user_${k}`, udf_type_label: label, logical_data_type: type, super_flag: "N", disp_data_flag: "N" }));
T.UDFVALUE = [];
kinds.forEach(([, type, pick], k) => T.TASK.forEach((t, i) => {
  const v = pick(i);
  if (v === null) return;
  T.UDFVALUE.push({ udf_type_id: String(900 + k), fk_id: t.task_id, proj_id: t.proj_id, udf_date: type.includes("DATE") ? v : "", udf_number: type.includes("DATE") ? "" : v, udf_text: "", udf_code_id: "" });
}));
writeFileSync(join(process.argv[2] || ".", "msproject-udfs-planted.xer"), xerText(x));
console.log(T.UDFVALUE.length, "values in", kinds.length, "UDFs on", T.TASK.length, "activities");
