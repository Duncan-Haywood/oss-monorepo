import { PrismaClient } from "@prisma/client";
import { SEED_SURVEYS } from "../src/lib/surveyData";

const prisma = new PrismaClient();

async function main() {
  for (const survey of SEED_SURVEYS) {
    const existing = await prisma.survey.upsert({
      where: { slug: survey.slug },
      update: { title: survey.title, description: survey.description },
      create: {
        slug: survey.slug,
        title: survey.title,
        description: survey.description,
      },
    });

    for (let i = 0; i < survey.items.length; i++) {
      const item = survey.items[i];
      await prisma.item.upsert({
        where: { surveyId_slug: { surveyId: existing.id, slug: item.slug } },
        update: { label: item.label, category: item.category, sortOrder: i },
        create: {
          surveyId: existing.id,
          slug: item.slug,
          label: item.label,
          category: item.category,
          sortOrder: i,
        },
      });
    }

    console.log(`Seeded survey "${survey.slug}" with ${survey.items.length} items`);
  }

  await prisma.survey.upsert({
    where: { slug: "financial" },
    update: {
      title: "Wealth & earnings situations",
      description: "Two financial situations, side by side — which is more attractive?",
      kind: "FINANCIAL",
    },
    create: {
      slug: "financial",
      title: "Wealth & earnings situations",
      description: "Two financial situations, side by side — which is more attractive?",
      kind: "FINANCIAL",
    },
  });
  console.log('Seeded survey "financial" (FINANCIAL, no fixed items)');

  await prisma.survey.upsert({
    where: { slug: "conjoined" },
    update: {
      title: "Who they are & what they have",
      description: "A person's pursuit plus their financial situation, compared side by side.",
      kind: "CONJOINED",
      identitySurveySlug: "combined",
    },
    create: {
      slug: "conjoined",
      title: "Who they are & what they have",
      description: "A person's pursuit plus their financial situation, compared side by side.",
      kind: "CONJOINED",
      identitySurveySlug: "combined",
    },
  });
  console.log('Seeded survey "conjoined" (CONJOINED, identity from "combined")');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
