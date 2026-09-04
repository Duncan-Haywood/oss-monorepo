document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#calculator");
  const anchor = form?.elements.namedItem("fixedFee");
  if (!form || !anchor) return;
  for (const [name, labelText, value] of [
    ["returnFee", "Return handling / order ($)", "2.5"],
    ["restockFee", "Restocking / returned order ($)", "0.4"],
  ]) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.name = name;
    input.type = "number";
    input.value = value;
    input.step = ".01";
    input.min = "0";
    label.append(input);
    form.insertBefore(label, anchor.parentElement);
  }
});
