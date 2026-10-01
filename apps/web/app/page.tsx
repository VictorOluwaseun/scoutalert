import { redirect } from "next/navigation";

/** Sends the public entry URL to the canonical onboarding route. */
export default function Home() {
  redirect("/onboarding");
}
