import { describe, expect, it, vi } from "vitest";
import { GET as getSurvey } from "./[slug]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    survey: {
      findUnique: vi.fn(),
    },
  },
}));

describe("GET /api/surveys/[slug]", () => {
  it("returns survey details when slug exists", async () => {
    const mockSurvey = {
      id: "survey_1",
      slug: "behaviours",
      title: "Behaviours",
      description: "Survey on daily relationship behaviours",
    };
    vi.mocked(prisma.survey.findUnique).mockResolvedValue(
      mockSurvey as unknown as NonNullable<
        Awaited<ReturnType<typeof prisma.survey.findUnique>>
      >,
    );

    const req = new NextRequest("http://localhost/api/surveys/behaviours");
    const params = Promise.resolve({ slug: "behaviours" });
    const res = await getSurvey(req, { params });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.survey).toEqual(mockSurvey);
  });

  it("returns 404 when survey is not found", async () => {
    vi.mocked(prisma.survey.findUnique).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/surveys/nonexistent");
    const params = Promise.resolve({ slug: "nonexistent" });
    const res = await getSurvey(req, { params });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Survey not found");
  });

  it("returns 500 when database throws an exception", async () => {
    vi.mocked(prisma.survey.findUnique).mockRejectedValue(new Error("Database error"));

    const req = new NextRequest("http://localhost/api/surveys/behaviours");
    const params = Promise.resolve({ slug: "behaviours" });
    const res = await getSurvey(req, { params });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Could not load survey");
  });
});
