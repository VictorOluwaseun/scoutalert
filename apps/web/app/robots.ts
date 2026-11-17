import type { MetadataRoute } from "next";
import { publicSite } from "@/features/seo/site";

/** Lets crawlers read page-level noindex directives while excluding API endpoints. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${publicSite.url}/sitemap.xml`,
  };
}
