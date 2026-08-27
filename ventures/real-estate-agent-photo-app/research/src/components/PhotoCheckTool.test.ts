import { photoReadErrorMessage, reportMarkdown } from "./PhotoCheckTool";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const message = photoReadErrorMessage(new Error("permission denied"));
assert(message.includes("Could not read the selected photos"), "read failure has an actionable heading");
assert(message.includes("permission denied"), "specific browser error is retained");
assert(message.includes("Try selecting them again"), "read failure explains recovery");

assert(
  photoReadErrorMessage("unknown failure") ===
    "Could not read the selected photos. The browser could not read one or more files. Try selecting them again.",
  "unknown failures get a safe fallback message",
);

const markdown = reportMarkdown({
  checkedAt: "2026-08-27T01:00:00.000Z",
  skipped: ["notes.txt"],
  reports: [
    {
      info: {
        name: "living-room.jpg",
        format: "jpeg",
        width: 3000,
        height: 2000,
        nbytes: 1200,
        unreadable: null,
      },
      findings: [{ rule: "long_edge", severity: "blocking", detail: "2048px under 3000" }],
    },
  ],
});
assert(markdown.includes("# Listing Lens photo preflight record"), "markdown is a dated evidence record");
assert(markdown.includes("2026-08-27T01:00:00.000Z"), "record carries the check timestamp");
assert(markdown.includes("living-room.jpg"), "record names the photo");
assert(markdown.includes("notes.txt"), "record lists skipped non-photos");
assert(!markdown.includes("<script>"), "record does not emit HTML");

console.log("PhotoCheckTool read-error tests passed");
