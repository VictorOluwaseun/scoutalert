import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { OnboardingExperience } from "@/features/onboarding/onboarding-experience";
import { WebsitePreview } from "@/features/onboarding/website-preview";
import { publicSite } from "@/features/seo/site";
import { SiteStructuredData } from "@/features/seo/site-structured-data";

/** Indexes the public entry while excluding URLs that select draft, account, or saved-scout state. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const query = await searchParams;
  const isPublicEntry =
    query.step === undefined &&
    query.new === undefined &&
    query.scout === undefined;

  return {
    alternates: isPublicEntry ? { canonical: "/onboarding" } : undefined,
    robots: { index: isPublicEntry, follow: isPublicEntry },
    openGraph: {
      type: "website",
      siteName: publicSite.name,
      title: publicSite.title,
      description: publicSite.description,
      url: "/onboarding",
      locale: "en_US",
    },
  };
}

/** Uses the runtime launch mode before mounting account-dependent onboarding. */
export default async function OnboardingPage() {
  await connection();

  if (process.env.SCOUTALERT_WEBSITE_ONLY === "true") {
    return (
      <>
        <SiteStructuredData />
        <WebsitePreview />
      </>
    );
  }

  return (
    <>
      <SiteStructuredData />
      <Suspense fallback={<main className="scout-page" aria-busy="true" />}>
        <OnboardingExperience />
      </Suspense>
    </>
  );
}
