import { ChallengeView } from "@/components/ChallengeView";

export const metadata = {
  title: "Couple Challenge • Pairwise",
  description: "Compare your relationship values and priorities side-by-side in a double-date challenge.",
};

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ChallengeView code={code} />;
}
