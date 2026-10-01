import { SignIn } from "@/features/account/sign-in";

export const metadata = { title: "Sign in · ScoutAlert" };

/** Provides returning users with the same inbox verification as onboarding, independently of scout setup. */
export default function SignInPage() {
  return <SignIn />;
}
