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

/**
 * What each bracket label actually means and how to shoot it on a normal
 * phone, in plain language. Added after an audit found the checklist used
 * "hdr_3"/"hdr_5" throughout without ever explaining them — fine for a
 * professional photographer, not for the zero-photography-background
 * shooter this concierge workflow actually targets (see STRATEGY.md).
 *
 * IMPORTANT: pipeline/'s coverage check (pipeline/src/coverage.ts) counts
 * exactly ONE output file per ShotSpec, not one per raw exposure. Bracketed
 * shots must be merged/selected down to a single best image BEFORE they go
 * into the pipeline/ input folder, or the shot count will look inflated
 * and throw off the coverage check.
 */
export const BRACKET_GUIDANCE: Record<ShotSpec["bracket"], { label: string; howTo: string }> = {
  single: {
    label: "Single exposure",
    howTo: "One normal photo. No special steps — just frame the shot per the instructions and tap to capture.",
  },
  hdr_3: {
    label: "3-exposure HDR",
    howTo:
      "Turn on your phone's built-in HDR/Smart HDR mode (iPhone: Camera app > HDR, usually automatic on recent models; Android: Camera app > More/Settings > HDR) and take the shot once — the phone captures and merges 3 exposures (dark/normal/bright) automatically into one photo. You do not need a tripod or manual bracketing app for this. Confirm only ONE merged photo lands in your camera roll for this shot before moving on.",
  },
  hdr_5: {
    label: "5-exposure HDR",
    howTo:
      "Same as 3-exposure HDR (turn on your phone's HDR mode and shoot once) — used for the room's hardest-to-balance shot (bright windows + dark interior), where you want the phone to lean on more merged exposure range. If your phone's HDR only offers a fixed 3-shot merge, that's fine; just make sure HDR is on and don't skip this shot. Still exactly ONE final photo per shot.",
  },
};

export type RoomChecklist = {
  id: string;
  room: string;
  /** Roughly how long this room should take, to hit the capture-time target. */
  targetMinutes: number;
  shots: ShotSpec[];
  /**
   * Set when this room represents one *additional* unit beyond the primary
   * (e.g. a 2nd/3rd bedroom, a 2nd/3rd bathroom), rather than a fixed,
   * once-per-shoot room. `shots`/`targetMinutes` describe the cost of ONE
   * such unit; the real per-shoot total scales with how many extra
   * bed/bathrooms the actual listing has. `typicalUnits` is only used for
   * the "typical home" default shown on the docs site and in pipeline/'s
   * coverage check when the real count isn't passed in.
   */
  perAdditionalUnit?: { typicalUnits: number };
};

export type PrepItem = {
  id: string;
  label: string;
  why: string;
};

/**
 * General home + equipment prep to do ONCE, before starting the
 * room-by-room checklist. Without this, a first-time shooter tends to
 * discover mid-shoot that a light was off, a car was in the driveway
 * shot, or their phone had no storage — each of which costs a re-shoot
 * trip, blowing the 30-minute-fix / same-day-turnaround promise in
 * STRATEGY.md and process/pricing-one-pager.tsx.
 */
export const preShootPrep: PrepItem[] = [
  {
    id: "prep-storage-battery",
    label: "Check your phone has 2+ GB free storage and 50%+ battery (or a charger on hand)",
    why: "A ~20-shot shoot with HDR brackets can be several hundred MB; running out mid-shoot means a second trip.",
  },
  {
    id: "prep-lights-on",
    label: "Turn on every light in the home, including closets and under-cabinet lighting",
    why: "Buyers read a well-lit home as larger and better maintained; mixed on/off lighting looks unfinished in photos.",
  },
  {
    id: "prep-blinds-open",
    label: "Open all blinds/curtains and clean visible windows",
    why: "Natural light plus a clean window reads better than closed blinds, and avoids streaky glare in the shot.",
  },
  {
    id: "prep-declutter",
    label: "Clear counters, floors, and visible surfaces of personal items, trash, and pet bowls/toys",
    why: "MLS photos should show the space, not the seller's belongings — this also matches the no-clutter reminders repeated per-room below.",
  },
  {
    id: "prep-vehicles-hoses",
    label: "Move cars out of the driveway/street in front of the house and coil up hoses/cords in the yard",
    why: "The exterior front-elevation shot is usually the single most-viewed photo on a listing; a car or hose in frame is the #1 preventable re-shoot cause.",
  },
  {
    id: "prep-fans-off",
    label: "Turn off ceiling fans",
    why: "A spinning fan blurs into a smear in most phone exposures, including HDR brackets.",
  },
  {
    id: "prep-toilet-lids",
    label: "Close all toilet lids and hide personal bathroom items",
    why: "Same declutter logic as above, called out separately because it is the most commonly forgotten single item.",
  },
  {
    id: "prep-camera-settings",
    label: "Set your phone camera to its highest resolution and turn ON grid lines (for level horizons/vertical lines)",
    why: "Higher resolution gives pipeline/'s enhancement step more to work with; grid lines make it easy to keep verticals straight without a tripod, which several shots below call for.",
  },
];

