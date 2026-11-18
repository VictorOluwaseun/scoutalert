import type { MetadataRoute } from "next";
import { publicSite } from "@/features/seo/site";

/** Lists the public onboarding entry; stateful steps and fictional examples are not search destinations. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${publicSite.url}/onboarding` }];
}
