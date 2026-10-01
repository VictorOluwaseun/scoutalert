import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { readManagedScout } from "@/server/api-client/scout-api";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { EditScout } from "@/features/scouts/edit-scout";

export const metadata = { title: "Edit your scout · ScoutAlert" };

/** Loads owner-scoped state on the server; only a confirmed explicit save changes the scout. */
export default async function EditScoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await readManagedScout(id);

  if (result.status === "signed_out") {
    redirect("/sign-in");
  }

  if (result.status === "missing") {
    notFound();
  }

  if (result.status === "ready") {
    return (
      <DashboardShell account={result.account}>
        <EditScout
          key={`${result.scout.id}:${result.scout.version}`}
          scout={result.scout}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="workspace-unavailable">
        <h1>We couldn’t load this scout.</h1>
        <p>
          Your saved details are safe. Return to your dashboard and try again.
        </p>
        <Link className={buttonVariants()} href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </DashboardShell>
  );
}
