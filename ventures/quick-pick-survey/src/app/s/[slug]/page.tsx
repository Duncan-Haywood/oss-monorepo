import { SurveyRespondent } from "@/components/SurveyRespondent";

export const metadata = { title: "Quick pick", robots: { index: false, follow: false } };

export default async function SharedSurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SurveyRespondent slug={slug} />;
}
