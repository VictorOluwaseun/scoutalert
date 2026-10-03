import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { WebDiscoveryView } from "@/features/discovery/discovery-view";
import { readWebDiscovery } from "@/server/api-client/scout-api";

export const metadata = { title: "Web discovery · ScoutAlert" };

/** Reads private account activity on the server; absent sessions and service failures never expose preview fixtures. */
export default async function DiscoveryPage() {
  const result = await readWebDiscovery();

  if (result.status === "signed_out") {
    redirect("/sign-in");
  }

  if (result.status === "ready") {
    return <WebDiscoveryView page={result.page} />;
  }

  return (
    <DashboardShell section="discovery">
      <div className="workspace-unavailable">
        <h1>We couldn’t load web discovery.</h1>
        <p>Your saved scouts are safe. Try again in a moment.</p>
        <Link className={buttonVariants()} href="/dashboard/discovery">
          Try again
        </Link>
      </div>
    </DashboardShell>
  );
}
