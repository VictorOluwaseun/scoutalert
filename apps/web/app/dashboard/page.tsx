import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { Dashboard } from "@/features/scouts/dashboard";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { readScoutDashboard } from "@/server/api-client/scout-api";

export const metadata = { title: "Your opportunities · ScoutAlert" };

/** Server-renders fresh account-owned records; expired sessions redirect before any personal data is presented. */
export default async function DashboardPage({
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
      <Dashboard
        page={result.page}
        olderPage={Boolean(after)}
        updated={query.updated === "1"}
        asOf={result.readAt}
      />
    );
  }

  const invalid = result.status === "invalid_cursor";

  return (
    <DashboardShell>
      <div className="workspace-unavailable">
        <p className="workspace-eyebrow">Your dashboard</p>
        <h1>
          {invalid
            ? "This page link is incomplete."
            : "We couldn’t load your scouts."}
        </h1>
        <p>
          {invalid
            ? "Return to your latest scouts to continue."
            : "Your saved scouts are safe. Please try again in a moment."}
        </p>
        <Link className={buttonVariants()} href="/dashboard">
          {invalid ? "Show latest scouts" : "Try again"}
        </Link>
      </div>
    </DashboardShell>
  );
}
