import { photoReadErrorMessage } from "./PhotoCheckTool";

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

console.log("PhotoCheckTool read-error tests passed");
