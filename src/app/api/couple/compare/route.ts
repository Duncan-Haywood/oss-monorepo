import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { actionableTop, asymmetries, compareRankings, coupleFor, rankingFor, sharedValues } from "@/lib/couples";

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

    return NextResponse.json({
      couple: { inviteCode: link.couple.inviteCode, partner: link.partner },
      fit: compareRankings(theirPartnerWant, mySelf),
      theirFit: compareRankings(myPartnerWant, theirSelf),
      mirror: compareRankings(myPartnerWant, theirPartnerWant),
      blindSpots: compareRankings(myGuess, theirPartnerWant),
      // The actually-usable outputs: what to do, what you share, and where
      // something matters far more to them than to you.
      makeThemHappy: actionableTop(theirPartnerWant),
      makeYouHappy: actionableTop(myPartnerWant),
      shared: sharedValues(myPartnerWant, theirPartnerWant),
      mattersMoreToThem: asymmetries(myPartnerWant, theirPartnerWant),
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
