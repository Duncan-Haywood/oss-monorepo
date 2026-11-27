// FakeLlm handlers for the quotes module. The fake cover note restates only facts from the context,
// so it passes the same number-grounding check a real note must pass.
import type { FakeHandler } from "../../ports/fake-llm";

function fakeCoverNote(context: string): string {
  const lines = context.split("\n");
  const field = (label: string) =>
    lines.find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2) ?? "";
  const parts = lines.filter((l) => l.startsWith("Part ")).map((l) => l.slice(5).split(" - ")[0]);
  const lead = field("Lead time");
  const out = [
    `Hello ${field("Customer")},`,
    "",
    `Thanks for sending over ${parts.join(", ")}. Quote ${field("Quote number")} has pricing at each quantity you asked about.`,
  ];
  if (lead) out.push(`Lead time is ${lead}.`);
  out.push("", field("Shop"));
  return out.join("\n");
}

export const quoteFakeHandlers: Record<string, FakeHandler> = {
  "quote.cover_note": (req) => fakeCoverNote(req.context ?? ""),
};
