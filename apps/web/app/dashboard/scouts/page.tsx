import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { ScoutCollection } from "@/features/scouts/scout-collection";
import { readScoutDashboard } from "@/server/api-client/scout-api";

export const metadata = { title: "Your scouts · ScoutAlert" };

/** Reads the existing owner-scoped catalog for scout management, preserving its cursor and session checks. */
export default async function ScoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string | string[]; updated?: string }>;
}) {
  const query = await searchParams;
  const after = typeof query.after === "string" ? query.after : undefined;
  const result = Array.isArray(query.after)
    ? { status: "invalid_cursor" as const }
    : await readScoutDashboard(after);

  if (result.status === "signed_out") {
    redirect("/sign-in");
  }

  if (result.status === "ready") {
    return (
      <DashboardShell account={result.page.account} section="scouts">
        <ScoutCollection
          page={result.page}
          olderPage={Boolean(after)}
          updated={query.updated === "1"}
        />
      </DashboardShell>
    );
  }

  const invalid = result.status === "invalid_cursor";

  return (
    <DashboardShell section="scouts">
      <div className="workspace-unavailable">
        <h1>
          {invalid
            ? "This page link is incomplete."
            : "We couldn’t load your scouts."}
        </h1>
        <p>
          {invalid
            ? "Return to your latest scouts to continue."
            : "Your saved scouts are safe. Try again in a moment."}
        </p>
        <Link className={buttonVariants()} href="/dashboard/scouts">
          {invalid ? "Show latest scouts" : "Try again"}
        </Link>
      </div>
    </DashboardShell>
  );
}
