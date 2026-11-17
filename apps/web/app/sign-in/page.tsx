import { connection } from "next/server";
import { SignIn } from "@/features/account/sign-in";
import { WebsitePreview } from "@/features/onboarding/website-preview";

export const metadata = { title: "Sign in · ScoutAlert" };

/** Keeps sign-in unavailable during website preview, then uses the shared inbox verification flow. */
export default async function SignInPage() {
  await connection();

  if (process.env.SCOUTALERT_WEBSITE_ONLY === "true") {
    return <WebsitePreview />;
  }

  return <SignIn />;
}
