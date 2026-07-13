/**
 * delivery-message.ts — the ready-to-send message for the moment a
 * concierge delivery is actually handed over.
 *
 * Same class of silent gap booking-link.ts and payment-collection.ts each
 * found and fixed: process/outreach-templates.ts covers getting booked,
 * payment-collection.ts covers how to pay, pipeline/src/microsite.ts covers
 * building a shareable gallery — but nothing ever combined them into what a
 * human actually types when a delivery is ready. Without this, "deliver
 * it" (p2-first-deliveries' doneWhen) meant improvising the handoff message
 * from scratch every time, including re-deriving the payment ask by hand.
 */

import { paymentInstructionsText } from "./payment-collection";

export type DeliveryMessageInput = {
  listingAddress: string;
  /** Agent's first name, if known — omit for a generic greeting. */
  recipientName?: string;
  photoCount: number;
  /** Filename of the generated microsite (e.g. "index.html"), if one was built for this delivery. */
  micrositeFilename?: string;
};

/** Ready-to-paste delivery handoff message: photos + optional microsite + payment ask + guarantee reminder. */
export function deliveryMessageText(input: DeliveryMessageInput): string {
  const greeting = input.recipientName ? `Hi ${input.recipientName} —` : "Hi —";
  const micrositeLine = input.micrositeFilename
    ? ` I've also included a shareable property microsite (${input.micrositeFilename}) with the same gallery — handy for texting a client a link directly.`
    : "";

  return (
    `${greeting} your ${input.listingAddress} photos are ready: ${input.photoCount} MLS-ready shots, ` +
    `delivered within 1 business day as promised.${micrositeLine} ${paymentInstructionsText()} ` +
    `If anything needs a re-shoot or a different edit, just reply — the redo is free on this first delivery. ` +
    `Thanks for trying Listing Lens!`
  );
}
