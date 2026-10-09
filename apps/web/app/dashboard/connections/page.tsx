import Link from "next/link";
import { redirect } from "next/navigation";
import { MailConnections } from "@/features/connections/mail-connections";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { readMailConnections } from "@/server/api-client/scout-api";

export const metadata = { title: "Your connections · ScoutAlert" };

/** Server-renders owner-scoped connection state; no integration credential enters the component tree. */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const result = await readMailConnections();
  if (result.status === "signed_out") {
    redirect("/sign-in");
  }
  if (result.status !== "ready") {
    return (
      <DashboardShell section="connections">
        <div className="workspace-unavailable">
          <h1>We couldn’t load your connections.</h1>
          <p>Please try again in a moment.</p>
          <Link href="/dashboard/connections">Try again</Link>
        </div>
      </DashboardShell>
    );
  }
  const query = await searchParams;
  return (
    <DashboardShell account={result.page.account} section="connections">
      <MailConnections page={result.page} result={query.result} />
    </DashboardShell>
  );
}
