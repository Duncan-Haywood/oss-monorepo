import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  actionableTop,
  asymmetries,
  categoryCompass,
  compareRankings,
  conversationStarters,
  coupleFor,
  coupleReadiness,
  coupleThemeInsights,
  dateNightIdeas,
  expressionProfiles,
  emotionalHarmonyIndex,
  stressCoRegulationProfile,
  energyPaceCompatibility,
  vulnerabilityBridge,
  growthAmbitionMatrix,
  type ExplainableInsight,
  microCommitments,
  rankingFor,
  sharedValues,
} from "@/lib/couples";

/**
 * The three comparisons worth showing a couple:
 *
 *  fit          — what THEY want in a partner  vs  what YOU want for yourself.
 *                 "Is who I'm becoming what they're actually drawn to?"
 *  mirror       — what YOU want in a partner   vs  what THEY want in a partner.
 *                 Shared taste; a conversation starter, not a scorecard.
 *  blindSpots   — your GUESS at what they want vs  what they actually want.
 *                 The sharpest one: not what you each want, but where
 *                 you're wrong about each other.
 *
 * Only aggregates cross the boundary — never the other person's raw answers.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const link = await coupleFor(user.id);
    if (!link) return NextResponse.json({ couple: null });
    if (!link.partner) {
      return NextResponse.json({
        couple: { inviteCode: link.couple.inviteCode, partner: null },
      });
    }

    const partnerId = link.partner.id;
    const [mySelf, myPartnerWant, myGuess, theirPartnerWant, theirSelf] = await Promise.all([
      rankingFor(user.id, "SELF"),
      rankingFor(user.id, "PARTNER"),
      rankingFor(user.id, "PARTNER_GUESS"),
      rankingFor(partnerId, "PARTNER"),
      rankingFor(partnerId, "SELF"),
    ]);

    const blindSpots = compareRankings(myGuess, theirPartnerWant);
    const mThemHappy = actionableTop(theirPartnerWant);
    const mMoreToThem = asymmetries(myPartnerWant, theirPartnerWant);
    const explainableInsights = [
      emotionalHarmonyIndex(myPartnerWant, theirPartnerWant),
      stressCoRegulationProfile(myPartnerWant, theirPartnerWant),
      energyPaceCompatibility(myPartnerWant, theirPartnerWant),
      vulnerabilityBridge(myPartnerWant, theirPartnerWant),
      growthAmbitionMatrix(myPartnerWant, theirPartnerWant),
    ].filter((insight): insight is ExplainableInsight => insight !== null);

    return NextResponse.json({
      couple: { inviteCode: link.couple.inviteCode, partner: link.partner },
      fit: compareRankings(theirPartnerWant, mySelf),
      theirFit: compareRankings(myPartnerWant, theirSelf),
      mirror: compareRankings(myPartnerWant, theirPartnerWant),
      blindSpots,
      // The actually-usable outputs: what to do, what you share, and where
      // something matters far more to them than to you.
      makeThemHappy: mThemHappy,
      makeYouHappy: actionableTop(myPartnerWant),
      shared: sharedValues(myPartnerWant, theirPartnerWant),
      mattersMoreToThem: mMoreToThem,
      categoryCompass: categoryCompass(myPartnerWant, theirPartnerWant),
      dateNightIdeas: dateNightIdeas(myPartnerWant, theirPartnerWant),
      conversationStarters: conversationStarters(blindSpots, mMoreToThem),
      expressionProfiles: expressionProfiles(myPartnerWant, theirPartnerWant),
      microCommitments: microCommitments(mThemHappy),
      semanticInsights: coupleThemeInsights(myPartnerWant, theirPartnerWant),
      explainableInsights,
      // Why any of the four above are empty, so the screen can say what it is
      // waiting for instead of silently dropping the sections.
      readiness: coupleReadiness(myPartnerWant, theirPartnerWant),
      counts: {
        mySelf: mySelf.size,
        myPartnerWant: myPartnerWant.size,
        myGuess: myGuess.size,
        theirPartnerWant: theirPartnerWant.size,
        theirSelf: theirSelf.size,
      },
    });
  } catch (err) {
    console.error("couple/compare failed", err);
    return NextResponse.json({ error: "Could not build the comparison." }, { status: 500 });
  }
}