export const captureChecklist: RoomChecklist[] = [
  {
    id: "exterior",
    room: "Exterior / curb appeal",
    targetMinutes: 7,
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
      {
        id: "ext-entry-detail",
        label: "Front door / entry detail",
        instructions: "Close-up on the entry: door, house number, and any porch/landscaping detail.",
        bracket: "single",
      },
    ],
  },
  {
    id: "living",
    room: "Living / great room",
    targetMinutes: 6,
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
      {
        id: "living-feature",
        label: "Feature detail",
        instructions: "Close on the room's best feature: fireplace, view, built-ins, or architectural detail.",
        bracket: "single",
      },
    ],
  },
  {
    id: "dining",
    room: "Dining area",
    targetMinutes: 3,
    shots: [
      {
        id: "dining-wide",
        label: "Wide shot of the dining space",
        instructions: "Shoot to show the table fits the room and connects visually to the kitchen/living area.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "kitchen",
    room: "Kitchen",
    targetMinutes: 6,
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
      {
        id: "kitchen-detail",
        label: "Appliance / finish detail",
        instructions: "Close-up on a notable finish or appliance (range, counters, backsplash) buyers search for.",
        bracket: "single",
      },
    ],
  },
  {
    id: "primary-bed",
    room: "Primary bedroom",
    targetMinutes: 4,
    shots: [
      {
        id: "pb-wide",
        label: "Wide shot from doorway or corner",
        instructions: "Make the bed, clear nightstands. Shoot to show the full footprint of the room.",
        bracket: "hdr_3",
      },
      {
        id: "pb-closet",
        label: "Closet / storage detail",
        instructions: "Only if the closet is walk-in or a genuine selling point; tidy visible contents first.",
        bracket: "single",
      },
    ],
  },
  {
    id: "primary-bath",
    room: "Primary bathroom",
    targetMinutes: 3,
    shots: [
      {
        id: "pbath-wide",
        label: "Wide shot",
        instructions: "Close toilet lid, clear counters, wipe mirror/fixtures. Shoot from the doorway.",
        bracket: "hdr_3",
      },
      {
        id: "pbath-detail",
        label: "Vanity / tub-shower detail",
        instructions: "Close on the vanity or tub/shower if it's a double vanity, soaking tub, or walk-in shower.",
        bracket: "single",
      },
    ],
  },
  {
    id: "secondary-bedroom",
    room: "Secondary bedroom",
    targetMinutes: 2,
    perAdditionalUnit: { typicalUnits: 2 },
    shots: [
      {
        id: "sec-bed-wide",
        label: "Wide shot from doorway or corner",
        instructions: "Same staging rules as the primary bedroom; repeat once per additional bedroom.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "secondary-bathroom",
    room: "Secondary bathroom",
    targetMinutes: 1.5,
    perAdditionalUnit: { typicalUnits: 1 },
    shots: [
      {
        id: "sec-bath-wide",
        label: "Wide shot",
        instructions: "Same staging rules as the primary bathroom; repeat once per additional bathroom.",
        bracket: "hdr_3",
      },
    ],
  },
  {
    id: "flex-space",
    room: "Laundry / office / garage (if present)",
    targetMinutes: 2,
    shots: [
      {
        id: "flex-wide",
        label: "Wide shot of the flex space",
        instructions: "Only shoot spaces that are finished/usable and add selling value (laundry, home office, garage).",
        bracket: "single",
      },
    ],
  },
  {
    id: "wrap",
    room: "Wrap-up",
    targetMinutes: 2,
    shots: [
      {
        id: "wrap-review",
        label: "Review all shots on-site before leaving",
        instructions:
          "Check for level horizons, no mirror reflections of the photographer, no pets/people in frame, before departing — re-shoots after leaving cost the capture-time target.",
        bracket: "single",
      },
    ],
  },
];

/** Rooms that occur exactly once per shoot (i.e. not a per-additional-unit room). */
function fixedRooms(): RoomChecklist[] {
  return captureChecklist.filter((room) => room.id !== "wrap" && !room.perAdditionalUnit);
}

function perUnitRoom(id: "secondary-bedroom" | "secondary-bathroom"): RoomChecklist {
  const room = captureChecklist.find((r) => r.id === id);
  if (!room) throw new Error(`capture-checklist.ts: missing per-unit room "${id}"`);
  return room;
}

/**
 * Total distinct photo shots for a shoot, excluding the wrap-up review
 * (not a photo). `additionalBeds`/`additionalBaths` are bedrooms/bathrooms
 * BEYOND the primary suite already covered by `primary-bed`/`primary-bath`.
 * Defaults to each per-unit room's `typicalUnits` (a typical ~3-bed/2-bath
 * home) when omitted, matching STRATEGY.md's mid-market target listing.
 */
export function totalShotCount(additionalBeds?: number, additionalBaths?: number): number {
  const fixedCount = fixedRooms().reduce((sum, room) => sum + room.shots.length, 0);
  const beds = additionalBeds ?? perUnitRoom("secondary-bedroom").perAdditionalUnit!.typicalUnits;
  const baths = additionalBaths ?? perUnitRoom("secondary-bathroom").perAdditionalUnit!.typicalUnits;
  return fixedCount + beds * perUnitRoom("secondary-bedroom").shots.length + baths * perUnitRoom("secondary-bathroom").shots.length;
}

/**
 * Total target minutes for a shoot, on the same additional-bed/bath basis
 * as `totalShotCount`. Always includes the fixed rooms plus the wrap-up.
 */
export function totalTargetMinutes(additionalBeds?: number, additionalBaths?: number): number {
  const fixedMinutes = captureChecklist
    .filter((room) => !room.perAdditionalUnit)
    .reduce((sum, room) => sum + room.targetMinutes, 0);
  const beds = additionalBeds ?? perUnitRoom("secondary-bedroom").perAdditionalUnit!.typicalUnits;
  const baths = additionalBaths ?? perUnitRoom("secondary-bathroom").perAdditionalUnit!.typicalUnits;
  return (
    fixedMinutes +
    beds * perUnitRoom("secondary-bedroom").targetMinutes +
    baths * perUnitRoom("secondary-bathroom").targetMinutes
  );
}
