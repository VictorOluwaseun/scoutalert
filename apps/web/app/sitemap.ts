import type { MetadataRoute } from "next";
import { publicSite } from "@/features/seo/site";

/** Lists only canonical public content; account flows and fictional examples are not search destinations. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${publicSite.url}/` }];
}
