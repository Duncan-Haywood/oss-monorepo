export type EvidenceCheck = {
  id: string;
  label: string;
  prompt: string;
};

export const EAA_PREAUDIT_CHECKS: EvidenceCheck[] = [
  { id: "scope", label: "Scope recorded", prompt: "Shop URL, legal entity, and review date are recorded." },
  { id: "obligation", label: "Obligation assessed", prompt: "Employee count and turnover bands are recorded; exemption is not assumed." },
  { id: "journeys", label: "Critical journeys listed", prompt: "At least checkout, account, contact, and search journeys are listed." },
  { id: "keyboard", label: "Keyboard pass", prompt: "Each critical journey can be completed without a mouse." },
  { id: "focus", label: "Focus is visible", prompt: "Keyboard focus remains visible on links, fields, buttons, and dialogs." },
  { id: "forms", label: "Form errors explained", prompt: "Errors identify the field and explain how to correct it." },
  { id: "names", label: "Controls have names", prompt: "Buttons, links, form fields, and images have understandable accessible names." },
  { id: "contrast", label: "Both colour schemes reviewed", prompt: "Light and dark modes are checked; contrast results include undecidable elements." },
  { id: "zoom", label: "Reflow checked", prompt: "The main journeys remain usable at 200% zoom and a narrow viewport." },
  { id: "screenreader", label: "Assistive technology pass", prompt: "A named screen reader and browser combination was used for the blocking paths." },
  { id: "evidence", label: "Evidence attached", prompt: "Screenshots, URLs, tool versions, and dates are attached to each finding." },
  { id: "open", label: "Open issues disclosed", prompt: "Unresolved findings, limitations, and the next owner are listed." },
];

export function checklistPercent(checkedIds: string[]): number {
  return Math.round((checkedIds.length / EAA_PREAUDIT_CHECKS.length) * 100);
}

export function checklistExport(checkedIds: string[], date = new Date().toISOString().slice(0, 10)): string {
  const checked = new Set(checkedIds);
  return [
    "Accessibility evidence pre-audit notes",
    `Prepared: ${date}`,
    "",
    ...EAA_PREAUDIT_CHECKS.map((item) => `${checked.has(item.id) ? "[x]" : "[ ]"} ${item.label}\n    ${item.prompt}`),
    "",
    "This is a preparation aid, not a compliance certificate or professional advice.",
  ].join("\n");
}
