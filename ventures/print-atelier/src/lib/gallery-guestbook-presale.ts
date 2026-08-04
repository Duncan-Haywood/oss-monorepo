/**
 * Automated Gallery Exhibition Guestbook Conversion & SMS Presale Invite Engine
 * 
 * Captures physical gallery visitor sign-ups, scores lead intent, assigns VIP presale cohorts,
 * and triggers automated SMS and email drops for limited edition print releases.
 */

export type GuestInterestLevel = "casual_observer" | "art_enthusiast" | "serious_collector";
export type VipCohort = "general_presale" | "silver_collector" | "vip_early_access";

export interface GuestbookEntry {
  guestId: string;
  guestName: string;
  email?: string;
  phoneNumber?: string;
  preferredMediums: string[]; // e.g. ["cotton_rag", "baryta", "canvas"]
  interestLevel: GuestInterestLevel;
  optedInSms: boolean;
  exhibitionSlug: string;
  visitedAt: number;
}

export interface GuestConversionResult {
  guestId: string;
  guestName: string;
  leadScore: number; // 0 - 100
  assignedVipCohort: VipCohort;
  generatedSmsInviteText?: string;
  generatedEmailSubject?: string;
  discountCode: string;
  notes: string[];
  processedAt: number;
}

export interface GuestbookCampaignSummary {
  totalGuests: number;
  smsOptInCount: number;
  smsOptInPercent: number;
  averageLeadScore: number;
  vipCohortBreakdown: Record<VipCohort, number>;
  exhibitionSlug: string;
}

let guestbookStore: Map<string, GuestConversionResult> = new Map();

/**
 * Scores physical gallery guestbook leads and constructs personalized SMS / email presale invites.
 */
export function processGuestbookEntry(entry: GuestbookEntry): GuestConversionResult {
  const { guestId, guestName, email, phoneNumber, preferredMediums, interestLevel, optedInSms, exhibitionSlug } = entry;
  const notes: string[] = [];

  let leadScore = 0;

  // Base interest level points
  if (interestLevel === "serious_collector") {
    leadScore += 50;
    notes.push("High intent: Serious collector profile (+50 pts).");
  } else if (interestLevel === "art_enthusiast") {
    leadScore += 30;
    notes.push("Moderate intent: Art enthusiast (+30 pts).");
  } else {
    leadScore += 10;
    notes.push("Base intent: Casual observer (+10 pts).");
  }

  // Medium preference points
  if (preferredMediums.length > 0) {
    leadScore += Math.min(20, preferredMediums.length * 10);
    notes.push(`Specific medium preferences (${preferredMediums.join(", ")}): +${Math.min(20, preferredMediums.length * 10)} pts.`);
  }

  // Channel opt-in points
  if (optedInSms && phoneNumber) {
    leadScore += 20;
    notes.push("High engagement channel: SMS opt-in verified (+20 pts).");
  }
  if (email) {
    leadScore += 10;
    notes.push("Email contact provided (+10 pts).");
  }

  // Assign VIP cohort based on lead score
  let assignedVipCohort: VipCohort = "general_presale";
  let discountCode = "GALLERY10";

  if (leadScore >= 75) {
    assignedVipCohort = "vip_early_access";
    discountCode = "VIPGALLERY20";
    notes.push("Assigned to Tier 1: VIP 24h Early Access Presale Cohort.");
  } else if (leadScore >= 45) {
    assignedVipCohort = "silver_collector";
    discountCode = "GALLERY15";
    notes.push("Assigned to Tier 2: Silver Collector 12h Early Access Cohort.");
  } else {
    notes.push("Assigned to Tier 3: General Presale Launch Cohort.");
  }

  // Generate SMS Invite
  let generatedSmsInviteText: string | undefined;
  if (optedInSms && phoneNumber) {
    const accessTime = assignedVipCohort === "vip_early_access" ? "24 hours early" : "12 hours early";
    generatedSmsInviteText = `Hi ${guestName}! Thank you for visiting the ${exhibitionSlug} exhibition. Your VIP presale pass is active! Access the drop ${accessTime} with code ${discountCode}: https://printatelier.com/drop/${exhibitionSlug}?code=${discountCode}`;
  }

  // Generate Email Subject
  let generatedEmailSubject: string | undefined;
  if (email) {
    const formattedExhibitionName = exhibitionSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    generatedEmailSubject = `Exclusive Presale Invitation: Limited Edition Prints from ${formattedExhibitionName}`;
  }

  const result: GuestConversionResult = {
    guestId,
    guestName,
    leadScore,
    assignedVipCohort,
    generatedSmsInviteText,
    generatedEmailSubject,
    discountCode,
    notes,
    processedAt: Date.now(),
  };

  guestbookStore.set(guestId, result);
  return result;
}

/**
 * Summarizes exhibition guestbook lead conversion metrics for gallery operators.
 */
export function summarizeExhibitionGuestbook(entries: GuestbookEntry[]): GuestbookCampaignSummary {
  const totalGuests = entries.length;
  if (totalGuests === 0) {
    return {
      totalGuests: 0,
      smsOptInCount: 0,
      smsOptInPercent: 0,
      averageLeadScore: 0,
      vipCohortBreakdown: { general_presale: 0, silver_collector: 0, vip_early_access: 0 },
      exhibitionSlug: "unknown",
    };
  }

  const exhibitionSlug = entries[0].exhibitionSlug;
  const vipCohortBreakdown: Record<VipCohort, number> = {
    general_presale: 0,
    silver_collector: 0,
    vip_early_access: 0,
  };

  let smsOptInCount = 0;
  let totalLeadScoreSum = 0;

  for (const entry of entries) {
    if (entry.optedInSms) smsOptInCount++;
    const res = processGuestbookEntry(entry);
    totalLeadScoreSum += res.leadScore;
    vipCohortBreakdown[res.assignedVipCohort] = (vipCohortBreakdown[res.assignedVipCohort] || 0) + 1;
  }

  return {
    totalGuests,
    smsOptInCount,
    smsOptInPercent: Math.round((smsOptInCount / totalGuests) * 1000) / 10,
    averageLeadScore: Math.round((totalLeadScoreSum / totalGuests) * 10) / 10,
    vipCohortBreakdown,
    exhibitionSlug,
  };
}

/**
 * Generates Convex Schema snippet for gallery_guestbook_conversions table.
 */
export function generateConvexGuestbookPresaleSchema(): string {
  return `
export const gallery_guestbook_conversions = defineTable({
  guestId: v.string(),
  guestName: v.string(),
  leadScore: v.number(),
  assignedVipCohort: v.string(),
  discountCode: v.string(),
  exhibitionSlug: v.string(),
  processedAt: v.number(),
}).index("by_exhibition", ["exhibitionSlug"])
  .index("by_cohort", ["assignedVipCohort"]);
`.trim();
}

/**
 * Retrieves cached guestbook conversion result by guest ID.
 */
export function getGuestbookConversion(guestId: string): GuestConversionResult | undefined {
  return guestbookStore.get(guestId);
}

/**
 * Clears in-memory guestbook store for testing.
 */
export function clearGuestbookStoreForTesting(): void {
  guestbookStore.clear();
}
