import { calculate } from "./calc.mjs";
import { exportCsv, exportJson } from "./export.mjs";
import { record } from "./usage.mjs";

const form = document.querySelector("#calculator");
const copy = document.querySelector("#copy");
if (form && copy) {
  const button = document.createElement("button");
  button.className = "secondary";
  button.type = "button";
  button.textContent = "Download CSV record";
  copy.after(button);
  button.addEventListener("click", () => {
    const result = calculate(Object.fromEntries(new FormData(form)));
    const blob = new Blob([exportCsv(result)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "3pl-quote-normalized.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    record("quote_csv_exported");
  });
  const jsonButton = document.createElement("button");
  jsonButton.className = "secondary";
  jsonButton.type = "button";
  jsonButton.textContent = "Download JSON record";
  button.after(jsonButton);
  jsonButton.addEventListener("click", () => {
    const result = calculate(Object.fromEntries(new FormData(form)));
    const blob = new Blob([exportJson(result)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "3pl-quote-normalized.json";
    link.click();
    URL.revokeObjectURL(link.href);
    record("quote_json_exported");
  });
}
