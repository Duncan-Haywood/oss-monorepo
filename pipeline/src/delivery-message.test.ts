/**
 * delivery-message.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises process/delivery-message.ts's pure deliveryMessageText().
 */

import { deliveryMessageText } from "../../process/delivery-message";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function run() {
  const withMicrosite = deliveryMessageText({
    listingAddress: "123 Main St",
    recipientName: "Jane",
    photoCount: 19,
    micrositeFilename: "index.html",
  });
  assert(withMicrosite.startsWith("Hi Jane —"), "should greet by name when recipientName is set");
  assert(withMicrosite.includes("123 Main St"), "should include the listing address");
  assert(withMicrosite.includes("19"), "should include the photo count");
  assert(withMicrosite.includes("index.html"), "should mention the microsite filename when set");
  assert(withMicrosite.includes("duncan.andrew.haywood@gmail.com"), "should include payment instructions");

  const withoutExtras = deliveryMessageText({
    listingAddress: "456 Oak Ave",
    photoCount: 21,
  });
  assert(withoutExtras.startsWith("Hi —"), "should use a generic greeting when recipientName is omitted");
  assert(!withoutExtras.includes("microsite"), "should omit the microsite line when micrositeFilename is unset");

  console.log("delivery-message.test.ts: all assertions passed");
}

run();
