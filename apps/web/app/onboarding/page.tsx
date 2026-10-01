import { Suspense } from "react";
import { OnboardingExperience } from "@/features/onboarding/onboarding-experience";

/** Keeps URL-driven onboarding in one client instance across step transitions. */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="scout-page" aria-busy="true" />}>
      <OnboardingExperience />
    </Suspense>
  );
}
