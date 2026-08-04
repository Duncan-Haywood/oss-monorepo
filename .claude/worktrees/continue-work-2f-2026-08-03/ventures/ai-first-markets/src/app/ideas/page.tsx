import { IdeaCard } from "@/components/IdeaCard";
import { getAllIdeas } from "@/lib/evaluation";

export default function IdeasIndexPage() {
  const ideas = getAllIdeas();

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-zinc-50">Business Ideas</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          {ideas.length} software-first, AI-first ideas evaluated for solo-founder
          viability. Ranked by path to $100k ARR.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} milestone="100k" />
        ))}
      </div>
    </div>
  );
}
