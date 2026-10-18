import { calculate } from "./calc.mjs";

const form = document.querySelector("#calculator");
const output = document.querySelector("#output");

function renderWarnings() {
  if (!form || !output) return;
  output.querySelector("[data-input-warnings]")?.remove();
  const warnings = calculate(Object.fromEntries(new FormData(form)), false).warnings;
  if (!warnings.length) return;

  const box = document.createElement("div");
  box.dataset.inputWarnings = "true";
  box.className = "note";
  box.setAttribute("role", "alert");
  const heading = document.createElement("strong");
  heading.textContent = "Input warnings";
  const list = document.createElement("ul");
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    list.append(item);
  }
  box.append(heading, list);
  output.append(box);
}

if (form) {
  form.addEventListener("input", renderWarnings);
  form.addEventListener("submit", renderWarnings);
  renderWarnings();
}
