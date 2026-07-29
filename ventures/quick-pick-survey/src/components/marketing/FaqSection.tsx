"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "How does Pairwise uncover preferences I haven't explicitly stated?",
    answer:
      "When people answer explicit surveys ('Rate from 1 to 10 how much you value X'), they state social ideals rather than actual trade-off behavior. Pairwise presents forced binary micro-comparisons where every choice requires choosing one priority over another. Using Glicko-2 and Bradley-Terry statistical models, Pairwise calculates your true underlying rating hierarchy—including trade-offs you might never have articulated.",
  },
  {
    question: "How is Pairwise different from compatibility quizzes?",
    answer:
      "Most personality and compatibility quizzes assign arbitrary 'verdicts' or arbitrary labels (e.g., 'You are 82% compatible'). Pairwise gives zero verdicts and zero judgments. Instead, it provides actionable insights into your shared ground, key points of divergence, and places where your expectations for a partner differ from your self-values.",
  },
  {
    question: "How does Pairwise handle privacy between partners?",
    answer:
      "Your individual ratings belong strictly to you. In Couples Mode, ratings are computed independently. Partner comparison screens show aggregated overlap and conversation prompts—they never broadcast your raw vote history or force exposure of private choices.",
  },
  {
    question: "How many choices do I need to make before getting usable insights?",
    answer:
      "You will start seeing initial preference signals in as few as 5 to 10 picks. By 20 to 30 choices, the adaptive algorithm narrows the rating deviation (RD) significantly, producing high-confidence personal priority rankings.",
  },
  {
    question: "What math powers the rating system?",
    answer:
      "Discrete items (professions, hobbies, lifestyle choices) use Glicko-2—the rating system trusted by international chess organizations. Continuous variables (income, upside, work hours) use a Davidson tie-extended Bradley-Terry paired-comparison model with Newton-Raphson optimization for accurate confidence intervals.",
  },
  {
    question: "Can I use Pairwise as an individual, or is it only for couples?",
    answer:
      "Pairwise works fantastically for individuals exploring personal life goals, career choices, and self-understanding. Couples Mode adds an optional dual-perspective layer ('What I want' vs 'What I want in a partner') for couples who want to compare notes.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {FAQS.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-stone-200 bg-white transition-all dark:border-stone-800 dark:bg-stone-900/60"
          >
            <button
              type="button"
              onClick={() => toggleFaq(index)}
              className="flex w-full items-center justify-between p-5 text-left font-bold text-stone-900 dark:text-stone-100 sm:p-6"
              aria-expanded={isOpen}
            >
              <span className="pr-4 text-base sm:text-lg">{faq.question}</span>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ${
                  isOpen
                    ? "rotate-180 bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                    : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                }`}
              >
                ↓
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-stone-100 px-5 pb-6 pt-4 dark:border-stone-800 sm:px-6">
                <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                  {faq.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
