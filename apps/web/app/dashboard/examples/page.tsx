import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@repo/ui/components/icon";
import { DashboardShell } from "@/features/scouts/dashboard-shell";
import { OpportunityPreview } from "@/features/onboarding/components/opportunity-preview";
import { readScoutDashboard } from "@/server/api-client/scout-api";
import type { Category } from "@/features/onboarding/types";

export const metadata = { title: "Example opportunities · ScoutAlert" };

/** Keeps the fictional preview separate from account results and guards it with the same durable session. */
export default async function ExamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const result = await readScoutDashboard();
  if (result.status === "signed_out") redirect("/sign-in");
  if (result.status !== "ready") redirect("/dashboard");
  const query = await searchParams;
  const category: Category =
    query.category === "contracts" || query.category === "services"
      ? query.category
      : "employment";
  return (
    <DashboardShell account={result.page.account} examples>
      <div className="workspace-examples scout-page">
        <Link className="workspace-back" href="/dashboard">
          <Icon name="arrowLeft" size={19} />
          Back to my dashboard
        </Link>
        <OpportunityPreview draft={{ category }} guest={false} />
      </div>
    </DashboardShell>
  );
}
