import type { MetadataRoute } from "next";

// Static, so the AWS build (aws/build.mjs, output: "export") can write it as a file.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
