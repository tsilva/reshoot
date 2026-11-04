import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
    ...["privacy", "terms"].map((page) => ({
      url: `${SITE_URL}/${page}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
