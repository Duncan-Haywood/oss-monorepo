/**
 * Room-by-room guided capture checklist for the concierge MVP (Phase 2).
 *
 * This codifies the "Guide" step of the 5-step workflow in STRATEGY.md
 * (Guide -> Enhance -> Polish -> Deliver -> Brand) into something a human
 * can literally run from during a concierge shoot, before any app exists.
 */

export type ShotSpec = {
  id: string;
  label: string;
  /** Camera guidance a non-professional can follow. */
  instructions: string;
  bracket: "single" | "hdr_3" | "hdr_5";
};

export type RoomChecklist = {
  id: string;
  room: string;
  /** Roughly how long this room should take, to hit the 30-minute target. */
  targetMinutes: number;
  shots: ShotSpec[];
};

export const captureChecklist: RoomChecklist[] = [
  {
    id: "exterior",
    room: "Exterior / curb appeal",
    targetMinutes: 6,
    shots: [
      {
        id: "ext-front",
        label: "Front elevation, straight-on",
        instructions:
          "Shoot from the sidewalk/street at standing height, phone vertical-locked. Wait for even light (avoid harsh midday shadow on the facade if possible).",
        bracket: "hdr_3",
      },
      {
        id: "ext-front-angle",
        label: "Front elevation, 3/4 angle",
        instructions: "Step to one side to show depth and the side yard/driveway.",
        bracket: "hdr_3",
      },
      {
        id: "ext-backyard",
        label: "Backyard / outdoor living",
        instructions: "Capture the full usable outdoor space; include patio, deck, or pool if present.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "living",
    room: "Living / great room",
    targetMinutes: 5,
    shots: [
      {
        id: "living-wide",
        label: "Wide corner shot",
        instructions:
          "Shoot from the room's furthest corner at roughly waist height to maximize perceived size; keep vertical lines straight (vertical lock on).",
        bracket: "hdr_5",
      },
      {
        id: "living-alt",
        label: "Opposite-corner alternate angle",
        instructions: "Second angle for MLS variety and to show any feature (fireplace, view, built-ins).",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "kitchen",
    room: "Kitchen",
    targetMinutes: 5,
    shots: [
      {
        id: "kitchen-wide",
        label: "Wide shot showing counters + appliances",
        instructions: "Clear counters of clutter first. Shoot from the entry point toward the far wall.",
        bracket: "hdr_5",
      },
      {
        id: "kitchen-island",
        label: "Island / eating area detail",
        instructions: "Only if the kitchen has an island or breakfast bar worth featuring.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "primary-bed",
    room: "Primary bedroom",
    targetMinutes: 3,
    shots: [
      {
        id: "pb-wide",
        label: "Wide shot from doorway or corner",
        instructions: "Make the bed, clear nightstands. Shoot to show the full footprint of the room.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "primary-bath",
    room: "Primary bathroom",
    targetMinutes: 2,
    shots: [
      {
        id: "pbath-wide",
        label: "Wide shot",
        instructions: "Close toilet lid, clear counters, wipe mirror/fixtures. Shoot from the doorway.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "secondary-rooms",
    room: "Secondary bedrooms / bathrooms",
    targetMinutes: 6,
    shots: [
      {
        id: "sec-wide",
        label: "One wide shot per additional room",
        instructions: "Same staging rules as primary rooms; repeat per remaining bed/bath.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "wrap",
    room: "Wrap-up",
    targetMinutes: 3,
    shots: [
      {
        id: "wrap-review",
        label: "Review all shots on-site before leaving",
        instructions:
          "Check for level horizons, no mirror reflections of the photographer, no pets/people in frame, before departing — re-shoots after leaving cost the 30-minute target.",
        bracket: "single",
      },
    ],
  },
];

export function totalTargetMinutes(): number {
  return captureChecklist.reduce((sum, room) => sum + room.targetMinutes, 0);
}
