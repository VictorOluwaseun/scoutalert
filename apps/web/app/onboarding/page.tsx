import { Suspense } from "react";
import { connection } from "next/server";
import { OnboardingExperience } from "@/features/onboarding/onboarding-experience";
import { WebsitePreview } from "@/features/onboarding/website-preview";

/** Uses the runtime launch mode before mounting account-dependent onboarding. */
export default async function OnboardingPage() {
  await connection();

  if (process.env.SCOUTALERT_WEBSITE_ONLY === "true") {
    return <WebsitePreview />;
  }

  return (
    <Suspense fallback={<main className="scout-page" aria-busy="true" />}>
      <OnboardingExperience />
    </Suspense>
  );
}
